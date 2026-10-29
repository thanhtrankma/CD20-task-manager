import '../models/models.dart';
import 'format.dart';

/// Câu nhắc trên mọi màn hình trò chuyện.
const chatSecretNotice = 'Không trao đổi thông tin bí mật nhà nước';

/// Nội dung thay cho tin đã thu hồi.
const recalledText = 'Tin nhắn đã được thu hồi';

/// Độ dài tối đa một tin (máy chủ kiểm tra 1 – 4000 ký tự).
const chatMaxLength = 4000;

/// Thu hồi được tin của mình trong thời gian này.
const recallWindow = Duration(hours: 24);

/// Số tin mỗi lần tải.
const chatPageSize = 30;

const _weekdays = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];

DateTime _day(DateTime d) {
  final l = d.toLocal();
  return DateTime(l.year, l.month, l.day);
}

bool sameDay(DateTime a, DateTime b) => _day(a) == _day(b);

/// Giờ ở danh sách trò chuyện: "14:05" (hôm nay), "Hôm qua", "Thứ Ba" (trong tuần), "27/10", "27/10/2025".
String chatListTime(DateTime? d, {DateTime? now}) {
  if (d == null) return '';
  final n = now ?? DateTime.now();
  final days = _day(n).difference(_day(d)).inDays;
  if (days <= 0) return formatTime(d);
  if (days == 1) return 'Hôm qua';
  if (days < 7) return _weekdays[d.toLocal().weekday - 1];
  final l = d.toLocal();
  final dd = l.day.toString().padLeft(2, '0'), mm = l.month.toString().padLeft(2, '0');
  return l.year == n.year ? '$dd/$mm' : '$dd/$mm/${l.year}';
}

/// Dòng phân cách ngày trong cuộc trò chuyện: "Hôm nay", "Hôm qua", "Thứ Ba, 27/10/2026".
String chatDayLabel(DateTime d, {DateTime? now}) {
  final days = _day(now ?? DateTime.now()).difference(_day(d)).inDays;
  if (days == 0) return 'Hôm nay';
  if (days == 1) return 'Hôm qua';
  return '${_weekdays[d.toLocal().weekday - 1]}, ${formatDate(d)}';
}

/// Tên gọi ngắn (từ cuối của họ tên): "Nguyễn Văn An" → "An".
String shortName(String fullName) {
  final parts = fullName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
  return parts.isEmpty ? '' : parts.last;
}

/// Dòng xem trước tin cuối ở danh sách: (nội dung, in nghiêng).
/// Nhóm: thêm tên ngắn người gửi; tin của mình: "Tôi: "; tin hệ thống, tin đã thu hồi: in nghiêng.
(String, bool) messagePreview(Conversation c, int? meId) {
  final m = c.lastMessage;
  if (m == null) return ('Chưa có tin nhắn', true);
  if (m.isDeleted) return (recalledText, true);
  if (m.isSystem) return (m.body, true);
  final body = m.body.replaceAll(RegExp(r'\s+'), ' ').trim();
  final sender = m.sender;
  if (sender != null && sender.id == meId) return ('Tôi: $body', false);
  if (!c.isDirect && sender != null) return ('${shortName(sender.fullName)}: $body', false);
  return (body, false);
}

/// Tin của mình, chưa thu hồi, gửi chưa quá 24 giờ.
bool canRecall(ChatMessage m, int? meId, {DateTime? now}) =>
    !m.isSystem &&
    !m.isDeleted &&
    meId != null &&
    m.sender?.id == meId &&
    (now ?? DateTime.now()).difference(m.createdAt) < recallWindow;

/// Ghép tin mới vào danh sách (mới nhất trước), bỏ trùng theo mã, giữ thứ tự giảm dần.
List<ChatMessage> mergeMessages(List<ChatMessage> current, Iterable<ChatMessage> incoming) {
  final byId = <int, ChatMessage>{for (final m in current) m.id: m};
  for (final m in incoming) {
    byId[m.id] = m;
  }
  return byId.values.toList()..sort((a, b) => b.id.compareTo(a.id));
}
