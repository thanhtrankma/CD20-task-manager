import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { assertStrongPassword, hashPassword } from '../../common/password';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../auth/session.service';
import { UnitsService } from '../units/units.service';
import { CreateUserDto, ImportUserRow, ListUsersQuery, UpdateUserDto } from './users.dto';

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
  lockedUntil: true,
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
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true } });
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: SAFE_FIELDS });
    // Khóa tài khoản hoặc đổi vai trò: đăng xuất mọi nơi (sửa thông tin khác thì không).
    if (dto.isActive === false || (dto.role && dto.role !== before.role)) await this.sessions.destroyAllForUser(id);
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

  /** Mở khóa tài khoản bị khóa tạm do nhập sai mật khẩu nhiều lần. */
  async unlock(id: number) {
    await this.prisma.user.update({ where: { id }, data: { failedLogins: 0, lockedUntil: null } });
  }

  /**
   * Đặt lại xác thực hai lớp khi cán bộ mất, đổi điện thoại: xóa khóa OTP, thu hồi mọi phiên.
   * Vai trò bắt buộc 2FA sẽ phải bật lại ở lần đăng nhập sau.
   */
  async resetTwoFactor(id: number) {
    await this.prisma.user.update({ where: { id }, data: { totpEnabled: false, totpSecret: null } });
    await this.sessions.destroyAllForUser(id);
  }

  /**
   * Nhập nhiều tài khoản từ tệp Excel: kiểm tra hết trước, có lỗi thì không tạo tài khoản nào.
   * Mỗi tài khoản nhận mật khẩu tạm ngẫu nhiên (chỉ trả về một lần để quản trị phát cho từng người),
   * phải đổi ở lần đăng nhập đầu.
   */
  async importMany(rows: ImportUserRow[]) {
    const units = await this.prisma.unit.findMany({ where: { isActive: true }, select: { id: true, code: true } });
    const unitByCode = new Map(units.map((u) => [u.code.toUpperCase(), u.id]));
    const usernames = rows.map((r) => r.username.toLowerCase());
    const taken = new Set(
      (await this.prisma.user.findMany({ where: { username: { in: usernames } }, select: { username: true } })).map(
        (u) => u.username,
      ),
    );

    const errors: { row: number; message: string }[] = [];
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const row = i + 2; // Dòng 1 của tệp là tiêu đề
      const username = r.username.toLowerCase();
      if (taken.has(username)) errors.push({ row, message: `Tên đăng nhập "${username}" đã tồn tại` });
      if (seen.has(username)) errors.push({ row, message: `Tên đăng nhập "${username}" bị trùng trong tệp` });
      if (!unitByCode.has(r.unitCode.toUpperCase())) errors.push({ row, message: `Không có đơn vị mã "${r.unitCode}"` });
      seen.add(username);
    });
    if (errors.length) throw new BadRequestException({ message: 'Tệp có lỗi, chưa tạo tài khoản nào', errors });

    const created = await Promise.all(
      rows.map(async (r) => {
        const temporaryPassword = generateTemporaryPassword();
        return {
          temporaryPassword,
          data: {
            username: r.username.toLowerCase(),
            fullName: r.fullName.trim(),
            unitId: unitByCode.get(r.unitCode.toUpperCase())!,
            role: r.role,
            rank: r.rank,
            position: r.position,
            email: r.email?.toLowerCase(),
            passwordHash: await hashPassword(temporaryPassword),
            mustChangePassword: true,
          },
        };
      }),
    );
    await this.prisma.user.createMany({ data: created.map((c) => c.data) });
    return {
      created: created.map((c) => ({
        username: c.data.username,
        fullName: c.data.fullName,
        temporaryPassword: c.temporaryPassword,
      })),
    };
  }
}

/** Mật khẩu tạm 12 ký tự, bỏ các ký tự dễ nhầm (0/O, 1/l/I), luôn có chữ và số. */
function generateTemporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
  while (chars.length < 12) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
