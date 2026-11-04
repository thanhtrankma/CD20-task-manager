/**
 * Khởi tạo dữ liệu ban đầu: đơn vị gốc + tài khoản quản trị.
 *   Dev:        npm run seed        (--demo: tài khoản mẫu; --showcase: thêm dữ liệu trình diễn)
 *   Production: docker compose exec api node dist/cli/seed.js
 * Đọc ADMIN_USERNAME, ADMIN_PASSWORD (và DEMO_PASSWORD khi --demo) từ biến môi trường.
 */
import '../env';
import type { Role } from '../generated/prisma/client';
import { createPrismaClient } from '../prisma/prisma.service';
import { hashPassword } from '../common/password';
import { SCHOOL_UNITS } from './school-units';
import { seedShowcase } from './showcase';

const prisma = createPrismaClient();

function strongPassword(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 10 || !/[a-zA-Z]/.test(value) || !/\d/.test(value)) {
    throw new Error(`${name} phải có ít nhất 10 ký tự, gồm cả chữ và số`);
  }
  return value;
}

async function upsertUnit(code: string, name: string, parentId?: number) {
  return prisma.unit.upsert({ where: { code }, update: {}, create: { code, name, parentId } });
}

async function upsertUser(
  username: string,
  fullName: string,
  role: Role,
  unitId: number,
  password: string,
  mustChangePassword: boolean,
  position?: string,
) {
  return prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      fullName,
      role,
      unitId,
      position,
      passwordHash: await hashPassword(password),
      mustChangePassword,
    },
  });
}

async function main() {
  const root = await upsertUnit('TRUONG', 'Nhà trường');
  const adminUsername = (process.env.ADMIN_USERNAME ?? 'admin').toLowerCase();
  await upsertUser(
    adminUsername,
    'Quản trị hệ thống',
    'ADMIN',
    root.id,
    strongPassword('ADMIN_PASSWORD'),
    true,
  );
  console.log(`✔ Đơn vị gốc và tài khoản quản trị "${adminUsername}" (phải đổi mật khẩu lần đầu)`);
  for (const u of SCHOOL_UNITS) await upsertUnit(u.code, u.name, root.id);
  console.log(`✔ ${SCHOOL_UNITS.length} đầu mối trực thuộc Nhà trường`);

  if (!process.argv.includes('--demo')) return;

  const demoPassword = strongPassword('DEMO_PASSWORD');
  const bgh = await upsertUnit('BGH', 'Ban Giám hiệu', root.id);
  const khoa = await upsertUnit('KCNTT', 'Khoa Công nghệ thông tin và Công nghệ may', root.id);
  const boMon = await upsertUnit('BM-MMT', 'Bộ môn Mạng máy tính', khoa.id);

  const leader = await upsertUser('lanhdao', 'Nguyễn Văn Thành', 'LEADER', bgh.id, demoPassword, false, 'Hiệu trưởng');
  await upsertUser('truongkhoa', 'Trần Văn Khoa', 'UNIT_HEAD', khoa.id, demoPassword, false, 'Trưởng khoa');
  const staff = await upsertUser('canbo', 'Lê Thị Hà', 'STAFF', boMon.id, demoPassword, false, 'Giảng viên');

  if ((await prisma.task.count()) === 0) {
    await prisma.task.create({
      data: {
        title: 'Rà soát chương trình đào tạo ngành Mạng máy tính',
        description: 'Đối chiếu chuẩn đầu ra, đề xuất điều chỉnh học phần.',
        dueDate: new Date(Date.now() + 7 * 86_400_000),
        priority: 'HIGH',
        createdById: leader.id,
        assignees: { create: [{ unitId: khoa.id, role: 'LEAD' }, { userId: staff.id, role: 'SUPPORT' }] },
      },
    });
  }
  console.log('✔ Dữ liệu mẫu: lanhdao (LEADER), truongkhoa (UNIT_HEAD), canbo (STAFF), mật khẩu = DEMO_PASSWORD');

  if (process.argv.includes('--showcase')) await seedShowcase(prisma, demoPassword);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
