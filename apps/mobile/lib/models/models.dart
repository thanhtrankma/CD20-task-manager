// Kiểu dữ liệu trả về từ API (đối chiếu apps/web/src/api/types.ts).
// Phân tích "dễ tính": trường thiếu hoặc sai kiểu được bỏ qua để ứng dụng không vỡ khi API mở rộng.

typedef Json = Map<String, dynamic>;

Json _map(Object? v) => v is Map ? v.cast<String, dynamic>() : <String, dynamic>{};
List<Json> _list(Object? v) => v is List ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList() : [];
int _int(Object? v, [int fallback = 0]) => v is num ? v.toInt() : int.tryParse('$v') ?? fallback;
int? _intOrNull(Object? v) => v is num ? v.toInt() : (v == null ? null : int.tryParse('$v'));
String _str(Object? v, [String fallback = '']) => v is String ? v : (v == null ? fallback : '$v');
String? _strOrNull(Object? v) => v is String && v.isNotEmpty ? v : null;
DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
bool _bool(Object? v) => v == true;

enum Role {
  admin('ADMIN'),
  leader('LEADER'),
  unitHead('UNIT_HEAD'),
  staff('STAFF');

  const Role(this.api);
  final String api;
  static Role parse(Object? v) => Role.values.firstWhere((r) => r.api == v, orElse: () => Role.staff);

  /// Lãnh đạo, chỉ huy đơn vị được giao việc: có mục "Đã giao", "Chờ duyệt".
  bool get canAssign => this == leader || this == unitHead;
}

enum TaskStatus {
  newTask('NEW'),
  inProgress('IN_PROGRESS'),
  pendingReview('PENDING_REVIEW'),
  returned('RETURNED'),
  done('DONE'),
  cancelled('CANCELLED');

  const TaskStatus(this.api);
  final String api;
  static TaskStatus parse(Object? v) =>
      TaskStatus.values.firstWhere((s) => s.api == v, orElse: () => TaskStatus.newTask);

  bool get isClosed => this == done || this == cancelled;

  /// Người thực hiện còn phải làm (chưa nộp báo cáo, chưa kết thúc).
  bool get isOpen => this == newTask || this == inProgress || this == returned;
}

enum Priority {
  low('LOW'),
  normal('NORMAL'),
  high('HIGH'),
  urgent('URGENT');

  const Priority(this.api);
  final String api;
  static Priority parse(Object? v) => Priority.values.firstWhere((p) => p.api == v, orElse: () => Priority.normal);
}

/// Lý do việc nằm trong "Cần xử lý" (thứ tự do máy chủ sắp).
enum TodoReason {
  overdue,
  today,
  review,
  returned,
  soon,
  newTask;

  static TodoReason parse(Object? v) => v == 'new'
      ? TodoReason.newTask
      : TodoReason.values.firstWhere((r) => r.name == v, orElse: () => TodoReason.newTask);
}

class Person {
  const Person(this.id, this.fullName);
  final int id;
  final String fullName;
  static Person? tryParse(Object? v) {
    if (v is! Map) return null;
    return Person(_int(v['id']), _str(v['fullName']));
  }

  static Person parse(Object? v) => tryParse(v) ?? const Person(0, '');
}

class Me {
  Me({
    required this.id,
    required this.username,
    required this.fullName,
    required this.role,
    required this.unitName,
    this.unitId,
    required this.mustChangePassword,
    required this.twoFactorRequired,
    this.email,
  });

  final int id;
  final String username;
  final String fullName;
  final Role role;
  final String unitName;
  final int? unitId;
  final String? email;
  final bool mustChangePassword;
  final bool twoFactorRequired;

  factory Me.fromJson(Json j) => Me(
        id: _int(j['id']),
        username: _str(j['username']),
        fullName: _str(j['fullName']),
        role: Role.parse(j['role']),
        unitName: _str(_map(j['unit'])['name']),
        unitId: _intOrNull(_map(j['unit'])['id']) ?? _intOrNull(j['unitId']),
        email: _strOrNull(j['email']),
        mustChangePassword: _bool(j['mustChangePassword']),
        twoFactorRequired: _bool(j['twoFactorRequired']),
      );
}

