import 'package:flutter/material.dart';

import 'models/models.dart';
import 'util/due.dart';

/// Màu nền và chữ cho thẻ dạng viên thuốc (cùng bảng màu với bản web, apps/web/src/constants.ts).
class Tone {
  const Tone(this.label, this.bg, this.fg);
  final String label;
  final Color bg;
  final Color fg;
}

const primaryColor = Color(0xFF2563EB);

const statusTone = <TaskStatus, Tone>{
  TaskStatus.newTask: Tone('Mới giao', Color(0xFFEFF6FF), Color(0xFF1D4ED8)),
  TaskStatus.inProgress: Tone('Đang thực hiện', Color(0xFFEEF2FF), Color(0xFF4338CA)),
  TaskStatus.pendingReview: Tone('Chờ duyệt', Color(0xFFFFFBEB), Color(0xFFB45309)),
  TaskStatus.returned: Tone('Bị trả lại', Color(0xFFFFF7ED), Color(0xFFC2410C)),
  TaskStatus.done: Tone('Hoàn thành', Color(0xFFECFDF5), Color(0xFF047857)),
  TaskStatus.cancelled: Tone('Đã hủy', Color(0xFFF1F5F9), Color(0xFF64748B)),
};

const priorityTone = <Priority, Tone>{
  Priority.low: Tone('Thấp', Color(0xFFF1F5F9), Color(0xFF64748B)),
  Priority.normal: Tone('Bình thường', Color(0xFFF0F9FF), Color(0xFF0369A1)),
  Priority.high: Tone('Cao', Color(0xFFFFF7ED), Color(0xFFC2410C)),
  Priority.urgent: Tone('Khẩn', Color(0xFFFFF1F2), Color(0xFFBE123C)),
};

/// Màu hạn: quá hạn đỏ, hôm nay cam, sắp đến hạn vàng, còn hạn xám.
const dueTone = <DueTone, (Color bg, Color fg)>{
  DueTone.overdue: (Color(0xFFFFF1F2), Color(0xFFBE123C)),
  DueTone.today: (Color(0xFFFFF7ED), Color(0xFFC2410C)),
  DueTone.soon: (Color(0xFFFFFBEB), Color(0xFFB45309)),
  DueTone.normal: (Color(0xFFF1F5F9), Color(0xFF475569)),
};

const reviewTone = <ReviewStatus, Tone>{
  ReviewStatus.pending: Tone('Chờ duyệt', Color(0xFFFFFBEB), Color(0xFFB45309)),
  ReviewStatus.approved: Tone('Đạt', Color(0xFFECFDF5), Color(0xFF047857)),
  ReviewStatus.returned: Tone('Trả lại', Color(0xFFFFF7ED), Color(0xFFC2410C)),
};

const extensionTone = <ExtensionStatus, Tone>{
  ExtensionStatus.pending: Tone('Chờ xem xét', Color(0xFFFFFBEB), Color(0xFFB45309)),
  ExtensionStatus.approved: Tone('Chấp thuận', Color(0xFFECFDF5), Color(0xFF047857)),
  ExtensionStatus.rejected: Tone('Không chấp thuận', Color(0xFFFFF1F2), Color(0xFFBE123C)),
};

/// Tiêu đề nhóm trong mục "Cần xử lý".
const todoReasonLabel = <TodoReason, String>{
  TodoReason.overdue: 'Quá hạn',
  TodoReason.today: 'Đến hạn hôm nay',
  TodoReason.review: 'Chờ đồng chí duyệt, xem xét',
  TodoReason.returned: 'Bị trả lại, cần làm tiếp',
  TodoReason.soon: 'Sắp đến hạn (3 ngày)',
  TodoReason.newTask: 'Mới được giao, chưa xác nhận',
};

const todoReasonColor = <TodoReason, Color>{
  TodoReason.overdue: Color(0xFFBE123C),
  TodoReason.today: Color(0xFFC2410C),
  TodoReason.review: Color(0xFFB45309),
  TodoReason.returned: Color(0xFFC2410C),
  TodoReason.soon: Color(0xFFB45309),
  TodoReason.newTask: primaryColor,
};

const roleLabel = <Role, String>{
  Role.admin: 'Quản trị hệ thống',
  Role.leader: 'Lãnh đạo',
  Role.unitHead: 'Chỉ huy đơn vị',
  Role.staff: 'Cán bộ',
};

const securityNotice = 'Không soạn thảo, lưu trữ thông tin thuộc bí mật nhà nước trên hệ thống.';

/// Loại tệp máy chủ cho phép (apps/api/src/modules/files/file-types.ts).
const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg'];
