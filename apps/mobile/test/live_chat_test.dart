// Trò chuyện với API phát triển đang chạy (không chạy mặc định). Chỉ đọc: không gửi tin, không tạo nhóm,
// không báo đã đọc, không đổi ảnh đại diện.
//
//   LIVE_API=http://localhost:3100 flutter test test/live_chat_test.dart
//
// Mật khẩu tài khoản mẫu đọc từ DEMO_PASSWORD trong apps/api/.env, không in ra.
import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/api/api_client.dart';
import 'package:giaoviec/api/session_store.dart';
import 'package:giaoviec/chat/sse.dart';
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

// ignore: avoid_print
void _log(String s) => print(s);

void main() {
  final base = Platform.environment['LIVE_API'];
  final password = _demoPassword();
  final skip = base == null
      ? 'Đặt LIVE_API để chạy'
      : password == null
      ? 'Không đọc được DEMO_PASSWORD'
      : null;

  test('cán bộ xem danh sách trò chuyện, số chưa đọc, danh bạ, luồng thời gian thực', () async {
    final api = ApiClient(baseUrl: base!, store: MemorySessionStore());
    await api.login('canbo', password!);
    try {
      final meJson = (await api.get('/auth/me') as Map).cast<String, dynamic>();
      final me = Me.fromJson(meJson);
      expect(me.role, Role.staff);
      expect(meJson.containsKey('avatarUrl'), isTrue, reason: '/auth/me phải có avatarUrl (có thể null)');

      final unread = await api.get('/chat/unread') as Map;
      expect(unread['count'], isA<num>());

      final convs = Conversation.listFrom(await api.get('/chat/conversations'));
      _log('canbo: ${convs.length} cuộc trò chuyện, ${unread['count']} tin chưa đọc');
      if (convs.isNotEmpty) {
        // Chỉ đọc: chi tiết và trang tin đầu (không gọi /read).
        final d = ConversationDetail.fromJson((await api.get('/chat/conversations/${convs.first.id}') as Map).cast());
        expect(d.members.map((m) => m.id), contains(me.id));
        final page = MessagePage.fromJson(
          (await api.get('/chat/conversations/${convs.first.id}/messages', query: {'limit': 5}) as Map).cast(),
        );
        expect(page.items.length, lessThanOrEqualTo(5));
        for (var i = 1; i < page.items.length; i++) {
          expect(page.items[i].id, lessThan(page.items[i - 1].id), reason: 'tin mới nhất trước');
        }
      }

      final all = UserBrief.listFrom(await api.get('/chat/directory'));
      expect(all, isNotEmpty);
      expect(all.length, lessThanOrEqualTo(50));
      expect(all.map((u) => u.id), isNot(contains(me.id)), reason: 'danh bạ không có chính mình');
      final word = all.first.fullName.split(RegExp(r'\s+')).last;
      final found = UserBrief.listFrom(await api.get('/chat/directory', query: {'q': word}));
      expect(found.map((u) => u.id), contains(all.first.id));
      _log('danh bạ: ${all.length} người; tìm "$word": ${found.length}');

      // Ảnh đại diện (nếu có người đã đặt): tải được kèm cookie phiên.
      final withAvatar = all.where((u) => u.avatarUrl != null).toList();
      if (withAvatar.isNotEmpty) {
        final bytes = await api.downloadServerPath(withAvatar.first.avatarUrl!);
        expect(bytes, isNotEmpty);
        _log('đã tải ảnh đại diện (${bytes.length} byte)');
      } else {
        _log('chưa ai có ảnh đại diện');
      }

      // Luồng: mở, nhận khối đầu (`retry`) rồi đóng ngay.
      final abort = Completer<void>();
      final bytes = await api.openEventStream('/chat/stream', abort: abort.future);
      var chunks = 0;
      final events = <SseEvent>[];
      final got = Completer<void>();
      final sub = parseSse(
        bytes,
        onChunk: () {
          chunks++;
          if (!got.isCompleted) got.complete();
        },
      ).listen(events.add, onError: (_) {});
      await got.future.timeout(const Duration(seconds: 10));
      abort.complete();
      await sub.cancel();
      expect(chunks, greaterThan(0));
      _log('luồng: nhận $chunks gói, ${events.length} sự kiện');
    } finally {
      await api.logout();
    }
    expect(api.hasSession, isFalse);
  }, skip: skip);
}
