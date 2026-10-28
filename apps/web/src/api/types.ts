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
  email: { enabled: boolean; address: string | null };
}
