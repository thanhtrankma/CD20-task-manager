import '../models/models.dart';

class TodoGroup {
  TodoGroup(this.reason, this.items);
  final TodoReason reason;
  final List<TaskRow> items;
}

/// Nhóm "Cần xử lý" theo lý do, giữ đúng thứ tự máy chủ trả về (nhóm xuất hiện trước đứng trước,
/// trong nhóm giữ thứ tự hạn). Việc thiếu lý do được xếp vào "Mới được giao".
List<TodoGroup> groupTodo(List<TaskRow> items) {
  final groups = <TodoReason, TodoGroup>{};
  for (final t in items) {
    final reason = t.reason ?? TodoReason.newTask;
    groups.putIfAbsent(reason, () => TodoGroup(reason, [])).items.add(t);
  }
  return groups.values.toList();
}