class Assignee {
  Assignee({
    required this.id,
    required this.isLead,
    this.user,
    this.unitName,
    this.acknowledgedAt,
    this.acknowledgedBy,
  });

  final int id;
  final bool isLead;
  final Person? user;
  final String? unitName;
  final DateTime? acknowledgedAt;
  final Person? acknowledgedBy;

  String get label => unitName ?? user?.fullName ?? '';

  factory Assignee.fromJson(Json j) => Assignee(
        id: _int(j['id']),
        isLead: j['role'] != 'SUPPORT',
        user: Person.tryParse(j['user']),
        unitName: _strOrNull(_map(j['unit'])['name']),
        acknowledgedAt: _date(j['acknowledgedAt']),
        acknowledgedBy: Person.tryParse(j['acknowledgedBy']),
      );
}

class TaskRow {
  TaskRow({
    required this.id,
    required this.title,
    required this.dueDate,
    required this.priority,
    required this.status,
    required this.progress,
    required this.overdue,
    required this.createdBy,
    required this.assignees,
    this.reason,
  });

  final int id;
  final String title;
  final DateTime dueDate;
  final Priority priority;
  final TaskStatus status;
  final int progress;
  final bool overdue;
  final Person createdBy;
  final List<Assignee> assignees;

  /// Chỉ có trong "Cần xử lý".
  final TodoReason? reason;

  String get leads => assignees.where((a) => a.isLead).map((a) => a.label).join(', ');

  factory TaskRow.fromJson(Json j) => TaskRow(
        id: _int(j['id']),
        title: _str(j['title']),
        dueDate: _date(j['dueDate']) ?? DateTime.now(),
        priority: Priority.parse(j['priority']),
        status: TaskStatus.parse(j['status']),
        progress: _int(j['progress']),
        overdue: _bool(j['overdue']),
        createdBy: Person.parse(j['createdBy']),
        assignees: _list(j['assignees']).map(Assignee.fromJson).toList(),
        reason: j.containsKey('reason') ? TodoReason.parse(j['reason']) : null,
      );
}

class TaskCounts {
  const TaskCounts({this.todo = 0, this.review = 0, this.assigned = 0, this.created = 0, this.following = 0});
  final int todo, review, assigned, created, following;

  factory TaskCounts.fromJson(Json j) => TaskCounts(
        todo: _int(j['todo']),
        review: _int(j['review']),
        assigned: _int(j['assigned']),
        created: _int(j['created']),
        following: _int(j['following']),
      );
}

class Paged<T> {
  Paged({required this.items, required this.total, required this.page, required this.pageSize});
  final List<T> items;
  final int total, page, pageSize;

  bool get hasMore => page * pageSize < total;

  factory Paged.fromJson(Json j, T Function(Json) item) => Paged(
        items: _list(j['items']).map(item).toList(),
        total: _int(j['total']),
        page: _int(j['page'], 1),
        pageSize: _int(j['pageSize'], 20),
      );
}

class FileRef {
  FileRef(this.id, this.originalName, this.size);
  final int id;
  final String originalName;
  final int size;
  factory FileRef.fromJson(Json j) => FileRef(_int(j['id']), _str(j['originalName'], 'tệp'), _int(j['size']));
}

enum ReviewStatus { pending, approved, returned }

class Submission {
  Submission({
    required this.id,
    required this.content,
    required this.status,
    required this.createdAt,
    required this.submittedBy,
    required this.attachments,
    this.reviewNote,
    this.reviewer,
  });

  final int id;
  final String content;
  final ReviewStatus status;
  final String? reviewNote;
  final DateTime? createdAt;
  final Person submittedBy;
  final Person? reviewer;
  final List<FileRef> attachments;

  factory Submission.fromJson(Json j) => Submission(
        id: _int(j['id']),
        content: _str(j['content']),
        status: switch (j['status']) {
          'APPROVED' => ReviewStatus.approved,
          'RETURNED' => ReviewStatus.returned,
          _ => ReviewStatus.pending,
        },
        reviewNote: _strOrNull(j['reviewNote']),
        createdAt: _date(j['createdAt']),
        submittedBy: Person.parse(j['submittedBy']),
        reviewer: Person.tryParse(j['reviewer']),
        attachments: _list(j['attachments']).map(FileRef.fromJson).toList(),
      );
}

