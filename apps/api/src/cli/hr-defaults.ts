/**
 * Danh mục mặc định cho nghỉ phép, chấm công: đối tượng, loại nghỉ, ca làm việc, ngày lễ dương lịch, ngưỡng duyệt.
 * Chạy lại không ghi đè chỉnh sửa của cán bộ phụ trách. Số ngày phép mặc định chờ nhà trường xác nhận.
 */
import type { createPrismaClient } from '../prisma/prisma.service';

type Db = ReturnType<typeof createPrismaClient>;

export const STAFF_CATEGORIES: [name: string, annualDays: number][] = [
  ['Sĩ quan', 12],
  ['Quân nhân chuyên nghiệp', 12],
  ['Công nhân viên quốc phòng', 12],
  ['Lao động hợp đồng', 12],
];

export const LEAVE_TYPES: [code: string, name: string, deductsBalance: boolean][] = [
  ['PHEP_NAM', 'Phép năm', true],
  ['OM', 'Nghỉ ốm', false],
  ['VIEC_RIENG', 'Việc riêng có hưởng lương', false],
  ['KHONG_LUONG', 'Không hưởng lương', false],
  ['NGHI_BU', 'Nghỉ bù', false],
];

/** Ngày lễ dương lịch cố định; Tết Nguyên đán, Giỗ Tổ (âm lịch) cán bộ phụ trách nhập hằng năm. */
const FIXED_HOLIDAYS: [mmdd: string, name: string][] = [
  ['01-01', 'Tết Dương lịch'],
  ['04-30', 'Ngày Chiến thắng'],
  ['05-01', 'Ngày Quốc tế Lao động'],
  ['09-02', 'Quốc khánh'],
];

export const LEAVE_ESCALATE_DAYS = 'leaveEscalateDays';

export async function seedHrDefaults(prisma: Db) {
  for (const [i, [name, annualDays]] of STAFF_CATEGORIES.entries()) {
    await prisma.staffCategory.upsert({ where: { name }, update: {}, create: { name, annualDays, sortOrder: i } });
  }
  for (const [i, [code, name, deductsBalance]] of LEAVE_TYPES.entries()) {
    await prisma.leaveType.upsert({ where: { code }, update: {}, create: { code, name, deductsBalance, sortOrder: i } });
  }
  if (!(await prisma.workShift.count())) {
    await prisma.workShift.create({
      // Ca 1: 07:00–11:00, ca 2: 13:30–17:30, ca 3 làm thêm từ 17:30 (tính khi từ 30 phút).
      data: {
        name: 'Giờ hành chính',
        startTime: '07:00',
        breakStart: '11:00',
        breakEnd: '13:30',
        endTime: '17:30',
        overtimeEnabled: true,
        overtimeMinMinutes: 30,
        isDefault: true,
      },
    });
  }
  const year = new Date().getFullYear();
  for (const y of [year, year + 1]) {
    for (const [mmdd, name] of FIXED_HOLIDAYS) {
      const date = new Date(`${y}-${mmdd}T00:00:00Z`);
      await prisma.holiday.upsert({ where: { date }, update: {}, create: { date, name } });
    }
  }
  await prisma.appSetting.upsert({ where: { key: LEAVE_ESCALATE_DAYS }, update: {}, create: { key: LEAVE_ESCALATE_DAYS, value: 3 } });
  console.log('✔ Danh mục nghỉ phép, chấm công mặc định (đối tượng, loại nghỉ, ca làm việc, ngày lễ)');
}
