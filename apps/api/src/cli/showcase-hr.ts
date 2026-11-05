/**
 * Dữ liệu trình diễn nghỉ phép, chấm công (npm run seed:demo): mã chấm công, đối tượng, lượt chấm từ đầu tháng trước
 * đến hôm qua (vài lần đi muộn, về sớm, thiếu chấm, vắng), đơn nghỉ ở các trạng thái, một cán bộ phụ trách nhân sự.
 * Toàn bộ là dữ liệu giả định. Chạy lại không tạo trùng.
 */
import type { DayPart, LeaveStatus } from '../generated/prisma/client';
import { hashPassword } from '../common/password';
import { addDays, dateOf, eachDay, isoWeekday, localDayStart, today } from '../common/dates';
import { countLeaveDays, leavePartOn, workdayChecker } from '../modules/hr/leave-days';
import type { createPrismaClient } from '../prisma/prisma.service';

type Db = ReturnType<typeof createPrismaClient>;

/** Số giả ngẫu nhiên cố định theo chuỗi (chạy lại ra cùng kết quả). */
function rand(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Ngày làm việc thứ n kể từ hôm nay (âm: đã qua), bỏ thứ Bảy, Chủ nhật. */
function workday(n: number) {
  let d = today();
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0; ) {
    d = addDays(d, step);
    if (isoWeekday(d) <= 5) left--;
  }
  return d;
}

interface LeaveSpec {
  user: string;
  type: string;
  start: number;
  end: number;
  startPart?: DayPart;
  endPart?: DayPart;
  reason: string;
  status: LeaveStatus;
  note?: string;
}

const LEAVES: LeaveSpec[] = [
  { user: 'canbo', type: 'PHEP_NAM', start: -12, end: -11, reason: 'Về quê giải quyết việc gia đình', status: 'APPROVED' },
  { user: 'canbo2', type: 'OM', start: -6, end: -6, startPart: 'MORNING', reason: 'Khám bệnh tại Bệnh viện Quân y', status: 'APPROVED' },
  { user: 'canbo2', type: 'PHEP_NAM', start: 3, end: 4, reason: 'Đưa con đi nhập học', status: 'PENDING_UNIT' },
  { user: 'truongphongdt', type: 'PHEP_NAM', start: 6, end: 10, reason: 'Nghỉ phép năm, về thăm gia đình', status: 'PENDING_LEADER' },
  { user: 'canbodt', type: 'VIEC_RIENG', start: -3, end: -3, reason: 'Việc riêng', status: 'REJECTED', note: 'Trùng lịch thi kết thúc học phần, đề nghị chuyển ngày khác' },
  { user: 'truongkhoakt', type: 'PHEP_NAM', start: 1, end: 1, startPart: 'AFTERNOON', reason: 'Việc gia đình', status: 'PENDING_LEADER' },
];

const CATEGORY: Record<string, string> = {
  lanhdao: 'Sĩ quan',
  phohieutruong: 'Sĩ quan',
  truongkhoa: 'Sĩ quan',
  canbo: 'Quân nhân chuyên nghiệp',
  canbo2: 'Công nhân viên quốc phòng',
  canbodt: 'Lao động hợp đồng',
  canbonhansu: 'Quân nhân chuyên nghiệp',
};