enum ExtensionStatus { pending, approved, rejected }

class ExtensionRequest {
  ExtensionRequest({
    required this.id,
    required this.newDueDate,
    required this.reason,
    required this.status,
    required this.requestedBy,
    this.oldDueDate,
    this.decisionNote,
    this.decidedBy,
    this.createdAt,
  });

  final int id;
  final DateTime? oldDueDate;
  final DateTime? newDueDate;
  final String reason;
  final ExtensionStatus status;
  final String? decisionNote;
  final Person requestedBy;
  final Person? decidedBy;
  final DateTime? createdAt;

  factory ExtensionRequest.fromJson(Json j) => ExtensionRequest(
        id: _int(j['id']),
        oldDueDate: _date(j['oldDueDate']),
        newDueDate: _date(j['newDueDate']),
        reason: _str(j['reason']),
        status: switch (j['status']) {
          'APPROVED' => ExtensionStatus.approved,
          'REJECTED' => ExtensionStatus.rejected,
          _ => ExtensionStatus.pending,
        },
        decisionNote: _strOrNull(j['decisionNote']),
        requestedBy: Person.parse(j['requestedBy']),
        decidedBy: Person.tryParse(j['decidedBy']),
        createdAt: _date(j['createdAt']),
      );
}

class ProgressUpdate {
  ProgressUpdate(this.id, this.progress, this.note, this.createdAt, this.user);
  final int id;
  final int progress;
  final String? note;
  final DateTime? createdAt;
  final Person user;
  factory ProgressUpdate.fromJson(Json j) => ProgressUpdate(
      _int(j['id']), _int(j['progress']), _strOrNull(j['note']), _date(j['createdAt']), Person.parse(j['user']));
}

class Comment {
  Comment(this.id, this.content, this.createdAt, this.user);
  final int id;
  final String content;
  final DateTime? createdAt;
  final Person user;
  factory Comment.fromJson(Json j) =>
      Comment(_int(j['id']), _str(j['content']), _date(j['createdAt']), Person.parse(j['user']));
}

class Activity {
  Activity(this.id, this.type, this.detail, this.createdAt, this.user);
  final int id;
  final String type;
  final Json detail;
  final DateTime? createdAt;
  final Person user;
  factory Activity.fromJson(Json j) =>
      Activity(_int(j['id']), _str(j['type']), _map(j['detail']), _date(j['createdAt']), Person.parse(j['user']));
}

class TaskPermissions {
  const TaskPermissions({this.manage = false, this.work = false, this.acknowledge = false});
  final bool manage, work, acknowledge;
  factory TaskPermissions.fromJson(Json j) =>
      TaskPermissions(manage: _bool(j['manage']), work: _bool(j['work']), acknowledge: _bool(j['acknowledge']));
}

class TaskDetail {
  TaskDetail({
    required this.row,
    required this.description,
    required this.source,
    required this.createdAt,
    required this.parent,
    required this.children,
    required this.updates,
    required this.submissions,
    required this.attachments,
    required this.comments,
    required this.extensionRequests,
    required this.followers,
    required this.activities,
    required this.permissions,
    required this.following,
  });

  final TaskRow row;
  final String? description;
  final String? source;
  final DateTime? createdAt;
  final ({int id, String title})? parent;
  final List<TaskRow> children;
  final List<ProgressUpdate> updates;
  final List<Submission> submissions;
  final List<FileRef> attachments;
  final List<Comment> comments;
  final List<ExtensionRequest> extensionRequests;
  final List<Person> followers;
  final List<Activity> activities;
  final TaskPermissions permissions;
  final bool following;

  int get id => row.id;
  TaskStatus get status => row.status;

  ExtensionRequest? get pendingExtension {
    for (final r in extensionRequests) {
      if (r.status == ExtensionStatus.pending) return r;
    }
    return null;
  }

