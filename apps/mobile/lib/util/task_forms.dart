import '../models/models.dart';

/// Cuối ngày (23:59:59.999 giờ máy) của ngày [d] — hạn nhiệm vụ tính theo ngày như bản web.
DateTime endOfDay(DateTime d) {
  final l = d.toLocal();
  return DateTime(l.year, l.month, l.day, 23, 59, 59, 999);
}

bool sameDay(DateTime a, DateTime b) {
  final x = a.toLocal(), y = b.toLocal();
  return x.year == y.year && x.month == y.month && x.day == y.day;
}

const maxTitle = 255;
const maxDescription = 10000;
const maxSource = 500;
const maxFollowers = 50;

String? _checkCommon({required String title, required String description, required String source}) {
  final t = title.trim();
  if (t.length < 3 || t.length > maxTitle) return 'Tên nhiệm vụ cần từ 3 đến $maxTitle ký tự';
  if (description.length > maxDescription) return 'Nội dung tối đa $maxDescription ký tự';
  if (source.trim().length > maxSource) return 'Căn cứ tối đa $maxSource ký tự';
  return null;
}

/// Dữ liệu bảng "Giao nhanh" (và "Chia việc con" khi có [parentId]) → `POST /tasks` (CreateTaskDto).
class QuickAssignDraft {
  QuickAssignDraft({DateTime? now, this.parentId, DateTime? parentDue}) : dueDate = defaultDue(now ?? DateTime.now()) {
    // Việc con mặc định không trễ hơn hạn việc cha.
    if (parentDue != null && parentDue.isBefore(dueDate)) dueDate = parentDue.toLocal();
  }

  String title = '';
  final assignees = <UserOption>[];
  final units = <UnitOption>[];
  DateTime dueDate;
  Priority priority = Priority.normal;
  String description = '';
  String source = '';
  final followers = <UserOption>[];
  final int? parentId;

  /// Mặc định: cuối ngày mai.
  static DateTime defaultDue(DateTime now) {
    final l = now.toLocal();
    return endOfDay(DateTime(l.year, l.month, l.day + 1));
  }

  /// Câu báo lỗi đầu tiên (tiếng Việt), null nếu hợp lệ.
  String? validate({DateTime? now}) {
    final common = _checkCommon(title: title, description: description, source: source);
    if (common != null) return common;
    if (assignees.isEmpty && units.isEmpty) return 'Đồng chí chọn ít nhất một người hoặc đơn vị nhận việc';
    if (!dueDate.isAfter(now ?? DateTime.now())) return 'Hạn hoàn thành phải sau thời điểm hiện tại';
    if (followers.length > maxFollowers) return 'Tối đa $maxFollowers người theo dõi';
    return null;
  }

  /// Thân yêu cầu `POST /tasks`. Mọi người / đơn vị được chọn đều là chủ trì (LEAD).
  Map<String, dynamic> toJson() {
    final desc = description.trim();
    final src = source.trim();
    final followerIds = {for (final f in followers) f.id}.toList();
    return {
      'title': title.trim(),
      'dueDate': dueDate.toUtc().toIso8601String(),
      'priority': priority.api,
      'assignees': [
        for (final u in units) {'unitId': u.id, 'role': 'LEAD'},
        for (final u in assignees) {'userId': u.id, 'role': 'LEAD'},
      ],
      if (desc.isNotEmpty) 'description': desc,
      if (src.isNotEmpty) 'source': src,
      if (followerIds.isNotEmpty) 'followerIds': followerIds,
      if (parentId != null) 'parentId': parentId,
    };
  }
}

/// Sửa nhiệm vụ → `PATCH /tasks/:id`, chỉ gửi các trường đã đổi (dòng hoạt động ghi đúng trường).
class TaskEditDraft {
  TaskEditDraft({
    required this.originalTitle,
    required this.originalDescription,
    required this.originalSource,
    required this.originalDue,
    required this.originalPriority,
  })  : title = originalTitle,
        description = originalDescription ?? '',
        source = originalSource ?? '',
        dueDate = originalDue.toLocal(),
        priority = originalPriority;

  factory TaskEditDraft.fromTask(TaskDetail t) => TaskEditDraft(
        originalTitle: t.row.title,
        originalDescription: t.description,
        originalSource: t.source,
        originalDue: t.row.dueDate,
        originalPriority: t.row.priority,
      );

  final String originalTitle;
  final String? originalDescription;
  final String? originalSource;
  final DateTime originalDue;
  final Priority originalPriority;

  String title;
  String description;
  String source;
  DateTime dueDate;
  Priority priority;

  String? validate() => _checkCommon(title: title, description: description, source: source);

  /// Các trường đã đổi. Đổi ngày hạn thì hạn mới là cuối ngày đó; giữ nguyên ngày thì không gửi (giữ giờ cũ).
  Map<String, dynamic> changes() {
    final out = <String, dynamic>{};
    final t = title.trim();
    if (t != originalTitle) out['title'] = t;
    final d = description.trim();
    if (d != (originalDescription ?? '').trim()) out['description'] = d;
    final s = source.trim();
    if (s != (originalSource ?? '').trim()) out['source'] = s;
    if (priority != originalPriority) out['priority'] = priority.api;
    if (!sameDay(dueDate, originalDue)) out['dueDate'] = endOfDay(dueDate).toUtc().toIso8601String();
    return out;
  }
}
