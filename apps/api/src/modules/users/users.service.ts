import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { assertStrongPassword, hashPassword } from '../../common/password';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../auth/session.service';
import { UnitsService } from '../units/units.service';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './users.dto';

/** Chỉ trả các trường an toàn, không bao giờ trả passwordHash, totpSecret. */
const SAFE_FIELDS = {
  id: true,
  username: true,
  fullName: true,
  rank: true,
  position: true,
  email: true,
  role: true,
  unitId: true,
  isActive: true,
  totpEnabled: true,
  lastLoginAt: true,
  unit: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly units: UnitsService,
    private readonly sessions: SessionService,
  ) {}

  /** ADMIN, LEADER thấy toàn trường; UNIT_HEAD thấy đơn vị mình và trực thuộc (để giao việc). */
  async list(auth: AuthUser, query: ListUsersQuery) {
    const scope =
      auth.role === 'UNIT_HEAD' ? { unitId: { in: await this.units.descendantIds(auth.unitId) } } : {};
    return this.prisma.user.findMany({
      where: {
        AND: [
          scope,
          query.unitId ? { unitId: query.unitId } : {},
          query.q
            ? {
                OR: [
                  { fullName: { contains: query.q, mode: 'insensitive' } },
                  { username: { contains: query.q, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      },
      select: SAFE_FIELDS,
      orderBy: { fullName: 'asc' },
    });
  }

  async create(dto: CreateUserDto) {
    assertStrongPassword(dto.temporaryPassword);
    const { temporaryPassword, ...data } = dto;
    try {
      return await this.prisma.user.create({
        data: {
          ...data,
          username: data.username.toLowerCase(),
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
        },
        select: SAFE_FIELDS,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Tên đăng nhập đã tồn tại');
      }
      throw err;
    }
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: SAFE_FIELDS });
    if (dto.isActive === false || dto.role) await this.sessions.destroyAllForUser(id);
    return user;
  }

  async resetPassword(id: number, temporaryPassword: string) {
    assertStrongPassword(temporaryPassword);
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    await this.sessions.destroyAllForUser(id);
  }
}
