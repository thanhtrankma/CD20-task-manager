/**
 * Dữ liệu trình diễn (npm run seed:demo): chỉ huy 14 đầu mối, nhiệm vụ ở các trạng thái, trò chuyện.
 * Toàn bộ là dữ liệu giả định, chỉ dùng trên máy chạy thử. Chạy lại không tạo trùng.
 */
import type { AssigneeRole, Priority, Role, TaskActivityType, TaskStatus } from '../generated/prisma/client';
import { hashPassword } from '../common/password';
import type { createPrismaClient } from '../prisma/prisma.service';

type Db = ReturnType<typeof createPrismaClient>;

const PEOPLE: [username: string, fullName: string, role: Role, unit: string, position: string][] = [
  ['phohieutruong', 'Trần Quốc Hưng', 'LEADER', 'BGH', 'Phó Hiệu trưởng'],
  ['truongphongct', 'Lê Minh Tuấn', 'UNIT_HEAD', 'PCT', 'Trưởng phòng'],
  ['truongphongdt', 'Phạm Thị Hương', 'UNIT_HEAD', 'PDT', 'Trưởng phòng'],
  ['truongphonghc', 'Hoàng Văn Nam', 'UNIT_HEAD', 'PHCKT', 'Trưởng phòng'],
  ['truongbankt', 'Vũ Thị Lan', 'UNIT_HEAD', 'BKT', 'Trưởng ban'],
  ['truongbanhc', 'Đỗ Văn Quang', 'UNIT_HEAD', 'BHC', 'Trưởng ban'],
  ['truongbantc', 'Ngô Thị Thu', 'UNIT_HEAD', 'BTC', 'Trưởng ban'],
  ['truongkhoakt', 'Bùi Văn Long', 'UNIT_HEAD', 'KKTKT', 'Trưởng khoa'],
  ['truongkhoadien', 'Đặng Văn Hải', 'UNIT_HEAD', 'KDIEN', 'Trưởng khoa'],
  ['truongkhoack', 'Phan Văn Dũng', 'UNIT_HEAD', 'KCKDL', 'Trưởng khoa'],
  ['giamdoctt1', 'Lý Văn Sơn', 'UNIT_HEAD', 'TTSH1', 'Giám đốc'],
  ['giamdoctt2', 'Trịnh Văn Phúc', 'UNIT_HEAD', 'TTSH2', 'Giám đốc'],
  ['giamdoctt3', 'Mai Văn Tiến', 'UNIT_HEAD', 'TTSH3', 'Giám đốc'],
  ['canbo2', 'Nguyễn Văn Đức', 'STAFF', 'KCNTT', 'Giảng viên'],
  ['canbodt', 'Trần Thị Ngọc', 'STAFF', 'PDT', 'Trợ lý đào tạo'],
];

const KHOA = ['KKTKT', 'KDIEN', 'KCKDL', 'KCNTT'];
const ALL_UNITS = ['PCT', 'PDT', 'PHCKT', 'BHC', 'BTC', ...KHOA, 'TTSH1', 'TTSH2', 'TTSH3'];

interface Spec {
  by: string;
  title: string;
  description?: string;
  source?: string;
  priority?: Priority;
  /** Số ngày so với hôm nay (âm: đã qua). */
  created: number;
  due: number;
  status: TaskStatus;
  progress?: number;
  completed?: number;
  /** ack: người xác nhận đã nhận (chỉ huy đơn vị hoặc chính cá nhân được giao). */
  assignees: { unit?: string; user?: string; role?: AssigneeRole; ack?: string }[];
  followers?: string[];
  updates?: { by: string; at: number; progress: number; note: string }[];
  submission?: {
    by: string;
    at: number;
    content: string;
    review?: { decision: 'APPROVED' | 'RETURNED'; at: number; note?: string };
  };
  extension?: { by: string; at: number; due: number; reason: string };
  comments?: { by: string; at: number; content: string }[];
  children?: Spec[];
}

