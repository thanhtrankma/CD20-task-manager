// Kiểm thử đơn vị trò chuyện: đọc luồng SSE, sự kiện, định dạng, ghép tin, ảnh đại diện, đường dẫn thông báo.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/api/api_client.dart';
import 'package:giaoviec/api/session_store.dart';
import 'package:giaoviec/chat/chat_service.dart';
import 'package:giaoviec/chat/sse.dart';
import 'package:giaoviec/models/models.dart';
import 'package:giaoviec/push/messaging.dart';
import 'package:giaoviec/services/attachments.dart';
import 'package:giaoviec/util/chat_format.dart';

Future<List<SseEvent>> _parse(List<List<int>> chunks) => parseSse(Stream.fromIterable(chunks)).toList();

List<int> _b(String s) => utf8.encode(s);

ChatMessage _msg(int id, {int? sender, DateTime? at, bool system = false, bool deleted = false, String body = 'x'}) =>
    ChatMessage(
      id: id,
      conversationId: 5,
      isSystem: system,
      body: deleted ? '' : body,
      sender: sender == null ? null : ChatSender(id: sender, fullName: 'Nguyễn Văn An'),
      createdAt: at ?? DateTime.now(),
      deletedAt: deleted ? DateTime.now() : null,
    );

void main() {
  group('SSE', () {
    test('sự kiện có tên, bỏ chú thích ping và retry, nối nhiều dòng data', () async {
      final events = await _parse([
        _b('retry: 5000\n\n'),
        _b(': ping\n\n'),
        _b('event: message\ndata: {"a":1}\n\n'),
        _b('event: read\ndata: dòng 1\ndata: dòng 2\n\n'),
        _b('data: không tên\n\n'),
      ]);
      expect(events.map((e) => e.event), ['message', 'read', 'message']);
      expect(events[0].data, '{"a":1}');
      expect(events[1].data, 'dòng 1\ndòng 2');
      expect(events[2].data, 'không tên');
    });

    test('gói bị cắt ở giữa dòng, giữa ký tự UTF-8, giữa \\r\\n', () async {
      final whole = _b('event: message\r\ndata: {"body":"Đồng chí"}\r\n\r\n: ping\r\n\r\nevent: x\ndata:1\n\n');
      // Cắt từng byte một.
      final events = await _parse([
        for (final b in whole) [b],
      ]);
      expect(events, hasLength(2));
      expect(events[0].event, 'message');
      expect(jsonDecode(events[0].data), {'body': 'Đồng chí'});
      expect(events[1].event, 'x');
      expect(events[1].data, '1'); // không có dấu cách sau dấu hai chấm
    });

    test('bỏ khối không có data, phần dở dang khi đóng luồng, dấu BOM', () async {
      final events = await _parse([
        _b('﻿event: message\n\n'),
        _b('event: message\ndata: {"id":1}\n\nevent: message\ndata: {"id":2}'),
      ]);
      expect(events, hasLength(1));
      expect(events.single.data, '{"id":1}');
    });

    test('onChunk được gọi cả khi chỉ có chú thích', () async {
      var chunks = 0;
      await parseSse(Stream.fromIterable([_b(': ping\n\n'), _b(': ping\n\n')]), onChunk: () => chunks++).toList();
      expect(chunks, 2);
    });

    test('phân tích sự kiện trò chuyện', () {
      final m = chatEventFromSse(
        SseEvent(
          'message',
          jsonEncode({
            'id': 9,
            'conversationId': 5,
            'kind': 'TEXT',
            'body': 'Chào',
            'sender': {'id': 2, 'fullName': 'Trần Thị Bình', 'avatarUrl': null},
            'createdAt': '2026-10-29T01:00:00.000Z',
            'deletedAt': null,
          }),
        ),
      );
      expect(m, isA<ChatMessageEvent>());
      expect((m as ChatMessageEvent).message.body, 'Chào');
      expect(m.message.sender!.id, 2);
      final d = chatEventFromSse(const SseEvent('message_deleted', '{"conversationId":5,"id":9}'));
      expect((d as ChatMessageDeletedEvent).id, 9);
      expect((chatEventFromSse(const SseEvent('conversation', '{"id":7}')) as ChatConversationEvent).id, 7);
      final r = chatEventFromSse(const SseEvent('read', '{"conversationId":5,"userId":2,"messageId":9}'));
      expect((r as ChatReadEvent).messageId, 9);
      expect(chatEventFromSse(const SseEvent('message', 'không phải json')), isNull);
      expect(chatEventFromSse(const SseEvent('la', '{"id":1}')), isNull);
      expect(chatEventFromSse(const SseEvent('read', '{"conversationId":5}')), isNull);
    });
  });

  group('định dạng trò chuyện', () {
    Conversation conv(ConversationType type, ChatMessage? last) =>
        Conversation(id: 1, type: type, name: 'Tổ soạn đề', lastMessage: last);

    test('xem trước tin cuối', () {
      expect(messagePreview(conv(ConversationType.group, null), 1), ('Chưa có tin nhắn', true));
      expect(messagePreview(conv(ConversationType.group, _msg(1, sender: 3, body: 'Họp\nlúc 14h')), 1), (
        'An: Họp lúc 14h',
        false,
      ));
      expect(messagePreview(conv(ConversationType.direct, _msg(1, sender: 3, body: 'Chào')), 1), ('Chào', false));
      expect(messagePreview(conv(ConversationType.direct, _msg(1, sender: 1, body: 'Chào')), 1), ('Tôi: Chào', false));
      expect(messagePreview(conv(ConversationType.unit, _msg(1, system: true, body: 'Nhóm được tạo')), 1), (
        'Nhóm được tạo',
        true,
      ));
      expect(messagePreview(conv(ConversationType.group, _msg(1, sender: 3, deleted: true)), 1), (recalledText, true));
    });

    test('thu hồi: chỉ tin của mình, chưa thu hồi, trong 24 giờ', () {
      final now = DateTime(2026, 10, 29, 12);
      expect(canRecall(_msg(1, sender: 1, at: now.subtract(const Duration(hours: 23))), 1, now: now), isTrue);
      expect(canRecall(_msg(1, sender: 1, at: now.subtract(const Duration(hours: 24))), 1, now: now), isFalse);
      expect(canRecall(_msg(1, sender: 2, at: now), 1, now: now), isFalse);
      expect(canRecall(_msg(1, sender: 1, at: now, deleted: true), 1, now: now), isFalse);
      expect(canRecall(_msg(1, at: now, system: true), 1, now: now), isFalse);
      expect(canRecall(_msg(1, sender: 1, at: now), null, now: now), isFalse);
    });

    test('ghép tin: bỏ trùng, mới nhất trước, bản mới thay bản cũ', () {
      final merged = mergeMessages([_msg(3), _msg(1)], [_msg(2), _msg(3, deleted: true), _msg(4)]);
      expect(merged.map((m) => m.id), [4, 3, 2, 1]);
      expect(merged[1].isDeleted, isTrue);
    });

    test('giờ ở danh sách và dòng ngày', () {
      final now = DateTime(2026, 10, 29, 15, 30);
      expect(chatListTime(DateTime(2026, 10, 29, 9, 5), now: now), '09:05');
      expect(chatListTime(DateTime(2026, 10, 28, 23, 0), now: now), 'Hôm qua');
      expect(chatListTime(DateTime(2026, 10, 27, 8, 0), now: now), 'Thứ Ba');
      expect(chatListTime(DateTime(2026, 9, 2), now: now), '02/09');
      expect(chatListTime(DateTime(2025, 9, 2), now: now), '02/09/2025');
      expect(chatDayLabel(DateTime(2026, 10, 29, 1), now: now), 'Hôm nay');
      expect(chatDayLabel(DateTime(2026, 10, 28, 1), now: now), 'Hôm qua');
      expect(chatDayLabel(DateTime(2026, 10, 25, 1), now: now), 'Chủ nhật, 25/10/2026');
      expect(shortName('  Nguyễn Văn   An '), 'An');
    });
  });

  group('mô hình', () {
    test('ConversationItem, chi tiết, trang tin', () {
      final d = ConversationDetail.fromJson({
        'id': 5,
        'type': 'DIRECT',
        'name': 'Trần Thị Bình',
        'unitId': null,
        'includeSubunits': false,
        'memberCount': 2,
        'peer': {
          'id': 2,
          'fullName': 'Trần Thị Bình',
          'rank': 'Đại úy',
          'position': 'Giảng viên',
          'unit': {'id': 1, 'name': 'Khoa CNTT'},
          'avatarUrl': '/api/users/2/avatar?v=1',
        },
        'lastMessage': null,
        'unread': 3,
        'muted': true,
        'lastMessageAt': null,
        'createdAt': '2026-10-01T00:00:00.000Z',
        'members': [
          {
            'id': 1,
            'fullName': 'A',
            'unit': {'id': 1, 'name': 'K'},
            'role': 'OWNER',
            'lastReadMessageId': 7,
          },
          {
            'id': 2,
            'fullName': 'B',
            'unit': {'id': 1, 'name': 'K'},
            'role': 'MEMBER',
            'lastReadMessageId': 0,
          },
        ],
        'canManage': false,
        'canAddMembers': false,
        'canLeave': false,
      });
      expect(d.conversation.isDirect, isTrue);
      expect(d.conversation.peer!.rankName, 'Đại úy Trần Thị Bình');
      expect(d.conversation.peer!.subtitle, 'Giảng viên · Khoa CNTT');
      expect(d.conversation.unread, 3);
      expect(d.conversation.muted, isTrue);
      expect(d.members.first.isOwner, isTrue);
      expect(d.members.first.lastReadMessageId, 7);
      final p = MessagePage.fromJson({
        'items': [
          {'id': 2, 'conversationId': 5, 'kind': 'SYSTEM', 'body': 'A đã thêm B', 'sender': null, 'createdAt': ''},
        ],
        'hasMore': true,
      });
      expect(p.hasMore, isTrue);
      expect(p.items.single.isSystem, isTrue);
      expect(p.items.single.sender, isNull);
      expect(Me.fromJson({'id': 1, 'avatarUrl': '/api/users/1/avatar?v=2'}).avatarUrl, '/api/users/1/avatar?v=2');
    });

    test('đường dẫn thông báo trò chuyện', () {
      expect(PushMessage.fromData(data: {'link': '/chat/5'}).chatId, 5);
      expect(PushMessage.fromData(data: {'link': '/chat/5'}).taskId, isNull);
      expect(PushMessage.fromData(data: {'link': '/tasks/5'}).chatId, isNull);
      expect(PushMessage.fromData(data: {'link': '/chat/5/x'}).chatId, isNull);
      expect(AppNotification.fromJson({'id': 1, 'link': '/chat/12'}).chatId, 12);
    });
  });

  group('ảnh đại diện', () {
    test('nhận dạng JPEG / PNG theo chữ ký tệp', () {
      expect(avatarContentType([0xFF, 0xD8, 0xFF, 0xE0]), 'image/jpeg');
      expect(avatarContentType([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0]), 'image/png');
      expect(avatarContentType(utf8.encode('GIF89a')), isNull);
      expect(avatarContentType([]), isNull);
    });

    test('đường dẫn ảnh chỉ trên cùng máy chủ', () {
      final api = ApiClient(baseUrl: 'https://giaoviec.example', store: MemorySessionStore());
      expect(
        api.serverUri('/api/users/12/avatar?v=1a2b').toString(),
        'https://giaoviec.example/api/users/12/avatar?v=1a2b',
      );
      expect(api.serverUri('https://khac.example/api/users/1/avatar'), isNull);
      expect(api.serverUri('//khac.example/api/x'), isNull);
      expect(api.serverUri('/api/../auth/logout'), isNull);
      expect(api.serverUri('/khac'), isNull);
    });
  });
}
