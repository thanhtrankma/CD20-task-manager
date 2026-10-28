import '../models/models.dart';
import 'format.dart';

const _fieldLabel = {
  'title': 'tên',
  'description': 'nội dung',
  'source': 'căn cứ',
  'priority': 'mức ưu tiên',
};

String _day(Object? iso) => iso is String ? formatDate(DateTime.tryParse(iso)) : '';

/// Mô tả một dòng hoạt động ("xác nhận đã nhận nhiệm vụ"...), cùng câu chữ với bản web (ActivityTimeline.tsx).
String describeActivity(Activity a) {
  final d = a.detail;
  switch (a.type) {
    case 'CREATED':
      return 'giao nhiệm vụ';
    case 'ACKNOWLEDGED':
      return 'xác nhận đã nhận nhiệm vụ';
    case 'PROGRESS':
      return 'cập nhật tiến độ ${d['progress'] ?? 0}%';
    case 'SUBMITTED':
      return 'nộp báo cáo kết quả';
    case 'APPROVED':
      return 'duyệt báo cáo: Đạt';
    case 'RETURNED':
      return 'trả lại báo cáo';
    case 'UPDATED':
      final fields = d['fields'] is List ? (d['fields'] as List) : const [];
      final parts = [
        if (d['newDueDate'] != null) 'đổi hạn ${_day(d['oldDueDate'])} → ${_day(d['newDueDate'])}',
        for (final f in fields) 'sửa ${_fieldLabel[f] ?? f}',
      ];
      return parts.isEmpty ? 'sửa nhiệm vụ' : parts.join(', ');
    case 'CANCELLED':
      return 'hủy nhiệm vụ';
    case 'NUDGED':
      return 'đôn đốc khẩn trương thực hiện';
    case 'EXTENSION_REQUESTED':
      return 'đề nghị gia hạn đến ${_day(d['newDueDate'])}';
    case 'EXTENSION_APPROVED':
      return 'chấp thuận gia hạn đến ${_day(d['newDueDate'])}';
    case 'EXTENSION_REJECTED':
      return 'không chấp thuận gia hạn';
    case 'FOLLOWED':
      return d['userIds'] is List ? 'thêm ${(d['userIds'] as List).length} người theo dõi' : 'theo dõi nhiệm vụ';
    default:
      return 'cập nhật nhiệm vụ';
  }
}

enum ActivityTone { good, bad, warn, muted, normal }

ActivityTone activityTone(String type) => switch (type) {
      'ACKNOWLEDGED' || 'APPROVED' || 'EXTENSION_APPROVED' => ActivityTone.good,
      'RETURNED' || 'CANCELLED' || 'NUDGED' => ActivityTone.bad,
      'EXTENSION_REQUESTED' || 'EXTENSION_REJECTED' => ActivityTone.warn,
      'FOLLOWED' => ActivityTone.muted,
      _ => ActivityTone.normal,
    };

/// Ghi chú tiến độ đi kèm dòng hoạt động PROGRESS (lấy từ lịch sử tiến độ, cùng người, lệch không quá 5 giây).
String? progressNoteFor(Activity a, List<ProgressUpdate> updates) {
  if (a.type != 'PROGRESS' || a.createdAt == null) return null;
  for (final u in updates) {
    if (u.user.id == a.user.id && u.createdAt != null && u.createdAt!.difference(a.createdAt!).inSeconds.abs() < 5) {
      return u.note;
    }
  }
  return null;
}