const TASKS: Spec[] = [
  {
    by: 'lanhdao',
    title: 'Xây dựng kế hoạch đào tạo học kỳ II năm học 2026 - 2027',
    description: 'Tổng hợp nhu cầu, kế hoạch giảng dạy của các khoa; dự kiến thời khóa biểu, phân công giáo viên.',
    source: 'Kết luận giao ban Ban Giám hiệu ngày 02/11/2026',
    priority: 'HIGH',
    created: -1.2,
    due: 12,
    status: 'IN_PROGRESS',
    progress: 40,
    assignees: [
      { unit: 'PDT', ack: 'truongphongdt' },
      ...KHOA.map((unit, i) => ({
        unit,
        role: 'SUPPORT' as const,
        ack: i < 3 ? ['truongkhoakt', 'truongkhoadien', 'truongkhoack'][i] : 'truongkhoa',
      })),
    ],
    followers: ['phohieutruong'],
    updates: [{ by: 'truongphongdt', at: -0.3, progress: 40, note: 'Đã nhận kế hoạch giảng dạy của 2/4 khoa.' }],
    children: [
      {
        by: 'truongphongdt',
        title: 'Đề xuất kế hoạch giảng dạy học kỳ II - Khoa Công nghệ thông tin và Công nghệ may',
        created: -1,
        due: 7,
        status: 'IN_PROGRESS',
        progress: 60,
        assignees: [{ unit: 'KCNTT', ack: 'truongkhoa' }],
        updates: [{ by: 'truongkhoa', at: -0.2, progress: 60, note: 'Đã xong ngành CNTT, đang làm ngành May.' }],
      },
      {
        by: 'truongphongdt',
        title: 'Dự kiến thời khóa biểu học kỳ II',
        created: -1,
        due: 10,
        status: 'IN_PROGRESS',
        progress: 20,
        assignees: [{ user: 'canbodt', ack: 'canbodt' }],
      },
    ],
  },
  {
    by: 'lanhdao',
    title: 'Hoàn thiện hồ sơ tự đánh giá kiểm định chất lượng cơ sở giáo dục nghề nghiệp năm 2026',
    description: 'Các đơn vị cung cấp minh chứng theo tiêu chí được phân công; Ban Khảo thí tổng hợp, viết báo cáo.',
    source: 'Kế hoạch tự đánh giá chất lượng năm 2026',
    priority: 'HIGH',
    created: -6,
    due: 25,
    status: 'IN_PROGRESS',
    progress: 25,
    assignees: [
      { unit: 'BKT', ack: 'truongbankt' },
      ...ALL_UNITS.map((unit) => ({ unit, role: 'SUPPORT' as const })),
    ],
    followers: ['phohieutruong'],
    updates: [{ by: 'truongbankt', at: -2, progress: 25, note: 'Đã nhận minh chứng của 4 đơn vị.' }],
  },
  {
    by: 'lanhdao',
    title: 'Kiểm tra, báo cáo công tác phòng cháy chữa cháy quý IV/2026',
    description: 'Kiểm tra bình chữa cháy, hệ thống điện các khu giảng đường, xưởng thực hành, ký túc xá.',
    priority: 'HIGH',
    created: -14,
    due: -2,
    status: 'IN_PROGRESS',
    progress: 70,
    assignees: [{ unit: 'PHCKT', ack: 'truongphonghc' }],
    updates: [
      { by: 'truongphonghc', at: -8, progress: 40, note: 'Đã kiểm tra khu giảng đường A, B.' },
      { by: 'truongphonghc', at: -3, progress: 70, note: 'Đã kiểm tra xưởng thực hành; còn ký túc xá.' },
    ],
  },
  {
    by: 'lanhdao',
    title: 'Lập dự toán ngân sách năm 2027',
    source: 'Hướng dẫn lập dự toán ngân sách năm 2027 của cấp trên',
    created: -4,
    due: 15,
    status: 'IN_PROGRESS',
    progress: 30,
    assignees: [
      { unit: 'BTC', ack: 'truongbantc' },
      { unit: 'PHCKT', role: 'SUPPORT', ack: 'truongphonghc' },
      { unit: 'PDT', role: 'SUPPORT' },
    ],
    updates: [{ by: 'truongbantc', at: -1, progress: 30, note: 'Đã tổng hợp chi thường xuyên.' }],
  },
  {
    by: 'lanhdao',
    title: 'Tổ chức sát hạch lái xe hạng B, C đợt tháng 11/2026',
    priority: 'HIGH',
    created: -9,
    due: 3,
    status: 'PENDING_REVIEW',
    progress: 100,
    assignees: [{ unit: 'TTSH1', ack: 'giamdoctt1' }],
    updates: [{ by: 'giamdoctt1', at: -4, progress: 80, note: 'Đã kiểm tra xe, sân sát hạch.' }],
    submission: {
      by: 'giamdoctt1',
      at: -0.4,
      content:
        'Đã hoàn thành công tác chuẩn bị: danh sách 120 học viên đủ điều kiện, kiểm tra xe và sân sát hạch, ' +
        'phân công cán bộ coi thi. Kính đề nghị Ban Giám hiệu duyệt kế hoạch.',
    },
  },
  {
    by: 'lanhdao',
    title: 'Tổ chức thi kết thúc môn học học kỳ I năm học 2026 - 2027',
    description: 'Lập lịch thi, phân công coi thi, chấm thi; bảo đảm đề thi, bài thi theo quy định.',
    created: -0.1,
    due: 20,
    status: 'NEW',
    assignees: [{ unit: 'BKT' }, { unit: 'PDT', role: 'SUPPORT' }],
  },
  {
    by: 'lanhdao',
    title: 'Kiểm tra trang thiết bị xưởng thực hành điện lạnh trước học kỳ II',
    created: -7,
    due: 6,
    status: 'IN_PROGRESS',
    progress: 70,
    assignees: [{ unit: 'KDIEN', ack: 'truongkhoadien' }],
    updates: [{ by: 'truongkhoadien', at: -1, progress: 70, note: 'Còn 3 máy nén cần thay thế.' }],
  },
  {
    by: 'lanhdao',
    title: 'Tổng hợp nhu cầu vật tư thực hành học kỳ II',
    created: -8,
    due: 4,
    status: 'RETURNED',
    progress: 90,
    assignees: [{ unit: 'KCKDL', ack: 'truongkhoack' }],
    submission: {
      by: 'truongkhoack',
      at: -2,
      content: 'Gửi bảng tổng hợp vật tư thực hành nghề Công nghệ ô tô, Vận hành máy thi công.',
      review: { decision: 'RETURNED', at: -1, note: 'Bổ sung đơn giá dự kiến cho từng loại vật tư.' },
    },
  },
  {
    by: 'lanhdao',
    title: 'Rà soát chương trình đào tạo ngành Kế toán doanh nghiệp',
    created: -5,
    due: 9,
    status: 'IN_PROGRESS',
    progress: 50,
    assignees: [{ unit: 'KKTKT', ack: 'truongkhoakt' }],
    updates: [{ by: 'truongkhoakt', at: -1, progress: 50, note: 'Đã lấy ý kiến doanh nghiệp.' }],
  },
  {
    by: 'lanhdao',
    title: 'Tổ chức Hội thi giáo viên dạy giỏi cấp trường năm 2026',
    created: -40,
    due: -7,
    completed: -10,
    status: 'DONE',
    assignees: [{ unit: 'PDT', ack: 'truongphongdt' }, ...KHOA.map((unit) => ({ unit, role: 'SUPPORT' as const }))],
    submission: {
      by: 'truongphongdt',
      at: -11,
      content: 'Hội thi đã tổ chức xong: 24 giáo viên dự thi, 6 giải nhất. Gửi kèm báo cáo tổng kết.',
      review: { decision: 'APPROVED', at: -10 },
    },
  },
  {
    by: 'phohieutruong',
    title: 'Báo cáo tình hình tư tưởng học sinh, sinh viên tháng 10/2026',
    created: -20,
    due: -5,
    completed: -6,
    status: 'DONE',
    assignees: [{ unit: 'PCT', ack: 'truongphongct' }],
    submission: {
      by: 'truongphongct',
      at: -7,
      content: 'Tình hình tư tưởng học sinh, sinh viên ổn định; không có vụ việc vi phạm kỷ luật nghiêm trọng.',
      review: { decision: 'APPROVED', at: -6 },
    },
  },
  {
    by: 'phohieutruong',
    title: 'Rà soát, cập nhật sổ theo dõi văn bản đi, đến tháng 10/2026',
    created: -15,
    due: -3,
    completed: -4,
    status: 'DONE',
    assignees: [{ unit: 'BHC', ack: 'truongbanhc' }],
    submission: {
      by: 'truongbanhc',
      at: -5,
      content: 'Đã cập nhật đầy đủ văn bản đi, đến tháng 10.',
      review: { decision: 'APPROVED', at: -4 },
    },
  },
  {
    by: 'phohieutruong',
    title: 'Bảo dưỡng định kỳ xe tập lái quý IV/2026',
    created: -25,
    due: -8,
    completed: -9,
    status: 'DONE',
    assignees: [{ unit: 'TTSH2', ack: 'giamdoctt2' }],
    submission: {
      by: 'giamdoctt2',
      at: -10,
      content: 'Đã bảo dưỡng 18 xe tập lái; 2 xe thay lốp.',
      review: { decision: 'APPROVED', at: -9 },
    },
  },
  {
    by: 'phohieutruong',
    title: 'Báo cáo kết quả đào tạo lái xe tháng 10/2026',
    created: -16,
    due: -6,
    completed: -4,
    status: 'DONE',
    assignees: [{ unit: 'TTSH3', ack: 'giamdoctt3' }],
    submission: {
      by: 'giamdoctt3',
      at: -4.5,
      content: 'Tháng 10 đào tạo 86 học viên hạng B, 24 học viên hạng C.',
      review: { decision: 'APPROVED', at: -4 },
    },
  },
  {
    by: 'truongkhoa',
    title: 'Rà soát chương trình đào tạo ngành Công nghệ thông tin (ứng dụng phần mềm)',
    description: 'Đối chiếu chuẩn đầu ra, lấy ý kiến doanh nghiệp, đề xuất điều chỉnh học phần.',
    source: 'Kết luận họp khoa ngày 28/10/2026',
    created: -6,
    due: 5,
    status: 'IN_PROGRESS',
    progress: 50,
    assignees: [
      { user: 'canbo', ack: 'canbo' },
      { user: 'canbo2', role: 'SUPPORT', ack: 'canbo2' },
    ],
    updates: [{ by: 'canbo', at: -2, progress: 50, note: 'Đã đối chiếu xong 12/24 học phần.' }],
    extension: {
      by: 'canbo',
      at: -0.5,
      due: 12,
      reason: 'Chờ ý kiến góp ý của 3 doanh nghiệp tiếp nhận thực tập.',
    },
    comments: [{ by: 'truongkhoa', at: -1, content: 'Đồng chí ưu tiên các học phần thực hành.' }],
  },
  {
    by: 'truongkhoa',
    title: 'Chuẩn bị phòng máy cho kỳ thi kết thúc môn Tin học ứng dụng',
    description: 'Kiểm tra 2 phòng máy, cài đặt phần mềm thi, sao lưu dữ liệu.',
    priority: 'HIGH',
    created: -0.05,
    due: 2,
    status: 'NEW',
    assignees: [{ user: 'canbo' }],
  },
  {
    by: 'truongkhoa',
    title: 'Báo cáo kết quả thực tập tốt nghiệp ngành May thời trang',
    created: -10,
    due: 1,
    status: 'PENDING_REVIEW',
    progress: 100,
    assignees: [{ user: 'canbo2', ack: 'canbo2' }],
    submission: {
      by: 'canbo2',
      at: -0.3,
      content: '45/46 học sinh đạt yêu cầu thực tập; 1 học sinh thực tập lại do ốm.',
    },
  },
  {
    by: 'truongkhoa',
    title: 'Cập nhật đề cương môn học Quản trị mạng',
    created: -18,
    due: -4,
    completed: -5,
    status: 'DONE',
    assignees: [{ user: 'canbo', ack: 'canbo' }],
    submission: {
      by: 'canbo',
      at: -6,
      content: 'Đã cập nhật đề cương theo chương trình mới.',
      review: { decision: 'APPROVED', at: -5, note: 'Tốt.' },
    },
  },
];

