import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUnitDto, UpdateUnitDto } from './units.dto';

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Danh sách phẳng; giao diện tự dựng cây từ parentId. */
  list() {
    return this.prisma.unit.findMany({ orderBy: [{ parentId: 'asc' }, { name: 'asc' }] });
  }

  create(dto: CreateUnitDto) {
    return this.prisma.unit.create({ data: { ...dto, code: dto.code.toUpperCase() } });
  }

  async update(id: number, dto: UpdateUnitDto) {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) throw new NotFoundException('Không tìm thấy đơn vị');
    if (unit.parentId === null && (dto.isActive === false || dto.parentId !== undefined)) {
      throw new BadRequestException('Không thể ẩn hoặc chuyển đơn vị gốc');
    }
    if (dto.isActive === false) {
      // Ẩn đơn vị: phải chuyển hết cán bộ, ẩn hết đơn vị trực thuộc trước, để không ai mất đơn vị.
      const [users, children] = await Promise.all([
        this.prisma.user.count({ where: { unitId: id, isActive: true } }),
        this.prisma.unit.count({ where: { parentId: id, isActive: true } }),
      ]);
      if (users || children) {
        throw new BadRequestException(
          `Đơn vị còn ${users} cán bộ và ${children} đơn vị trực thuộc đang hoạt động; chuyển hoặc ẩn trước khi ẩn đơn vị`,
        );
      }
    }
    if (dto.parentId !== undefined && dto.parentId !== null) {
      if ((await this.descendantIds(id)).includes(dto.parentId)) {
        throw new BadRequestException('Không thể chuyển đơn vị vào chính nó hoặc đơn vị con của nó');
      }
    }
    return this.prisma.unit.update({ where: { id }, data: dto });
  }

  /** Mã đơn vị và toàn bộ đơn vị trực thuộc (đệ quy). Số đơn vị ít nên tải hết rồi duyệt trong bộ nhớ. */
  async descendantIds(unitId: number): Promise<number[]> {
    const units = await this.prisma.unit.findMany({ select: { id: true, parentId: true } });
    const children = new Map<number, number[]>();
    for (const u of units) {
      if (u.parentId === null) continue;
      children.set(u.parentId, [...(children.get(u.parentId) ?? []), u.id]);
    }
    const result: number[] = [];
    const queue = [unitId];
    while (queue.length) {
      const id = queue.shift()!;
      result.push(id);
      queue.push(...(children.get(id) ?? []));
    }
    return result;
  }
}
