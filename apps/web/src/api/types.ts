export type Role = 'ADMIN' | 'LEADER' | 'UNIT_HEAD' | 'STAFF';
export type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'RETURNED' | 'DONE' | 'CANCELLED';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface Me {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  unitId: number;
  unit: { id: number; name: string };
  email: string | null;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  /** Vai trò bắt buộc dùng xác thực hai lớp (không được tắt). */
  twoFactorMandatory: boolean;
  /** Vai trò bắt buộc xác thực hai lớp nhưng chưa bật: phải bật trước khi dùng. */
  twoFactorRequired: boolean;
  /** Đường dẫn ảnh đại diện (có ?v= theo ảnh), null: chưa có ảnh. */
  avatarUrl: string | null;
  /** Phụ trách nhân sự – chấm công. */
  hrManager: boolean;
}

export interface Unit {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  isActive: boolean;
}

export interface UserRow {
  id: number;
  username: string;
  fullName: string;
  rank: string | null;
  position: string | null;
  email: string | null;
  role: Role;
  unitId: number;
  isActive: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  /** Bị khóa tạm do nhập sai mật khẩu nhiều lần (đến thời điểm này). */
  lockedUntil: string | null;
  unit: { id: number; name: string };
  avatarUrl: string | null;
  hrManager: boolean;
}

interface Person {
  id: number;
  fullName: string;
}

export interface Assignee {
  id: number;
  role: 'LEAD' | 'SUPPORT';
  user: Person | null;
  unit: { id: number; name: string } | null;
  /** Thời điểm xác nhận đã nhận nhiệm vụ (null: chưa nhận). */
  acknowledgedAt: string | null;
  acknowledgedBy: Person | null;
}

export type TaskActivityType =
  | 'CREATED'
  | 'ACKNOWLEDGED'
  | 'PROGRESS'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'RETURNED'
  | 'UPDATED'
  | 'CANCELLED'
  | 'NUDGED'
  | 'EXTENSION_REQUESTED'
  | 'EXTENSION_APPROVED'
  | 'EXTENSION_REJECTED'
  | 'FOLLOWED';

export interface TaskActivity {
  id: number;
  type: TaskActivityType;
  detail: { progress?: number; oldDueDate?: string; newDueDate?: string; fields?: string[]; userIds?: number[] } | null;
  createdAt: string;
  user: Person;
}

export interface ExtensionRequest {
  id: number;
  oldDueDate: string | null;
  newDueDate: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  requestedBy: Person;
  decidedBy: Person | null;
}

export interface TaskRow {
  id: number;
  title: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  progress: number;
  overdue: boolean;
  createdBy: Person;
  assignees: Assignee[];
  /** Báo cáo, đề nghị gia hạn đang chờ (danh sách chỉ kèm cái mới nhất), để duyệt nhanh. */
  submissions?: { id: number; createdAt: string; submittedBy: Person }[];
  extensionRequests?: { id: number; newDueDate: string; reason: string; requestedBy: Person }[];
}

export type TodoReason = 'overdue' | 'today' | 'review' | 'returned' | 'soon' | 'new';

/** Mục "Cần xử lý": công việc kèm lý do cần xử lý. */
export interface TodoItem extends TaskRow {
  reason: TodoReason;
}

export interface TaskCounts {
  todo: number;
  review: number;
  assigned: number;
  created: number;
  following: number;
}

export interface FileRef {
  id: number;
  originalName: string;
  size: number;
}