const CHAT: {
  type: 'UNIT' | 'GROUP' | 'DIRECT';
  unit?: string;
  includeSubunits?: boolean;
  name?: string;
  by: string;
  members?: string[];
  messages: [by: string, minutesAgo: number, body: string][];
}[] = [
  {
    type: 'UNIT',
    unit: 'KCNTT',
    includeSubunits: true,
    by: 'truongkhoa',
    messages: [
      ['truongkhoa', 300, 'Đồng chí nào phụ trách phòng máy 2 kiểm tra lại máy chiếu giúp tôi.'],
      ['canbo2', 290, 'Em kiểm tra rồi ạ, đã thay bóng đèn.'],
      ['truongkhoa', 95, 'Chiều nay 14h họp khoa tại phòng 301, triển khai thi kết thúc môn.'],
      ['canbo', 80, 'Em nhận ạ.'],
    ],
  },
  {
    type: 'GROUP',
    name: 'Tổ công tác kiểm định chất lượng',
    by: 'lanhdao',
    members: ['lanhdao', 'phohieutruong', 'truongbankt', 'truongphongdt', 'truongkhoa'],
    messages: [
      ['lanhdao', 1500, 'Các đồng chí bám sát kế hoạch, thứ Sáu báo cáo tiến độ thu minh chứng.'],
      ['truongbankt', 1400, 'Đã nhận minh chứng của 4 đơn vị, còn lại hạn cuối tuần sau ạ.'],
      ['truongphongdt', 200, 'Phòng Đào tạo gửi bổ sung minh chứng tiêu chí 3 trong chiều nay.'],
    ],
  },
  {
    type: 'DIRECT',
    by: 'truongkhoa',
    members: ['truongkhoa', 'canbo'],
    messages: [
      ['truongkhoa', 60, 'Hà ơi, việc chuẩn bị phòng máy em xem gấp nhé, thứ Năm thi rồi.'],
      ['canbo', 55, 'Dạ em nhận, chiều nay em kiểm tra luôn ạ.'],
    ],
  },
];

