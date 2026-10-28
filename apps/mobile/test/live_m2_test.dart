// Kiểm thử mốc 2 với API phát triển đang chạy (không chạy mặc định).
//
//   LIVE_API=http://localhost:3100 flutter test test/live_m2_test.dart
//
// Mật khẩu tài khoản mẫu đọc từ DEMO_PASSWORD trong apps/api/.env, không in ra.
// Trưởng khoa giao nhanh "[Thử app] ..." cho cán bộ, sửa, thêm người theo dõi, giao cho đơn vị mình, chia việc con,
// thử giao ra ngoài phạm vi (403), rồi hủy các nhiệm vụ đã tạo. Đăng ký / hủy đăng ký thiết bị (mã giả).
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/api/api_client.dart';
import 'package:giaoviec/api/session_store.dart';
import 'package:giaoviec/config.dart';
import 'package:giaoviec/models/models.dart';
import 'package:giaoviec/screens/pickers.dart' show unitsInScope;
import 'package:giaoviec/util/task_forms.dart';

String? _demoPassword() {
  final f = File('../api/.env');
  if (!f.existsSync()) return null;
  for (final line in f.readAsLinesSync()) {
    final m = RegExp(r'^\s*DEMO_PASSWORD\s*=\s*(.*)$').firstMatch(line);
    if (m != null) return m.group(1)!.trim().replaceAll(RegExp(r'''^["']|["']$'''), '');
  }
  return null;
}

void main() {
  final base = Platform.environment['LIVE_API'];
  final password = _demoPassword();
  final skip = base == null
      ? 'Đặt LIVE_API để chạy'
      : password == null
          ? 'Không đọc được DEMO_PASSWORD'
          : null;

  test('giao nhanh, sửa, theo dõi, việc con, hủy; đăng ký thiết bị', () async {
    final head = ApiClient(baseUrl: base!, store: MemorySessionStore());
    await head.login('truongkhoa', password!);
    final me = Me.fromJson((await head.get('/auth/me') as Map).cast());
    expect(me.role, Role.unitHead);
    expect(me.unitId, isNotNull);

    // Người có thể giao (máy chủ giới hạn theo phạm vi đơn vị).
    final users = UserOption.listFrom(await head.get('/users', query: {'q': 'canbo'}));
    final staff = users.firstWhere((u) => u.role == Role.staff);
    final created = <int>[];

    try {
      // 1. Giao nhanh.
      final draft = QuickAssignDraft()
        ..title = '[Thử app] Giao nhanh từ ứng dụng di động'
        ..priority = Priority.high
        ..source = 'Kiểm thử ứng dụng di động mốc 2';
      draft.assignees.add(staff);
      expect(draft.validate(), isNull);
      final task = await head.post('/tasks', draft.toJson()) as Map;
      final id = (task['id'] as num).toInt();
      created.add(id);
      var detail = TaskDetail.fromJson((await head.get('/tasks/$id') as Map).cast());
      expect(detail.permissions.manage, isTrue);
      expect(detail.row.priority, Priority.high);
      expect(detail.source, 'Kiểm thử ứng dụng di động mốc 2');
      expect(detail.row.assignees.single.user?.id, staff.id);
      expect(sameDay(detail.row.dueDate, draft.dueDate), isTrue);

      // 2. Sửa: chỉ gửi trường đã đổi.
      final edit = TaskEditDraft.fromTask(detail)
        ..title = '[Thử app] Giao nhanh từ ứng dụng di động (đã sửa)'
        ..dueDate = detail.row.dueDate.add(const Duration(days: 2));
      final changes = edit.changes();
      expect(changes.keys.toSet(), {'title', 'dueDate'});
      await head.patch('/tasks/$id', changes);
      detail = TaskDetail.fromJson((await head.get('/tasks/$id') as Map).cast());
      expect(detail.row.title, endsWith('(đã sửa)'));
      expect(detail.row.priority, Priority.high); // Không gửi thì không đổi.
      expect(detail.activities.any((a) => a.type == 'UPDATED'), isTrue);

      // 3. Thêm người theo dõi.
      await head.post('/tasks/$id/followers', {'userIds': [staff.id]});
      detail = TaskDetail.fromJson((await head.get('/tasks/$id') as Map).cast());
      expect(detail.followers.map((f) => f.id), contains(staff.id));

      // 4. Giao cho đơn vị mình, rồi chia việc con cho cán bộ.
      final units = UnitOption.listFrom(await head.get('/units'));
      final own = units.firstWhere((u) => u.id == me.unitId);
      final unitDraft = QuickAssignDraft()..title = '[Thử app] Giao cho đơn vị từ ứng dụng';
      unitDraft.units.add(own);
      final unitTask = await head.post('/tasks', unitDraft.toJson()) as Map;
      final unitTaskId = (unitTask['id'] as num).toInt();
      created.add(unitTaskId);
      final parent = TaskDetail.fromJson((await head.get('/tasks/$unitTaskId') as Map).cast());
      expect(parent.permissions.work, isTrue);
      final sub = QuickAssignDraft(parentId: unitTaskId, parentDue: parent.row.dueDate)
        ..title = '[Thử app] Việc con từ ứng dụng';
      sub.assignees.add(staff);
      final child = await head.post('/tasks', sub.toJson()) as Map;
      final childId = (child['id'] as num).toInt();
      created.add(childId);
      final childDetail = TaskDetail.fromJson((await head.get('/tasks/$childId') as Map).cast());
      expect(childDetail.parent?.id, unitTaskId);

      // 5. Giao ra ngoài phạm vi đơn vị: 403, không tạo nhiệm vụ.
      final outside = units.where((u) => !unitsInScope(units, me.unitId!).contains(u)).toList();
      if (outside.isNotEmpty) {
        final bad = QuickAssignDraft()..title = '[Thử app] Không được tạo';
        bad.units.add(outside.first);
        await expectLater(
          head.post('/tasks', bad.toJson()),
          throwsA(isA<ApiException>().having((e) => e.status, 'status', 403)),
        );
      }
    } finally {
      // 6. Hủy các nhiệm vụ đã tạo (việc con trước).
      for (final id in created.reversed) {
        await head.patch('/tasks/$id', {'status': 'CANCELLED'});
        final d = TaskDetail.fromJson((await head.get('/tasks/$id') as Map).cast());
        expect(d.status, TaskStatus.cancelled);
      }
    }

    // 7. Thiết bị nhận thông báo đẩy (mã giả đúng định dạng). Máy chủ chưa có thì 404.
    final token = 'thu-app-${DateTime.now().millisecondsSinceEpoch}:fake_fcm_token_for_smoke_test';
    try {
      await head.post('/devices', {'platform': 'ANDROID', 'provider': 'FCM', 'token': token, 'appVersion': appVersion});
      await head.post('/devices', {'platform': 'ANDROID', 'provider': 'FCM', 'token': token, 'appVersion': appVersion});
      final settings = await head.get('/notifications/settings') as Map;
      final mobile = settings['mobile'] as Map;
      expect(mobile['enabled'], isA<bool>());
      expect(mobile['devices'], greaterThanOrEqualTo(1));
      await head.post('/devices/unregister', {'token': token});
      final after = (await head.get('/notifications/settings') as Map)['mobile'] as Map;
      expect(after['devices'], (mobile['devices'] as num) - 1);
    } on ApiException catch (e) {
      if (e.status != 404) rethrow;
      markTestSkipped('Máy chủ chưa có /devices (404)');
    }

    await head.logout();
    expect(head.hasSession, isFalse);
  }, skip: skip, timeout: const Timeout(Duration(minutes: 2)));
}
