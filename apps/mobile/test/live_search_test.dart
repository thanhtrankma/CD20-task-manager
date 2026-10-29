// Tìm nhiệm vụ với API phát triển đang chạy (không chạy mặc định). Chỉ đọc, không tạo / sửa dữ liệu.
//
//   LIVE_API=http://localhost:3100 flutter test test/live_search_test.dart
//
// Mật khẩu tài khoản mẫu đọc từ DEMO_PASSWORD trong apps/api/.env, không in ra.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/api/api_client.dart';
import 'package:giaoviec/api/session_store.dart';
import 'package:giaoviec/models/models.dart';
import 'package:giaoviec/screens/search_screen.dart';

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

  test('cán bộ tìm nhiệm vụ theo tên, lọc trạng thái, quá hạn, phân trang', () async {
    final api = ApiClient(baseUrl: base!, store: MemorySessionStore());
    await api.login('canbo', password!);
    try {
      final me = Me.fromJson((await api.get('/auth/me') as Map).cast());
      expect(me.role, Role.staff);
      // Thông tin 2 lớp mới có trong /auth/me.
      expect(me.twoFactorMandatory, isFalse);

      Future<Paged<TaskRow>> search(String q, {int page = 1, TaskStatus? status, bool overdue = false}) async =>
          Paged.fromJson(
            (await api.get('/tasks', query: searchQuery(q, page: page, status: status, overdue: overdue)) as Map)
                .cast(),
            TaskRow.fromJson,
          );

      // Lấy một từ trong tên một việc cán bộ được xem để tìm lại.
      final all = Paged.fromJson((await api.get('/tasks', query: {'page': 1, 'pageSize': 20}) as Map).cast(),
          TaskRow.fromJson);
      expect(all.items, isNotEmpty, reason: 'Tài khoản canbo cần có ít nhất một nhiệm vụ trong dữ liệu mẫu');
      final word = all.items.first.title.split(RegExp(r'\s+')).firstWhere((w) => w.length >= 3);
      final found = await search(word);
      expect(found.pageSize, searchPageSize);
      expect(found.items.map((t) => t.id), contains(all.items.first.id));
      final lower = word.toLowerCase();
      // Máy chủ tìm theo tên hoặc căn cứ, không phân biệt hoa thường.
      expect(found.items.where((t) => t.title.toLowerCase().contains(lower)), isNotEmpty);

      final none = await search('zzqq-khong-co-nhiem-vu-nay-${DateTime.now().millisecondsSinceEpoch}');
      expect(none.items, isEmpty);
      expect(none.total, 0);

      final status = all.items.first.status;
      final byStatus = await search(word, status: status);
      expect(byStatus.items.every((t) => t.status == status), isTrue);

      if (found.hasMore) {
        final p2 = await search(word, page: 2);
        expect(p2.page, 2);
      }

      // Bộ lọc quá hạn: máy chủ mới có thì mọi việc trả về đều quá hạn; bản cũ trả 400 (ứng dụng bỏ lọc).
      try {
        final overdue = await search(word, overdue: true);
        expect(overdue.items.every((t) => t.overdue), isTrue);
        // ignore: avoid_print
        print('overdue=1: máy chủ đã hỗ trợ (${overdue.total} việc)');
      } on ApiException catch (e) {
        expect(e.status, 400);
        // ignore: avoid_print
        print('overdue=1: máy chủ chưa hỗ trợ (400)');
      }
    } finally {
      await api.logout();
    }
  }, skip: skip);
}