export interface TaskDetail extends Omit<TaskRow, 'submissions' | 'extensionRequests'> {
  description: string | null;
  /** Căn cứ giao nhiệm vụ (số hiệu văn bản, kết luận giao ban). */
  source: string | null;
  createdAt: string;
  parent: { id: number; title: string } | null;
  children: (Pick<TaskRow, 'id' | 'title' | 'status' | 'dueDate' | 'progress' | 'createdBy'> & {
    assignees: Pick<Assignee, 'role' | 'user' | 'unit' | 'acknowledgedAt'>[];
  })[];
  updates: { id: number; progress: number; note: string | null; createdAt: string; user: Person }[];
  submissions: {
    id: number;
    content: string;
    status: 'PENDING' | 'APPROVED' | 'RETURNED';
    reviewNote: string | null;
    createdAt: string;
    submittedBy: Person;
    reviewer: Person | null;
    attachments: FileRef[];
  }[];
  attachments: FileRef[];
  comments: { id: number; content: string; createdAt: string; user: Person }[];
  extensionRequests: ExtensionRequest[];
  followers: { id: number; createdAt: string; user: Person }[];
  activities: TaskActivity[];
  permissions: { manage: boolean; work: boolean; acknowledge: boolean };
  following: boolean;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Notification {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface DashboardSummary {
  byStatus: Partial<Record<TaskStatus, number>>;
  overdue: number;
  dueSoon: number;
  byUnit: { unitId: number; name: string; total: number; done: number; overdue: number }[];
}

export interface NotificationSettings {
  push: { enabled: boolean; publicKey: string; devices: number };
  /** Ứng dụng di động (FCM/APNs): máy chủ đã cấu hình chưa, số điện thoại đang nhận. */
  mobile?: { enabled: boolean; devices: number };
  email: { enabled: boolean; address: string | null };
}

/** Thống kê 4 nhóm theo kết quả so với hạn. */
export interface ReportCounts {
  total: number;
  doneOnTime: number;
  doneLate: number;
  inProgressOnTime: number;
  inProgressLate: number;
  onTimeRate: number | null;
}

export interface Report {
  period: { from: string; to: string };
  totals: ReportCounts;
  byUnit: (ReportCounts & { unitId: number; name: string })[];
  byPerson: (ReportCounts & { userId: number; fullName: string; unitName: string; active: number })[];
  byMonth: (ReportCounts & { month: string })[];
}

// ---------- Trò chuyện ----------

export type ConversationType = 'DIRECT' | 'GROUP' | 'UNIT';

export interface UserBrief {
  id: number;
  fullName: string;
  rank: string | null;
  position: string | null;
  unit: { id: number; name: string };
  avatarUrl: string | null;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  kind: 'TEXT' | 'SYSTEM';
  /** Rỗng khi tin đã bị thu hồi. */
  body: string;
  sender: { id: number; fullName: string; avatarUrl: string | null } | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface ConversationItem {
  id: number;
  type: ConversationType;
  name: string;
  unitId: number | null;
  includeSubunits: boolean;
  memberCount: number;
  peer: UserBrief | null;
  lastMessage: ChatMessage | null;
  unread: number;
  muted: boolean;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface ConversationDetail extends ConversationItem {
  members: (UserBrief & { role: 'OWNER' | 'MEMBER'; lastReadMessageId: number })[];
  canManage: boolean;
  canAddMembers: boolean;
  canLeave: boolean;
}

// ---------- Nghỉ phép, chấm công ----------

export type LeaveStatus = 'PENDING_UNIT' | 'PENDING_LEADER' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'REVOKED';
export type DayPart = 'FULL' | 'MORNING' | 'AFTERNOON';

export interface StaffCategory {
  id: number;
  name: string;
  annualDays: number;
  sortOrder: number;
}

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  deductsBalance: boolean;
  isActive: boolean;
}

export interface WorkShift {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
  graceMinutes: number;
  /** 1 = thứ Hai … 7 = Chủ nhật. */
  workdays: number[];
  isDefault: boolean;
  /** Ca 3 làm thêm từ giờ ra ca 2. */
  overtimeEnabled: boolean;
  overtimeMinMinutes: number;
}

export interface HrCatalog {
  categories: StaffCategory[];
  leaveTypes: LeaveType[];
  shifts: WorkShift[];
  unitShifts: { id: number; workShiftId: number }[];
  settings: { leaveEscalateDays: number };
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
}

export interface LeaveBalance {
  year: number;
  entitled: number;
  source: 'custom' | 'category' | 'default';
  category: string | null;
  carried: number;
  used: number;
  pending: number;
  remaining: number;
  note: string | null;
}

interface PersonPosition extends Person {
  position: string | null;
}

export interface LeaveRequest {
  id: number;
  userId: number;
  startDate: string;
  endDate: string;
  startPart: DayPart;
  endPart: DayPart;
  days: number;
  reason: string;
  status: LeaveStatus;
  approverUnitId: number | null;
  needsLeader: boolean;
  unitDecidedAt: string | null;
  leaderDecidedAt: string | null;
  decisionNote: string | null;
  revokedAt: string | null;
  createdAt: string;
  user: PersonPosition & { unitId: number; unit: { id: number; name: string } };
  type: { id: number; name: string; deductsBalance: boolean };
  approverUnit: { id: number; name: string } | null;
  unitDecidedBy: PersonPosition | null;
  leaderDecidedBy: PersonPosition | null;
  revokedBy: PersonPosition | null;
}

export interface LeaveDetail extends LeaveRequest {
  permissions: { decide: boolean; cancel: boolean; revoke: boolean };
}

export type DayStatus =
  | 'OK'
  | 'LATE'
  | 'EARLY'
  | 'LATE_EARLY'
  | 'MISSING'
  | 'ABSENT_HALF'
  | 'ABSENT'
  | 'LEAVE'
  | 'HOLIDAY'
  | 'WEEKEND'
  | 'PENDING';

export interface AttendanceSession {
  /** 1, 2: ca chính; 3: làm thêm. */
  key: 1 | 2 | 3;
  in?: string;
  out?: string;
  late: number;
  early: number;
  status: 'OK' | 'MISSING' | 'ABSENT' | 'OFF' | 'PENDING';
}

export interface AttendanceDay {
  day: string;
  weekday: number;
  status: DayStatus;
  holiday?: string;
  leave?: { part: DayPart; type: string };
  in?: string;
  out?: string;
  punches: string[];
  sessions: AttendanceSession[];
  late: number;
  early: number;
  work: number;
  /** Phút làm thêm được tính (đã duyệt); phút theo lượt chấm ca 3. */
  overtime: number;
  overtimeActual: number;
  overtimeApproved?: { start: string; end: string };
}

export interface AttendanceSummary {
  scheduled: number;
  work: number;
  leave: number;
  lateCount: number;
  lateMinutes: number;
  earlyCount: number;
  earlyMinutes: number;
  missing: number;
  absent: number;
  overtimeMinutes: number;
}

export interface PersonAttendance {
  from: string;
  to: string;
  user: { id: number; fullName: string; attendanceCode: string | null; unit: { id: number; name: string } };
  shift: WorkShift;
  days: AttendanceDay[];
  summary: AttendanceSummary;
}

export interface UnitAttendance {
  from: string;
  to: string;
  days: { day: string; weekday: number; holiday: string | null }[];
  rows: {
    user: { id: number; fullName: string; position: string | null; attendanceCode: string | null; unit: { id: number; name: string } };
    shift: string;
    days: AttendanceDay[];
    summary: AttendanceSummary;
  }[];
}

export interface StaffRow {
  id: number;
  username: string;
  fullName: string;
  position: string | null;
  role: Role;
  attendanceCode: string | null;
  staffCategoryId: number | null;
  unit: { id: number; name: string };
  balance: LeaveBalance;
}

export interface AttendanceImport {
  id: number;
  fileName: string;
  total: number;
  inserted: number;
  duplicates: number;
  unmatched: number;
  rangeFrom: string | null;
  rangeTo: string | null;
  createdAt: string;
  uploadedBy: Person;
}

export type OvertimeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface OvertimeRequest {
  id: number;
  userId: number;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  status: OvertimeStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  user: PersonPosition & { unitId: number; unit: { id: number; name: string } };
  decidedBy: Person | null;
  permissions: { decide: boolean; cancel: boolean };
}