export async function seedShowcaseHr(prisma: Db, password: string) {
  if (await prisma.attendancePunch.count()) {
    console.log('✔ Dữ liệu trình diễn nghỉ phép, chấm công đã có, bỏ qua');
    return;
  }
  const pct = await prisma.unit.findUnique({ where: { code: 'PCT' } });
  if (pct) {
    await prisma.user.upsert({
      where: { username: 'canbonhansu' },
      update: { hrManager: true },
      create: {
        username: 'canbonhansu',
        fullName: 'Nguyễn Thị Thanh',
        role: 'STAFF',
        position: 'Trợ lý cán bộ',
        unitId: pct.id,
        hrManager: true,
        passwordHash: await hashPassword(password),
        mustChangePassword: false,
      },
    });
  }

  const categories = new Map((await prisma.staffCategory.findMany()).map((c) => [c.name, c.id]));
  const users = await prisma.user.findMany({ where: { role: { not: 'ADMIN' }, isActive: true }, orderBy: { id: 'asc' } });
  const uid = new Map(users.map((u) => [u.username, u]));
  for (const [i, u] of users.entries()) {
    await prisma.user.update({
      where: { id: u.id },
      data: {
        attendanceCode: u.attendanceCode ?? String(101 + i),
        staffCategoryId: u.staffCategoryId ?? categories.get(CATEGORY[u.username] ?? 'Sĩ quan') ?? null,
      },
    });
  }

  const types = new Map((await prisma.leaveType.findMany()).map((t) => [t.code, t.id]));
  const parent = new Map((await prisma.unit.findMany()).map((u) => [u.id, u.parentId]));
  /** Chỉ huy duyệt cấp 1 như khi gửi đơn thật: đơn vị mình, không có thì đơn vị cấp trên (dưới cấp nhà trường). */
  const headOf = (u: (typeof users)[number]) => {
    if (u.role === 'LEADER') return undefined;
    for (let unit: number | null | undefined = u.unitId; unit != null && parent.get(unit) != null; unit = parent.get(unit)) {
      const h = users.find((x) => x.role === 'UNIT_HEAD' && x.unitId === unit && x.id !== u.id);
      if (h) return h;
    }
    return undefined;
  };
  const isWorkday = workdayChecker([1, 2, 3, 4, 5], new Set<string>());
  const leaves: { userId: number; span: { start: string; end: string; startPart: DayPart; endPart: DayPart } }[] = [];
  for (const l of LEAVES) {
    const u = uid.get(l.user);
    if (!u) continue;
    const start = workday(l.start);
    const end = workday(l.end);
    const startPart = l.startPart ?? 'FULL';
    const span = { start, end, startPart, endPart: start === end ? startPart : (l.endPart ?? 'FULL') };
    const head = headOf(u);
    const leader = users.find((x) => x.role === 'LEADER' && x.id !== u.id);
    const days = countLeaveDays(span, isWorkday);
    const decided = new Date(localDayStart(addDays(start, -2)).getTime() + 9 * 3_600_000);
    await prisma.leaveRequest.create({
      data: {
        userId: u.id,
        typeId: types.get(l.type)!,
        startDate: dateOf(start),
        endDate: dateOf(end),
        startPart: span.startPart,
        endPart: span.endPart,
        days,
        reason: l.reason,
        status: l.status,
        approverUnitId: head?.unitId ?? null,
        needsLeader: !head || days > 3,
        ...(head && l.status !== 'PENDING_UNIT' ? { unitDecidedById: head.id, unitDecidedAt: decided } : {}),
        ...(!head && ['APPROVED', 'REJECTED'].includes(l.status) ? { leaderDecidedById: leader?.id, leaderDecidedAt: decided } : {}),
        decisionNote: l.note,
        createdAt: new Date(decided.getTime() - 86_400_000),
      },
    });
    if (l.status === 'APPROVED') leaves.push({ userId: u.id, span });
  }

  // Lượt chấm: từ đầu tháng trước đến hôm qua, ngày làm việc. Phần lớn đúng giờ, một ít muộn, sớm, thiếu, vắng.
  const now = today();
  const from = `${addDays(`${now.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
  const punches: { code: string; punchedAt: Date; userId: number }[] = [];
  const coded = await prisma.user.findMany({ where: { attendanceCode: { not: null } }, select: { id: true, attendanceCode: true } });
  for (const u of coded) {
    for (const day of eachDay(from, addDays(now, -1))) {
      if (!isWorkday(day)) continue;
      const part = leaves.filter((l) => l.userId === u.id).map((l) => leavePartOn(l.span, day)).find(Boolean);
      if (part === 'FULL') continue;
      const r = rand(`${u.id}|${day}`);
      if (r < 0.015) continue; // vắng
      const base = localDayStart(day).getTime();
      const t = (min: number) => new Date(base + min * 60_000 + Math.floor(rand(`${u.id}|${day}|${min}`) * 50) * 1000);
      const inMin = part === 'MORNING' ? 13 * 60 + 15 : r < 0.08 ? 7 * 60 + 38 + Math.floor(r * 300) : 7 * 60 + 8 + Math.floor(r * 210) % 21;
      const outMin = part === 'AFTERNOON' ? 11 * 60 + 35 : r > 0.95 ? 15 * 60 + 50 : 16 * 60 + 32 + Math.floor(r * 970) % 30;
      punches.push({ code: u.attendanceCode!, punchedAt: t(inMin), userId: u.id });
      if (r < 0.06 && r > 0.04) continue; // quên chấm ra
      punches.push({ code: u.attendanceCode!, punchedAt: t(outMin), userId: u.id });
    }
  }
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const hr = uid.get('canbonhansu') ?? (await prisma.user.findUnique({ where: { username: 'canbonhansu' } }));
  const imp = await prisma.attendanceImport.create({
    data: {
      fileName: `attlog-${now.slice(0, 7)}.dat`,
      uploadedById: hr?.id ?? admin!.id,
      total: punches.length,
      inserted: punches.length,
      duplicates: 0,
      unmatched: 3,
      rangeFrom: punches.reduce((a, p) => (p.punchedAt < a ? p.punchedAt : a), punches[0].punchedAt),
      rangeTo: punches.reduce((a, p) => (p.punchedAt > a ? p.punchedAt : a), punches[0].punchedAt),
    },
  });
  await prisma.attendancePunch.createMany({ data: punches.map((p) => ({ ...p, importId: imp.id })), skipDuplicates: true });
  // Mã chưa ghép: người mới chưa được khai báo trên hệ thống.
  const stray = workday(-2);
  await prisma.attendancePunch.createMany({
    data: [7 * 60 + 20, 16 * 60 + 40, 7 * 60 + 25].map((m, i) => ({
      code: i < 2 ? '901' : '902',
      punchedAt: new Date(localDayStart(stray).getTime() + m * 60_000),
      importId: imp.id,
    })),
    skipDuplicates: true,
  });
  console.log(`✔ Nghỉ phép, chấm công trình diễn: ${coded.length} mã, ${punches.length} lượt chấm, ${LEAVES.length} đơn nghỉ`);
  console.log('  Phụ trách nhân sự: canbonhansu (mật khẩu = DEMO_PASSWORD)');
}