export async function seedShowcase(prisma: Db, password: string) {
  if (await prisma.task.count({ where: { title: TASKS[0].title } })) {
    console.log('✔ Dữ liệu trình diễn đã có, bỏ qua');
    return;
  }
  const units = new Map((await prisma.unit.findMany()).map((u) => [u.code, u.id]));
  const passwordHash = await hashPassword(password);
  for (const [username, fullName, role, unit, position] of PEOPLE) {
    await prisma.user.upsert({
      where: { username },
      update: {},
      create: { username, fullName, role, position, unitId: units.get(unit)!, passwordHash, mustChangePassword: false },
    });
  }
  const users = new Map((await prisma.user.findMany()).map((u) => [u.username, u.id]));
  const uid = (name: string) => {
    const id = users.get(name);
    if (!id) throw new Error(`Thiếu tài khoản ${name}`);
    return id;
  };
  const now = Date.now();
  const at = (days: number) => new Date(now + days * 86_400_000);
  const dueAt = (days: number) => {
    const d = at(days);
    d.setHours(17, 0, 0, 0);
    return d;
  };

  const createTask = async (spec: Spec, parentId?: number) => {
    const createdById = uid(spec.by);
    const created = at(spec.created);
    const task = await prisma.task.create({
      data: {
        title: spec.title,
        description: spec.description,
        source: spec.source,
        priority: spec.priority ?? 'NORMAL',
        status: spec.status,
        progress: spec.status === 'DONE' ? 100 : (spec.progress ?? 0),
        dueDate: dueAt(spec.due),
        completedAt: spec.completed === undefined ? undefined : at(spec.completed),
        createdAt: created,
        parentId,
        createdById,
        assignees: {
          create: spec.assignees.map((a) => ({
            unitId: a.unit ? units.get(a.unit) : undefined,
            userId: a.user ? uid(a.user) : undefined,
            role: a.role ?? 'LEAD',
            acknowledgedAt: a.ack ? at(spec.created + 0.05) : undefined,
            acknowledgedById: a.ack ? uid(a.ack) : undefined,
          })),
        },
        followers: { create: (spec.followers ?? []).map((f) => ({ userId: uid(f) })) },
      },
    });
    const log: { userId: number; type: TaskActivityType; createdAt: Date; detail?: object }[] = [
      { userId: createdById, type: 'CREATED', createdAt: created },
      ...spec.assignees
        .filter((a) => a.ack)
        .map((a) => ({ userId: uid(a.ack!), type: 'ACKNOWLEDGED' as const, createdAt: at(spec.created + 0.05) })),
    ];
    for (const u of spec.updates ?? []) {
      await prisma.taskUpdate.create({
        data: { taskId: task.id, userId: uid(u.by), progress: u.progress, note: u.note, createdAt: at(u.at) },
      });
      log.push({ userId: uid(u.by), type: 'PROGRESS', createdAt: at(u.at), detail: { progress: u.progress } });
    }
    const sub = spec.submission;
    if (sub) {
      await prisma.submission.create({
        data: {
          taskId: task.id,
          submittedById: uid(sub.by),
          content: sub.content,
          createdAt: at(sub.at),
          status: sub.review?.decision ?? 'PENDING',
          reviewerId: sub.review ? createdById : undefined,
          reviewNote: sub.review?.note,
          reviewedAt: sub.review ? at(sub.review.at) : undefined,
        },
      });
      log.push({ userId: uid(sub.by), type: 'SUBMITTED', createdAt: at(sub.at) });
      if (sub.review) log.push({ userId: createdById, type: sub.review.decision, createdAt: at(sub.review.at) });
    }
    const ext = spec.extension;
    if (ext) {
      await prisma.extensionRequest.create({
        data: {
          taskId: task.id,
          requestedById: uid(ext.by),
          oldDueDate: task.dueDate,
          newDueDate: dueAt(ext.due),
          reason: ext.reason,
          createdAt: at(ext.at),
        },
      });
      log.push({
        userId: uid(ext.by),
        type: 'EXTENSION_REQUESTED',
        createdAt: at(ext.at),
        detail: { newDueDate: dueAt(ext.due).toISOString() },
      });
    }
    for (const c of spec.comments ?? []) {
      await prisma.comment.create({ data: { taskId: task.id, userId: uid(c.by), content: c.content, createdAt: at(c.at) } });
    }
    await prisma.taskActivity.createMany({ data: log.map((l) => ({ ...l, taskId: task.id })) });
    for (const child of spec.children ?? []) await createTask(child, task.id);
    return task;
  };
  const byTitle = new Map<string, number>();
  for (const spec of TASKS) byTitle.set(spec.title, (await createTask(spec)).id);

  // Thông báo chưa đọc, khớp với trạng thái các nhiệm vụ trên.
  const link = (title: string) => `/tasks/${byTitle.get(title)}`;
  const note = (user: string, title: string, task: string, minutesAgo: number) => ({
    userId: uid(user),
    title,
    body: task,
    link: link(task),
    createdAt: new Date(now - minutesAgo * 60_000),
  });
  await prisma.notification.createMany({
    data: [
      note('canbo', 'Đồng chí được giao nhiệm vụ mới', 'Chuẩn bị phòng máy cho kỳ thi kết thúc môn Tin học ứng dụng', 70),
      note('truongkhoa', 'Có báo cáo mới chờ đồng chí duyệt', 'Báo cáo kết quả thực tập tốt nghiệp ngành May thời trang', 430),
      note(
        'truongkhoa',
        'Có đề nghị gia hạn nhiệm vụ chờ đồng chí xem xét',
        'Rà soát chương trình đào tạo ngành Công nghệ thông tin (ứng dụng phần mềm)',
        720,
      ),
      note('lanhdao', 'Có báo cáo mới chờ đồng chí duyệt', 'Tổ chức sát hạch lái xe hạng B, C đợt tháng 11/2026', 580),
      note('lanhdao', 'Nhiệm vụ đã quá hạn', 'Kiểm tra, báo cáo công tác phòng cháy chữa cháy quý IV/2026', 900),
      note('truongbankt', 'Đồng chí được giao nhiệm vụ mới', 'Tổ chức thi kết thúc môn học học kỳ I năm học 2026 - 2027', 140),
    ],
  });

  for (const c of CHAT) {
    const members = c.members ?? [];
    const sorted = members.map(uid).sort((a, b) => a - b);
    const conv = await prisma.conversation.create({
      data: {
        type: c.type,
        name: c.name,
        unitId: c.unit ? units.get(c.unit) : undefined,
        includeSubunits: c.includeSubunits ?? false,
        directKey: c.type === 'DIRECT' ? `${sorted[0]}:${sorted[1]}` : undefined,
        createdById: uid(c.by),
        createdAt: new Date(now - (c.messages[0][1] + 5) * 60_000),
        members: {
          create: members.map((m) => ({ userId: uid(m), role: m === c.by ? ('OWNER' as const) : ('MEMBER' as const) })),
        },
      },
    });
    let lastId = 0;
    for (const [by, minutesAgo, body] of c.messages) {
      lastId = (
        await prisma.message.create({
          data: { conversationId: conv.id, senderId: uid(by), body, createdAt: new Date(now - minutesAgo * 60_000) },
        })
      ).id;
    }
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: new Date(now - c.messages.at(-1)![1] * 60_000) },
    });
    // Người gửi tin cuối đã đọc hết; người khác còn tin chưa đọc.
    const lastSender = c.messages.at(-1)![0];
    if (c.type !== 'UNIT') {
      await prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId: conv.id, userId: uid(lastSender) } },
        data: { lastReadMessageId: lastId },
      });
    }
  }
  console.log(`✔ Dữ liệu trình diễn: ${PEOPLE.length} tài khoản chỉ huy, cán bộ; ${byTitle.size} nhiệm vụ; ${CHAT.length} cuộc trò chuyện`);
}
