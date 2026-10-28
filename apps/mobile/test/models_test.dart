import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/models/models.dart';
import 'package:giaoviec/util/activity.dart';
import 'package:giaoviec/util/todo_groups.dart';

Map<String, dynamic> task(int id, String reason, {String status = 'IN_PROGRESS', String due = '2026-05-15T10:00:00.000Z'}) => {
      'id': id,
      'title': 'Việc $id',
      'dueDate': due,
      'priority': 'NORMAL',
      'status': status,
      'progress': 0,
      'overdue': false,
      'createdBy': {'id': 1, 'fullName': 'Trưởng khoa'},
      'assignees': [
        {'id': 10, 'role': 'LEAD', 'user': {'id': 2, 'fullName': 'Cán bộ A'}, 'unit': null, 'acknowledgedAt': null},
      ],
      'reason': reason,
    };

void main() {
  group('groupTodo', () {
    test('nhóm theo lý do, giữ thứ tự nhóm và thứ tự việc của máy chủ', () {
      final items = [
        task(1, 'overdue'),
        task(2, 'overdue'),
        task(3, 'review'),
        task(4, 'soon'),
        task(5, 'new', status: 'NEW'),
        task(6, 'soon'),
      ].map(TaskRow.fromJson).toList();
      final groups = groupTodo(items);
      expect(groups.map((g) => g.reason), [TodoReason.overdue, TodoReason.review, TodoReason.soon, TodoReason.newTask]);
      expect(groups[0].items.map((t) => t.id), [1, 2]);
      expect(groups[2].items.map((t) => t.id), [4, 6]);
    });

    test('lý do lạ hoặc thiếu không làm vỡ ứng dụng', () {
      final weird = TaskRow.fromJson({...task(7, 'x')});
      final none = TaskRow.fromJson({...task(8, 'today')}..remove('reason'));
      final groups = groupTodo([weird, none]);
      expect(groups.single.reason, TodoReason.newTask);
      expect(groups.single.items.length, 2);
    });

    test('danh sách rỗng', () => expect(groupTodo([]), isEmpty));
  });

  group('TaskDetail.fromJson', () {
    test('thiếu các trường mới (theo dõi, gia hạn, hoạt động) vẫn đọc được', () {
      final t = TaskDetail.fromJson({...task(9, 'today'), 'description': null, 'permissions': {'work': true}});
      expect(t.followers, isEmpty);
      expect(t.activities, isEmpty);
      expect(t.extensionRequests, isEmpty);
      expect(t.pendingExtension, isNull);
      expect(t.permissions.work, isTrue);
      expect(t.permissions.acknowledge, isFalse);
      expect(t.row.leads, 'Cán bộ A');
    });

    test('đọc đủ trường chi tiết', () {
      final t = TaskDetail.fromJson({
        ...task(9, 'today'),
        'source': 'Kết luận giao ban 12/5',
        'followers': [
          {'id': 1, 'createdAt': '2026-05-01T00:00:00Z', 'user': {'id': 5, 'fullName': 'Lãnh đạo B'}},
        ],
        'extensionRequests': [
          {'id': 3, 'newDueDate': '2026-05-20T16:59:59Z', 'reason': 'Chờ số liệu', 'status': 'PENDING', 'requestedBy': {'id': 2, 'fullName': 'A'}},
        ],
        'submissions': [
          {'id': 4, 'content': 'Xong', 'status': 'PENDING', 'submittedBy': {'id': 2, 'fullName': 'A'}, 'attachments': [{'id': 8, 'originalName': 'anh.jpg', 'size': 1200}]},
        ],
        'activities': [
          {'id': 1, 'type': 'PROGRESS', 'detail': {'progress': 50}, 'createdAt': '2026-05-02T00:00:00Z', 'user': {'id': 2, 'fullName': 'A'}},
        ],
        'updates': [
          {'id': 1, 'progress': 50, 'note': 'Đã khảo sát', 'createdAt': '2026-05-02T00:00:02Z', 'user': {'id': 2, 'fullName': 'A'}},
        ],
        'permissions': {'manage': true, 'work': false, 'acknowledge': false},
        'following': false,
      });
      expect(t.source, 'Kết luận giao ban 12/5');
      expect(t.followers.single.fullName, 'Lãnh đạo B');
      expect(t.pendingExtension!.reason, 'Chờ số liệu');
      expect(t.submissions.single.attachments.single.originalName, 'anh.jpg');
      expect(describeActivity(t.activities.single), 'cập nhật tiến độ 50%');
      expect(progressNoteFor(t.activities.single, t.updates), 'Đã khảo sát');
    });
  });

  test('AppNotification.taskId đọc từ đường dẫn /tasks/123', () {
    AppNotification n(String? link) => AppNotification.fromJson({'id': 1, 'title': 't', 'link': link});
    expect(n('/tasks/123').taskId, 123);
    expect(n('/tasks/45?tab=x').taskId, 45);
    expect(n('/').taskId, isNull);
    expect(n(null).taskId, isNull);
  });

  test('describeActivity: đổi hạn và loại chưa biết', () {
    Activity a(String type, Map<String, dynamic> d) =>
        Activity.fromJson({'id': 1, 'type': type, 'detail': d, 'user': {'id': 1, 'fullName': 'X'}});
    expect(
      describeActivity(a('UPDATED', {'oldDueDate': '2026-05-01T03:00:00Z', 'newDueDate': '2026-05-09T03:00:00Z', 'fields': ['title']})),
      'đổi hạn 01/05/2026 → 09/05/2026, sửa tên',
    );
    expect(describeActivity(a('SOMETHING_NEW', {})), 'cập nhật nhiệm vụ');
  });
}
