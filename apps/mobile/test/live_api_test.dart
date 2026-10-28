// Kiểm thử nhanh với API phát triển đang chạy (không chạy mặc định).
//
//   LIVE_API=http://localhost:3100 flutter test test/live_api_test.dart
//
// Mật khẩu tài khoản mẫu đọc từ DEMO_PASSWORD trong apps/api/.env, không in ra.
// Tạo đúng một nhiệm vụ "[Thử app] ..." (trưởng khoa giao cho cán bộ) và đi hết vòng đời tới Hoàn thành.
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/api/api_client.dart';
import 'package:giaoviec/api/session_store.dart';
import 'package:giaoviec/models/models.dart';

String? _demoPassword() {
  final f = File('../api/.env');
  if (!f.existsSync()) return null;
  for (final line in f.readAsLinesSync()) {
    final m = RegExp(r'^\s*DEMO_PASSWORD\s*=\s*(.*)$').firstMatch(line);
    if (m != null) return m.group(1)!.trim().replaceAll(RegExp(r'''^["']|["']$'''), '');
  }
  return null;
}

// Ảnh PNG 1x1.
final _png = Uint8List.fromList([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, //
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
  0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, 0xCF, 0xC0, 0xF0,
  0x1F, 0x00, 0x05, 0x00, 0x01, 0xFF, 0x89, 0x99, 0x3D, 0x1D, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

void main() {
  final base = Platform.environment['LIVE_API'];
  final password = _demoPassword();
  final skip = base == null
      ? 'Đặt LIVE_API để chạy'
      : password == null
          ? 'Không đọc được DEMO_PASSWORD'
          : null;

  test('vòng đời nhiệm vụ qua API thật', () async {
    final staff = ApiClient(baseUrl: base!, store: MemorySessionStore());
    final head = ApiClient(baseUrl: base, store: MemorySessionStore());

    // Đăng nhập, thông tin người dùng.
    await staff.login('canbo', password!);
    await head.login('truongkhoa', password);
    final staffMe = Me.fromJson((await staff.get('/auth/me') as Map).cast());
    final headMe = Me.fromJson((await head.get('/auth/me') as Map).cast());
    expect(staffMe.role, Role.staff);
    expect(headMe.role, Role.unitHead);

    // Danh sách, số đếm, thông báo.
    TaskCounts.fromJson((await staff.get('/tasks/counts') as Map).cast());
    final todo = await staff.get('/tasks/todo') as Map;
    expect(todo['items'], isA<List>());
    for (final view in ['assigned', 'following']) {
      final p = Paged.fromJson((await staff.get('/tasks', query: {'view': view, 'page': 1}) as Map).cast(), TaskRow.fromJson);
      expect(p.page, 1);
    }
    for (final view in ['created', 'review']) {
      await head.get('/tasks', query: {'view': view, 'page': 1});
    }
    expect(await staff.get('/notifications'), isA<List>());
    expect((await staff.get('/notifications/unread-count') as Map)['count'], isA<num>());

    // Trưởng khoa giao việc cho cán bộ (API tạo việc chưa có trên ứng dụng, chỉ dùng để thử).
    final due = DateTime.now().add(const Duration(days: 2));
    final created = await head.post('/tasks', {
      'title': '[Thử app] Kiểm tra ứng dụng di động',
      'dueDate': due.toUtc().toIso8601String(),
      'assignees': [
        {'userId': staffMe.id, 'role': 'LEAD'},
      ],
    }) as Map;
    final id = created['id'] as int;
    final path = '/tasks/$id';

    var t = TaskDetail.fromJson((await staff.get(path) as Map).cast());
    expect(t.permissions.acknowledge, isTrue);
    expect(t.permissions.work, isTrue);
    expect(t.permissions.manage, isFalse);

    // Cán bộ: đã nhận, tiến độ, theo dõi/bỏ theo dõi, trao đổi, xin gia hạn.
    await staff.post('$path/acknowledge');
    await staff.post('$path/progress', {'progress': 50, 'note': 'Đã thử trên điện thoại'});
    await staff.post('$path/follow');
    await staff.post('$path/unfollow');
    await staff.post('$path/comments', {'content': 'Ý kiến thử từ ứng dụng'});
    await staff.post('$path/extensions', {
      'newDueDate': DateTime(due.year, due.month, due.day + 3, 23, 59, 59).toUtc().toIso8601String(),
      'reason': 'Thử xin gia hạn',
    });

    // Thông báo của trưởng khoa trỏ về nhiệm vụ.
    final notes = (await head.get('/notifications') as List).map((e) => AppNotification.fromJson((e as Map).cast()));
    final note = notes.firstWhere((n) => n.taskId == id);
    await head.post('/notifications/${note.id}/read');

    // Trưởng khoa: đôn đốc, chấp thuận gia hạn.
    final nudge = await head.post('$path/nudge') as Map;
    expect(nudge['remaining'], isA<num>());
    t = TaskDetail.fromJson((await head.get(path) as Map).cast());
    expect(t.permissions.manage, isTrue);
    await head.post('/tasks/extensions/${t.pendingExtension!.id}/decide', {'decision': 'APPROVED', 'note': 'Đồng ý'});

    // Cán bộ: tải ảnh lên, nộp báo cáo kèm ảnh.
    final file = FileRef.fromJson((await staff.upload('/files', bytes: _png, filename: 'anh_thu.png', query: {'taskId': id}) as Map).cast());
    await staff.post('$path/submissions', {'content': 'Báo cáo thử từ ứng dụng', 'attachmentIds': [file.id]});

    // Trưởng khoa: tải tệp về, duyệt báo cáo.
    final bytes = await head.download('/files/${file.id}/download');
    expect(bytes, _png);
    t = TaskDetail.fromJson((await head.get(path) as Map).cast());
    final sub = t.submissions.first;
    expect(sub.attachments.single.id, file.id);
    await head.post('/submissions/${sub.id}/review', {'decision': 'APPROVED'});

    t = TaskDetail.fromJson((await staff.get(path) as Map).cast());
    expect(t.status, TaskStatus.done);
    expect(t.comments, isNotEmpty);
    final types = t.activities.map((a) => a.type).toSet();
    expect(types, containsAll(['CREATED', 'ACKNOWLEDGED', 'PROGRESS', 'NUDGED', 'EXTENSION_APPROVED', 'APPROVED']));

    // Đôn đốc lần nữa khi việc đã xong: máy chủ từ chối, ứng dụng hiện câu lỗi.
    await expectLater(head.post('$path/nudge'), throwsA(isA<ApiException>().having((e) => e.status, 'status', 400)));

    // Đăng xuất: phiên bị thu hồi phía máy chủ.
    await staff.logout();
    await head.logout();
    expect(staff.hasSession, isFalse);
  }, skip: skip, timeout: const Timeout(Duration(minutes: 2)));
}