  factory TaskDetail.fromJson(Json j) {
    final parent = j['parent'];
    return TaskDetail(
      row: TaskRow.fromJson(j),
      description: _strOrNull(j['description']),
      source: _strOrNull(j['source']),
      createdAt: _date(j['createdAt']),
      parent: parent is Map ? (id: _int(parent['id']), title: _str(parent['title'])) : null,
      children: _list(j['children']).map(TaskRow.fromJson).toList(),
      updates: _list(j['updates']).map(ProgressUpdate.fromJson).toList(),
      submissions: _list(j['submissions']).map(Submission.fromJson).toList(),
      attachments: _list(j['attachments']).map(FileRef.fromJson).toList(),
      comments: _list(j['comments']).map(Comment.fromJson).toList(),
      extensionRequests: _list(j['extensionRequests']).map(ExtensionRequest.fromJson).toList(),
      followers: _list(j['followers']).map((f) => Person.parse(f['user'])).toList(),
      activities: _list(j['activities']).map(Activity.fromJson).toList(),
      permissions: TaskPermissions.fromJson(_map(j['permissions'])),
      following: _bool(j['following']),
    );
  }
}

class AppNotification {
  AppNotification({
    required this.id,
    required this.title,
    required this.createdAt,
    this.body,
    this.link,
    this.readAt,
  });

  final int id;
  final String title;
  final String? body;
  final String? link;
  final DateTime? readAt;
  final DateTime? createdAt;

  bool get isRead => readAt != null;

  /// Mã nhiệm vụ trong đường dẫn dạng `/tasks/123`.
  int? get taskId {
    final m = RegExp(r'^/tasks/(\d+)').firstMatch(link ?? '');
    return m == null ? null : _intOrNull(m.group(1));
  }

  AppNotification markRead() =>
      AppNotification(id: id, title: title, body: body, link: link, readAt: DateTime.now(), createdAt: createdAt);

  factory AppNotification.fromJson(Json j) => AppNotification(
        id: _int(j['id']),
        title: _str(j['title']),
        body: _strOrNull(j['body']),
        link: _strOrNull(j['link']),
        readAt: _date(j['readAt']),
        createdAt: _date(j['createdAt']),
      );
}

/// Người có thể giao việc / thêm theo dõi (GET /users, máy chủ đã giới hạn theo phạm vi).
class UserOption {
  const UserOption({required this.id, required this.fullName, this.unitName, this.position, this.rank, this.role});
  final int id;
  final String fullName;
  final String? unitName;
  final String? position;
  final String? rank;
  final Role? role;

  String get subtitle => [rank, position, unitName].whereType<String>().where((s) => s.isNotEmpty).join(' · ');

  /// Bỏ tài khoản quản trị và tài khoản đã khóa (như bản web).
  static List<UserOption> listFrom(Object? data) => _list(data)
      .where((j) => j['isActive'] != false && j['role'] != 'ADMIN')
      .map(UserOption.fromJson)
      .toList();

  factory UserOption.fromJson(Json j) => UserOption(
        id: _int(j['id']),
        fullName: _str(j['fullName']),
        unitName: _strOrNull(_map(j['unit'])['name']),
        position: _strOrNull(j['position']),
        rank: _strOrNull(j['rank']),
        role: j['role'] == null ? null : Role.parse(j['role']),
      );

  @override
  bool operator ==(Object other) => other is UserOption && other.id == id;
  @override
  int get hashCode => id.hashCode;
}

/// Đơn vị (GET /units).
class UnitOption {
  const UnitOption({required this.id, required this.name, this.parentId, this.isActive = true});
  final int id;
  final String name;
  final int? parentId;
  final bool isActive;

  static List<UnitOption> listFrom(Object? data) =>
      _list(data).map(UnitOption.fromJson).where((u) => u.isActive).toList();

  factory UnitOption.fromJson(Json j) => UnitOption(
        id: _int(j['id']),
        name: _str(j['name']),
        parentId: _intOrNull(j['parentId']),
        isActive: j['isActive'] != false,
      );

  @override
  bool operator ==(Object other) => other is UnitOption && other.id == id;
  @override
  int get hashCode => id.hashCode;
}
