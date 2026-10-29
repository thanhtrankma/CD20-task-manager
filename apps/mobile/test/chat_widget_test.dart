// Kiểm thử giao diện trò chuyện và ảnh đại diện với máy chủ giả (có luồng Server-Sent Events).
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/api/api_client.dart';
import 'package:giaoviec/api/session_store.dart';
import 'package:giaoviec/app.dart';
import 'package:giaoviec/auth/auth_controller.dart';
import 'package:giaoviec/chat/chat_service.dart';
import 'package:giaoviec/push/messaging.dart';
import 'package:giaoviec/push/push_service.dart';
import 'package:giaoviec/security/app_lock.dart';
import 'package:giaoviec/services/app_services.dart';
import 'package:giaoviec/services/attachments.dart';
import 'package:giaoviec/services/prefs.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes.dart';

const _png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';

final _jpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 74, 70, 73, 70, 0, 1, 0xFF, 0xD9]);

String _ago(Duration d) => DateTime.now().subtract(d).toUtc().toIso8601String();

Map<String, dynamic> _user(int id, String name, {String? rank, String? position, String? avatar, int unit = 1}) => {
  'id': id,
  'fullName': name,
  'rank': rank,
  'position': position,
  'unit': {'id': unit, 'name': unit == 1 ? 'Khoa CNTT' : 'Phòng Đào tạo'},
  'avatarUrl': avatar,
};

final _me = _user(1, 'Nguyễn Văn A', rank: 'Thiếu tá');
final _binh = _user(2, 'Trần Thị Bình', rank: 'Đại úy', position: 'Giảng viên', avatar: '/api/users/2/avatar?v=abc');
final _cuong = _user(3, 'Lê Văn Cường', position: 'Trợ lý');
final _dung = _user(4, 'Phạm Văn Dũng');

/// Một yêu cầu đã nhận (thân đọc sẵn).
class Req {
  Req(this.method, this.url, this.headers, this.bytes);
  final String method;
  final Uri url;
  final Map<String, String> headers;
  final List<int> bytes;
  String get path => url.path;
  String get body => utf8.decode(bytes, allowMalformed: true);
  Map<String, dynamic> get json => (jsonDecode(body) as Map).cast();
}

/// Máy chủ giả có trò chuyện, ảnh đại diện và luồng SSE điều khiển được.
class ChatServer {
  ChatServer({this.role = 'STAFF'});

  final String role;
  final requests = <Req>[];

  /// Mã trả về cho GET /chat/stream (200 thì mở luồng).
  int streamStatus = 200;
  final streams = <StreamController<List<int>>>[];
  int streamCancels = 0;

  String? avatarUrl;
  String? avatarError;
  bool unitGroupConflict = false;
  int peerRead = 101;
  final perms = <int, Map<String, bool>>{};
  int _nextId = 1000;

  /// Tin theo cuộc trò chuyện, cũ trước.
  late final messages = <int, List<Map<String, dynamic>>>{
    5: [
      _m(100, 5, _me, 'Tin cũ', _ago(const Duration(hours: 30))),
      _m(101, 5, _binh, 'Chào đồng chí', _ago(const Duration(minutes: 3))),
      _m(102, 5, _me, 'Chào Bình', _ago(const Duration(minutes: 2))),
    ],
    6: [
      _m(150, 6, null, 'Nguyễn Văn A đã tạo nhóm', _ago(const Duration(minutes: 20)), system: true),
      _m(151, 6, _cuong, 'Họp lúc 14h', _ago(const Duration(minutes: 10))),
    ],
    7: [_m(160, 7, null, 'Nhóm được tạo', _ago(const Duration(minutes: 30)), system: true)],
    8: [_m(170, 8, _cuong, '', _ago(const Duration(minutes: 40)), deleted: true)],
    9: [
      for (var i = 201; i <= 245; i++)
        _m(i, 9, i.isEven ? _cuong : _dung, 'Tin số $i', _ago(Duration(minutes: 300 - i))),
    ],
  };

  late final convs = <Map<String, dynamic>>[
    _c(5, 'DIRECT', 'Trần Thị Bình', peer: _binh, unread: 2),
    _c(6, 'GROUP', 'Tổ soạn đề', muted: true),
    _c(7, 'UNIT', 'Khoa CNTT', unitId: 1),
    _c(8, 'GROUP', 'Nhóm cũ'),
    _c(9, 'GROUP', 'Nhóm đông'),
  ];

  static Map<String, dynamic> _m(
    int id,
    int conv,
    Map<String, dynamic>? sender,
    String body,
    String at, {
    bool system = false,
    bool deleted = false,
  }) => {
    'id': id,
    'conversationId': conv,
    'kind': system ? 'SYSTEM' : 'TEXT',
    'body': deleted ? '' : body,
    'sender': sender == null
        ? null
        : {'id': sender['id'], 'fullName': sender['fullName'], 'avatarUrl': sender['avatarUrl']},
    'createdAt': at,
    'deletedAt': deleted ? at : null,
  };

  Map<String, dynamic> _c(
    int id,
    String type,
    String name, {
    Map<String, dynamic>? peer,
    int unread = 0,
    bool muted = false,
    int? unitId,
  }) => {
    'id': id,
    'type': type,
    'name': name,
    'unitId': unitId,
    'includeSubunits': false,
    'memberCount': type == 'DIRECT' ? 2 : 3,
    'peer': peer,
    'unread': unread,
    'muted': muted,
    'createdAt': _ago(const Duration(days: 3)),
  };

  Map<String, dynamic> _item(Map<String, dynamic> c) {
    final list = messages[c['id']] ?? const [];
    return {
      ...c,
      'lastMessage': list.isEmpty ? null : list.last,
      'lastMessageAt': list.isEmpty ? null : list.last['createdAt'],
    };
  }

  Map<String, dynamic> _detail(int id) {
    final c = convs.firstWhere((c) => c['id'] == id);
    final members = id == 5
        ? [
            {..._me, 'role': 'MEMBER', 'lastReadMessageId': 101},
            {..._binh, 'role': 'MEMBER', 'lastReadMessageId': peerRead},
          ]
        : [
            {..._me, 'role': 'OWNER', 'lastReadMessageId': 0},
            {..._cuong, 'role': 'MEMBER', 'lastReadMessageId': 0},
            {..._dung, 'role': 'MEMBER', 'lastReadMessageId': 0},
          ];
    final p = perms[id] ?? const {};
    return {
      ..._item(c),
      'members': members,
      'canManage': p['canManage'] ?? false,
      'canAddMembers': p['canAddMembers'] ?? false,
      'canLeave': p['canLeave'] ?? (c['type'] == 'GROUP'),
    };
  }

  Iterable<Req> where(String method, String path) => requests.where((r) => r.method == method && r.path == path);

  /// Gửi một sự kiện trên luồng đang mở.
  void emit(String event, Object data) => streams.last.add(utf8.encode('event: $event\ndata: ${jsonEncode(data)}\n\n'));

  void ping() => streams.last.add(utf8.encode(': ping\n\n'));

  late final client = MockClient.streaming((request, bodyStream) async {
    final bytes = await bodyStream.toBytes();
    final req = Req(request.method, request.url, request.headers, bytes);
    requests.add(req);
    if (req.path == '/api/chat/stream' && request.headers['Cookie'] == 'tm_session=abc' && streamStatus == 200) {
      final c = StreamController<List<int>>(onCancel: () => streamCancels++);
      streams.add(c);
      c.add(utf8.encode('retry: 5000\n\n'));
      return http.StreamedResponse(c.stream, 200, headers: {'content-type': 'text/event-stream'}, request: request);
    }
    final res = _handle(req);
    return http.StreamedResponse(Stream.value(res.bodyBytes), res.statusCode, headers: res.headers, request: request);
  });

  http.Response _json(Object body, [int status = 200]) =>
      http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});

  http.Response _handle(Req req) {
    if (req.headers['Cookie'] != 'tm_session=abc') return _json({'message': 'Chưa đăng nhập'}, 401);
    final path = req.path;
    final m = req.method;
    RegExpMatch? match(String p) => RegExp('^$p\$').firstMatch(path);

    if (path == '/api/chat/stream') return _json({'message': 'Lỗi máy chủ'}, streamStatus);
    if (path.startsWith('/api/chat') && role == 'ADMIN') return _json({'message': 'Không có quyền'}, 403);
    switch (path) {
      case '/api/auth/me':
        return _json({
          'id': 1,
          'username': 'canbo',
          'fullName': _me['fullName'],
          'rank': _me['rank'],
          'role': role,
          'unit': {'id': 1, 'name': 'Khoa CNTT'},
          'avatarUrl': avatarUrl,
        });
      case '/api/tasks/counts':
        return _json({'todo': 0, 'review': 0, 'assigned': 0, 'created': 0, 'following': 0});
      case '/api/tasks/todo':
        return _json({'items': []});
      case '/api/notifications/unread-count':
        return _json({'count': 0});
      case '/api/notifications/settings':
        return _json({
          'mobile': {'enabled': false, 'devices': 0},
        });
      case '/api/devices':
      case '/api/devices/unregister':
      case '/api/auth/logout':
        return http.Response('', 204);
      case '/api/chat/unread':
        return _json({'count': convs.fold<int>(0, (s, c) => s + (c['unread'] as int))});
      case '/api/chat/conversations':
        return _json([for (final c in convs) _item(c)]);
      case '/api/chat/directory':
        final q = (req.url.queryParameters['q'] ?? '').toLowerCase();
        return _json([
          for (final u in [_binh, _cuong, _dung])
            if ((u['fullName'] as String).toLowerCase().contains(q)) u,
        ]);
      case '/api/units':
        return _json([
          {'id': 1, 'name': 'Khoa CNTT', 'parentId': null},
          {'id': 2, 'name': 'Phòng Đào tạo', 'parentId': null},
          {'id': 3, 'name': 'Bộ môn Mạng', 'parentId': 1},
        ]);
      case '/api/chat/direct':
        return _json(_item(convs.first));
      case '/api/chat/groups':
        final body = req.json;
        final c = _c(10, 'GROUP', body['name'] as String);
        convs.insert(0, c);
        messages[10] = [];
        return _json(_item(c), 201);
      case '/api/chat/unit-groups':
        if (role == 'STAFF') return _json({'message': 'Không có quyền tạo nhóm đơn vị'}, 403);
        if (unitGroupConflict) return _json({'message': 'Conflict'}, 409);
        final unit = _c(11, 'UNIT', 'Bộ môn Mạng', unitId: 3);
        convs.insert(0, unit);
        messages[11] = [];
        return _json(_item(unit), 201);
      case '/api/users/me/avatar':
        if (m == 'DELETE') {
          avatarUrl = null;
          return http.Response('', 204);
        }
        if (avatarError != null) return _json({'message': avatarError!}, 400);
        avatarUrl = '/api/users/1/avatar?v=new1';
        return _json({'avatarUrl': avatarUrl}, 201);
    }
    if (match(r'/api/users/\d+/avatar') != null) {
      return http.Response.bytes(base64Decode(_png), 200, headers: {'content-type': 'image/png'});
    }
    final del = match(r'/api/chat/messages/(\d+)');
    if (del != null && m == 'DELETE') {
      final id = int.parse(del.group(1)!);
      for (final list in messages.values) {
        for (final x in list) {
          if (x['id'] == id) {
            x['body'] = '';
            x['deletedAt'] = DateTime.now().toUtc().toIso8601String();
          }
        }
      }
      return http.Response('', 204);
    }
    final conv = match(r'/api/chat/conversations/(\d+)(/.*)?');
    if (conv != null) {
      final id = int.parse(conv.group(1)!);
      final rest = conv.group(2) ?? '';
      if (!convs.any((c) => c['id'] == id)) return _json({'message': 'Không tìm thấy'}, 404);
      final c = convs.firstWhere((c) => c['id'] == id);
      if (rest == '' && m == 'GET') return _json(_detail(id));
      if (rest == '' && m == 'PATCH') {
        c.addAll(req.json);
        return _json(_item(c));
      }
      if (rest == '/messages' && m == 'GET') {
        final q = req.url.queryParameters;
        final limit = int.parse(q['limit'] ?? '30');
        final before = int.tryParse(q['before'] ?? '');
        final all = (messages[id] ?? []).reversed.where((x) => before == null || (x['id'] as int) < before).toList();
        return _json({'items': all.take(limit).toList(), 'hasMore': all.length > limit});
      }
      if (rest == '/messages' && m == 'POST') {
        final body = req.json['body'] as String;
        if (body == 'spam') return _json({'message': 'ThrottlerException: Too Many Requests'}, 429);
        final msg = _m(_nextId++, id, _me, body, DateTime.now().toUtc().toIso8601String());
        messages[id]!.add(msg);
        return _json(msg, 201);
      }
      if (rest == '/read' || rest == '/mute' || rest == '/members') {
        if (rest == '/mute') c['muted'] = req.json['muted'];
        if (rest == '/read') c['unread'] = 0;
        return http.Response('', 204);
      }
      if (rest.startsWith('/members/') && m == 'DELETE') return http.Response('', 204);
    }
    return _json({'message': 'Không tìm thấy'}, 404);
  }
}

/// Trình chọn ảnh giả: trả ảnh định sẵn thay vì mở máy ảnh / thư viện.
class FakeFiles extends AttachmentService {
  FakeFiles(super.api);
  PickedFile? next;
  final picks = <bool>[];

  @override
  Future<PickedFile?> pickAvatar({required bool camera}) async {
    picks.add(camera);
    return next;
  }
}

class Harness {
  Harness(this.services, this.server, this.messaging, this.files);
  final AppServices services;
  final ChatServer server;
  final FakeMessaging messaging;
  final FakeFiles files;
  ChatService get chat => services.chat;
}

Future<Harness> _start(WidgetTester tester, ChatServer server) async {
  final api = ApiClient(baseUrl: 'http://api.test', store: MemorySessionStore('abc'), client: server.client);
  final messaging = FakeMessaging();
  final push = PushService(api: api, messaging: messaging, config: fullPushConfig, isAndroid: true);
  final auth = AuthController(api, beforeLogout: push.unregister);
  final lock = AppLock(deviceAuth: FakeDeviceAuth(), prefs: MemoryPrefsStore(), isSignedIn: () => api.hasSession);
  final files = FakeFiles(api);
  final services = AppServices(api: api, auth: auth, files: files, lock: lock, push: push);
  await api.restore();
  await lock.init();
  await tester.pumpWidget(GiaoViecApp(services: services));
  await push.start();
  await auth.bootstrap();
  await tester.pumpAndSettle();
  return Harness(services, server, messaging, files);
}

Future<void> _stop(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump();
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

/// Nút Quay lại của hệ thống.
Future<void> _back(WidgetTester tester) async {
  await tester.binding.handlePopRoute();
  await tester.pumpAndSettle();
}

Future<void> _openChatTab(WidgetTester tester) => _tap(tester, find.text('Trò chuyện').last);

Future<void> _openConversation(WidgetTester tester, String name) async {
  await _openChatTab(tester);
  await _tap(tester, find.text(name));
}

void main() {
  testWidgets('danh sách: tab Trò chuyện có số chưa đọc, xem trước, tắt thông báo, dòng nhắc', (tester) async {
    final h = await _start(tester, ChatServer());
    expect(find.byKey(const Key('nav-chat')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('nav-chat')), matching: find.text('2')), findsOneWidget);
    // Luồng thời gian thực đã mở sau khi mở khóa ứng dụng.
    expect(h.server.streams, hasLength(1));
    expect(h.chat.connection, ChatConnection.live);

    await _openChatTab(tester);
    expect(find.byKey(const Key('chat-notice')), findsOneWidget);
    expect(find.text('Không trao đổi thông tin bí mật nhà nước'), findsOneWidget);
    expect(find.text('Trần Thị Bình'), findsOneWidget);
    expect(find.text('Tôi: Chào Bình'), findsOneWidget);
    expect(find.text('Cường: Họp lúc 14h'), findsOneWidget);
    expect(find.text('Tin nhắn đã được thu hồi'), findsOneWidget);
    final system = tester.widget<Text>(find.text('Nhóm được tạo'));
    expect(system.style?.fontStyle, FontStyle.italic);
    expect(find.byKey(const Key('unread-5')), findsOneWidget);
    expect(find.byKey(const Key('unread-6')), findsNothing);
    expect(
      find.descendant(of: find.byKey(const Key('conversation-6')), matching: find.byKey(const Key('muted'))),
      findsOneWidget,
    );
    expect(find.byKey(const Key('avatar-direct')), findsOneWidget);
    expect(find.byKey(const Key('avatar-unit')), findsOneWidget);
    expect(find.byKey(const Key('avatar-group')), findsNWidgets(3));
    // Ảnh người kia được tải kèm cookie phiên.
    final avatar = h.server.where('GET', '/api/users/2/avatar').single;
    expect(avatar.url.queryParameters['v'], 'abc');
    expect(avatar.headers['Cookie'], 'tm_session=abc');

    // Tin mới qua luồng: danh sách tự tải lại.
    final before = h.server.where('GET', '/api/chat/conversations').length;
    h.server.messages[6]!.add(ChatServer._m(500, 6, _dung, 'Đã nhận', _ago(Duration.zero)));
    h.server.emit('message', h.server.messages[6]!.last);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(h.server.where('GET', '/api/chat/conversations').length, before + 1);
    expect(find.text('Dũng: Đã nhận'), findsOneWidget);
    await _stop(tester);
    expect(h.server.streamCancels, 1);
  });

  testWidgets('cuộc trò chuyện: báo đã đọc, gửi tin, 429 giữ nội dung, "Đã xem", tin mới / thu hồi qua luồng', (
    tester,
  ) async {
    final h = await _start(tester, ChatServer());
    await _openConversation(tester, 'Trần Thị Bình');
    expect(find.text('Chào đồng chí'), findsOneWidget);
    expect(find.text('Chào Bình'), findsOneWidget);
    expect(find.text('Hôm nay'), findsOneWidget);
    expect(find.byKey(const Key('chat-notice')), findsOneWidget);
    expect(find.text('Giảng viên · Khoa CNTT'), findsOneWidget);
    // Tin mới nhất đang hiện: báo đã đọc tới 102.
    expect(h.server.where('POST', '/api/chat/conversations/5/read').single.json, {'messageId': 102});
    expect(find.byKey(const Key('seen')), findsNothing); // người kia mới đọc tới 101

    // Người kia đọc tới 102 → "Đã xem".
    h.server.emit('read', {'conversationId': 5, 'userId': 2, 'messageId': 102});
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('seen')), findsOneWidget);

    // Gửi tin.
    expect(tester.widget<IconButton>(find.byKey(const Key('chat-send'))).onPressed, isNull);
    await tester.enterText(find.byKey(const Key('chat-input')), '  Báo cáo xong  ');
    await tester.pump();
    await _tap(tester, find.byKey(const Key('chat-send')));
    expect(h.server.where('POST', '/api/chat/conversations/5/messages').single.json, {'body': 'Báo cáo xong'});
    expect(find.text('Báo cáo xong'), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const Key('chat-input'))).controller!.text, isEmpty);
    // Tin mới của mình chưa được xem.
    expect(find.byKey(const Key('seen')), findsNothing);

    // Quá giới hạn gửi: báo lỗi, giữ nội dung.
    await tester.enterText(find.byKey(const Key('chat-input')), 'spam');
    await tester.pump();
    await _tap(tester, find.byKey(const Key('chat-send')));
    expect(find.text('Thao tác quá nhiều lần, đồng chí thử lại sau ít phút'), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const Key('chat-input'))).controller!.text, 'spam');

    // Tin mới của người kia qua luồng: hiện ngay, báo đã đọc.
    h.server.emit('message', ChatServer._m(2000, 5, _binh, 'Tin thời gian thực', _ago(Duration.zero)));
    await tester.pumpAndSettle();
    expect(find.text('Tin thời gian thực'), findsOneWidget);
    expect(h.server.where('POST', '/api/chat/conversations/5/read').last.json, {'messageId': 2000});
    // Tin của cuộc khác không hiện ở đây.
    h.server.emit('message', ChatServer._m(2001, 6, _cuong, 'Tin nhóm khác', _ago(Duration.zero)));
    await tester.pumpAndSettle();
    expect(find.text('Tin nhóm khác'), findsNothing);

    h.server.emit('message_deleted', {'conversationId': 5, 'id': 2000});
    await tester.pumpAndSettle();
    expect(find.text('Tin thời gian thực'), findsNothing);
    expect(find.text('Tin nhắn đã được thu hồi'), findsOneWidget);
    await _stop(tester);
  });

  testWidgets('thu hồi: chỉ tin của mình trong 24 giờ', (tester) async {
    final h = await _start(tester, ChatServer());
    await _openConversation(tester, 'Trần Thị Bình');

    await tester.longPress(find.text('Chào đồng chí')); // tin của người kia
    await tester.pumpAndSettle();
    expect(find.text('Thu hồi'), findsNothing);

    await tester.longPress(find.text('Tin cũ')); // của mình nhưng quá 24 giờ
    await tester.pumpAndSettle();
    expect(find.text('Thu hồi'), findsNothing);

    await tester.longPress(find.text('Chào Bình'));
    await tester.pumpAndSettle();
    expect(find.text('Thu hồi'), findsOneWidget);
    await _tap(tester, find.text('Thu hồi'));
    expect(h.server.where('DELETE', '/api/chat/messages/102'), hasLength(1));
    expect(find.text('Chào Bình'), findsNothing);
    expect(find.text('Tin nhắn đã được thu hồi'), findsOneWidget);
    await _stop(tester);
  });

  testWidgets('cuộn lên tải tin cũ (before = mã tin cũ nhất), nhóm hiện tên người gửi', (tester) async {
    final h = await _start(tester, ChatServer());
    await _openConversation(tester, 'Nhóm đông');
    final gets = h.server.where('GET', '/api/chat/conversations/9/messages').toList();
    expect(gets.single.url.queryParameters, {'limit': '30'});
    expect(find.text('Tin số 245'), findsOneWidget);
    expect(find.text('Lê Văn Cường'), findsWidgets);

    final list = find.byKey(const Key('chat-messages'));
    await tester.drag(list, const Offset(0, 4000));
    await tester.pumpAndSettle();
    final older = h.server.where('GET', '/api/chat/conversations/9/messages').toList();
    expect(older, hasLength(2));
    expect(older.last.url.queryParameters, {'before': '216', 'limit': '30'});
    await tester.scrollUntilVisible(
      find.text('Tin số 201'),
      300,
      scrollable: find.descendant(of: list, matching: find.byType(Scrollable)).first,
    );
    expect(find.text('Tin số 201'), findsOneWidget);
    await _stop(tester);
  });

  testWidgets('thông tin nhóm: chỉ thành viên → không đổi tên / bớt người; thêm, tắt thông báo, rời nhóm', (
    tester,
  ) async {
    final server = ChatServer()..perms[6] = {'canManage': false, 'canAddMembers': true, 'canLeave': true};
    final h = await _start(tester, server);
    await _openConversation(tester, 'Tổ soạn đề');
    expect(find.text('Lê Văn Cường'), findsOneWidget); // tên người gửi trong nhóm
    expect(find.text('Nguyễn Văn A đã tạo nhóm'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('chat-title')));
    expect(find.text('Thông tin nhóm'), findsOneWidget);
    expect(find.byKey(const Key('info-rename')), findsNothing);
    expect(find.byKey(const Key('remove-3')), findsNothing);
    expect(find.byKey(const Key('info-add')), findsOneWidget);
    expect(find.byKey(const Key('info-leave')), findsOneWidget);
    expect(find.text('Trưởng nhóm'), findsOneWidget);

    // Bật lại thông báo.
    await _tap(tester, find.byKey(const Key('info-mute')));
    expect(h.server.where('POST', '/api/chat/conversations/6/mute').single.json, {'muted': false});

    // Thêm thành viên: danh bạ bỏ người đã có.
    await _tap(tester, find.byKey(const Key('info-add')));
    expect(find.text('Đại úy Trần Thị Bình'), findsOneWidget);
    expect(find.text('Phạm Văn Dũng'), findsNothing);
    await _tap(tester, find.text('Đại úy Trần Thị Bình'));
    await _tap(tester, find.text('Xong (1)'));
    expect(h.server.where('POST', '/api/chat/conversations/6/members').single.json, {
      'userIds': [2],
    });

    // Chờ thanh báo "Đã thêm" tự ẩn (nó che dòng cuối).
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    await _tap(tester, find.byKey(const Key('info-leave')));
    await _tap(tester, find.widgetWithText(FilledButton, 'Rời nhóm'));
    expect(h.server.where('DELETE', '/api/chat/conversations/6/members/1'), hasLength(1));
    // Về danh sách trò chuyện.
    expect(find.byKey(const Key('chat-list')), findsOneWidget);
    expect(find.byKey(const Key('chat-input')), findsNothing);
    await _stop(tester);
  });

  testWidgets('thông tin nhóm: người quản lý đổi tên, bớt người; nhóm đơn vị có công tắc trực thuộc', (tester) async {
    final server = ChatServer()
      ..perms[6] = {'canManage': true, 'canAddMembers': true, 'canLeave': false}
      ..perms[7] = {'canManage': true};
    final h = await _start(tester, server);
    await _openConversation(tester, 'Tổ soạn đề');
    await _tap(tester, find.byKey(const Key('chat-title')));
    expect(find.byKey(const Key('info-leave')), findsNothing);
    expect(find.byKey(const Key('remove-1')), findsNothing); // không tự bớt mình
    await _tap(tester, find.byKey(const Key('remove-3')));
    await _tap(tester, find.widgetWithText(FilledButton, 'Bớt khỏi nhóm'));
    expect(h.server.where('DELETE', '/api/chat/conversations/6/members/3'), hasLength(1));

    await _tap(tester, find.byKey(const Key('info-rename')));
    await tester.enterText(find.byKey(const Key('rename-field')), 'Tổ ra đề');
    await _tap(tester, find.text('Lưu'));
    expect(h.server.where('PATCH', '/api/chat/conversations/6').single.json, {'name': 'Tổ ra đề'});
    expect(find.byKey(const Key('info-name')), findsOneWidget);
    expect(find.text('Tổ ra đề'), findsOneWidget);

    // Nhóm đơn vị.
    await _back(tester);
    await _back(tester);
    await _tap(tester, find.text('Khoa CNTT').first);
    await _tap(tester, find.byKey(const Key('chat-title')));
    expect(find.byKey(const Key('remove-3')), findsNothing); // thành viên nhóm đơn vị tự cập nhật
    await _tap(tester, find.byKey(const Key('info-subunits')));
    expect(h.server.where('PATCH', '/api/chat/conversations/7').single.json, {'includeSubunits': true});
    await _stop(tester);
  });

  testWidgets('nhắn riêng: tìm trong danh bạ → mở cuộc trò chuyện; tạo nhóm', (tester) async {
    final h = await _start(tester, ChatServer());
    await _openChatTab(tester);
    await _tap(tester, find.byKey(const Key('chat-new')));
    expect(find.text('Nhóm theo đơn vị'), findsNothing); // cán bộ không tạo nhóm đơn vị
    await _tap(tester, find.text('Nhắn riêng'));
    await tester.enterText(find.byKey(const Key('directory-search')), 'Bình');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(h.server.where('GET', '/api/chat/directory').last.url.queryParameters['q'], 'Bình');
    expect(find.text('Lê Văn Cường'), findsNothing);
    await _tap(tester, find.text('Đại úy Trần Thị Bình'));
    expect(h.server.where('POST', '/api/chat/direct').single.json, {'userId': 2});
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
    expect(find.text('Chào Bình'), findsOneWidget);
    await _back(tester);

    await _tap(tester, find.byKey(const Key('chat-new')));
    await _tap(tester, find.text('Tạo nhóm'));
    await _tap(tester, find.byKey(const Key('group-create')));
    expect(find.text('Đồng chí nhập tên nhóm'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('group-name')), 'Tổ kiểm tra');
    await _tap(tester, find.byKey(const Key('group-pick')));
    await _tap(tester, find.text('Phạm Văn Dũng'));
    await _tap(tester, find.text('Xong (1)'));
    await _tap(tester, find.byKey(const Key('group-create')));
    expect(h.server.where('POST', '/api/chat/groups').single.json, {
      'name': 'Tổ kiểm tra',
      'memberIds': [4],
    });
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
    expect(find.text('Tổ kiểm tra'), findsOneWidget);
    await _stop(tester);
  });

  testWidgets('nhóm theo đơn vị: chỉ huy đơn vị thấy đơn vị mình, 409 báo "Đơn vị này đã có nhóm"', (tester) async {
    final server = ChatServer(role: 'UNIT_HEAD')..unitGroupConflict = true;
    final h = await _start(tester, server);
    await _openChatTab(tester);
    await _tap(tester, find.byKey(const Key('chat-new')));
    await _tap(tester, find.text('Nhóm theo đơn vị'));
    expect(find.text('Phòng Đào tạo'), findsNothing);
    await _tap(tester, find.text('Bộ môn Mạng'));
    await _tap(tester, find.byKey(const Key('include-subunits')));
    await _tap(tester, find.byKey(const Key('unit-group-create')));
    expect(h.server.where('POST', '/api/chat/unit-groups').single.json, {'unitId': 3, 'includeSubunits': true});
    expect(find.text('Đơn vị này đã có nhóm'), findsOneWidget);
    expect(find.byKey(const Key('unit-group-create')), findsOneWidget); // vẫn ở màn hình tạo

    h.server.unitGroupConflict = false;
    await _tap(tester, find.byKey(const Key('unit-group-create')));
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
    await _stop(tester);
  });

  testWidgets('quản trị: không có tab Trò chuyện, không gọi API trò chuyện', (tester) async {
    final h = await _start(tester, ChatServer(role: 'ADMIN'));
    expect(h.services.auth.status, AuthStatus.adminOnly);
    expect(find.text('Trò chuyện'), findsNothing);
    expect(h.server.requests.where((r) => r.path.startsWith('/api/chat')), isEmpty);
    expect(h.chat.available, isFalse);
    await _stop(tester);
  });

  testWidgets('bấm thông báo đẩy /chat/5 mở đúng cuộc trò chuyện', (tester) async {
    final h = await _start(tester, ChatServer());
    h.messaging.opened.add(PushMessage.fromData(body: 'Đồng chí có tin nhắn mới', data: {'link': '/chat/5'}));
    await tester.pumpAndSettle();
    expect(h.server.where('GET', '/api/chat/conversations/5'), hasLength(1));
    expect(find.text('Chào Bình'), findsOneWidget);
    expect(find.byKey(const Key('chat-input')), findsOneWidget);

    // Đang mở đúng cuộc đó: thông báo khi đang dùng không hiện thanh báo.
    h.messaging.foreground.add(PushMessage.fromData(body: 'Đồng chí có tin nhắn mới', data: {'link': '/chat/5'}));
    await tester.pumpAndSettle();
    expect(find.text('Đồng chí có tin nhắn mới'), findsNothing);
    // Cuộc khác: hiện câu chung + nút Xem.
    h.messaging.foreground.add(PushMessage.fromData(body: 'Đồng chí có tin nhắn mới', data: {'link': '/chat/6'}));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Đồng chí có tin nhắn mới'), findsOneWidget);
    await _tap(tester, find.text('Xem'));
    expect(find.text('Họp lúc 14h'), findsOneWidget);
    await _stop(tester);
  });

  testWidgets('luồng: nối lại sau khi mất; lỗi liên tiếp thì hỏi lại định kỳ; có lại thì thôi', (tester) async {
    final h = await _start(tester, ChatServer());
    expect(h.server.streams, hasLength(1));

    // Kết nối khỏe (đã nhận ping) rồi mất: nối lại sau 1 giây.
    h.server.ping();
    await tester.pump();
    await h.server.streams.last.close();
    await tester.pump();
    expect(h.chat.connection, ChatConnection.connecting);
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(h.server.streams, hasLength(2));
    expect(h.chat.connection, ChatConnection.live);

    // Máy chủ lỗi: thử lại 1 s, 3 s rồi chuyển sang hỏi lại định kỳ.
    h.server.streamStatus = 500;
    await h.server.streams.last.close();
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();
    expect(h.chat.failures, 3);
    expect(h.chat.connection, ChatConnection.fallback);
    expect(h.chat.polling, isTrue);

    await _openChatTab(tester);
    expect(find.byKey(const Key('chat-polling')), findsOneWidget);
    final lists = h.server.where('GET', '/api/chat/conversations').length;
    await tester.pump(const Duration(seconds: 30));
    await tester.pump();
    expect(h.server.where('GET', '/api/chat/conversations').length, greaterThan(lists));

    // Mở cuộc trò chuyện: hỏi lại mỗi 10 giây.
    await _tap(tester, find.text('Trần Thị Bình'));
    final msgs = h.server.where('GET', '/api/chat/conversations/5/messages').length;
    await tester.pump(const Duration(seconds: 10));
    await tester.pump();
    expect(h.server.where('GET', '/api/chat/conversations/5/messages').length, msgs + 1);

    // Máy chủ hồi phục: lần thử kế tiếp mở được luồng, thôi hỏi định kỳ.
    h.server.streamStatus = 200;
    await tester.pump(const Duration(seconds: 8));
    await tester.pump();
    expect(h.chat.connection, ChatConnection.live);
    expect(h.chat.polling, isFalse);
    final after = h.server.where('GET', '/api/chat/conversations/5/messages').length;
    await tester.pump(const Duration(seconds: 25));
    await tester.pump();
    // Chỉ còn tải lại một lần do vừa nối lại (resync), không hỏi định kỳ.
    expect(h.server.where('GET', '/api/chat/conversations/5/messages').length, lessThanOrEqualTo(after + 1));
    await _stop(tester);
  });

  testWidgets('xuống nền thì đóng luồng, quay lại thì mở lại; đăng xuất thì đóng', (tester) async {
    final h = await _start(tester, ChatServer());
    expect(h.server.streams, hasLength(1));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    expect(h.server.streamCancels, 1);
    expect(h.chat.connection, ChatConnection.idle);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(h.server.streams, hasLength(2));
    expect(h.chat.connection, ChatConnection.live);

    await h.services.auth.logout();
    await tester.pumpAndSettle();
    expect(h.server.streamCancels, 2);
    expect(h.chat.connection, ChatConnection.idle);
    expect(h.chat.unread, 0);
    await _stop(tester);
  });

  group('ảnh đại diện', () {
    Future<void> openSheet(WidgetTester tester) async {
      if (find.byKey(const Key('change-avatar')).evaluate().isEmpty) {
        await _tap(tester, find.byIcon(Icons.account_circle_outlined));
      }
      await _tap(tester, find.byKey(const Key('change-avatar')));
    }

    testWidgets('tải lên multipart `file`, báo câu lỗi của máy chủ, xong thì tải lại /auth/me', (tester) async {
      final server = ChatServer()..avatarError = 'Ảnh không hợp lệ (chỉ nhận JPEG, PNG, tối đa 2 MB)';
      final h = await _start(tester, server);
      await openSheet(tester);
      expect(find.text('Chụp ảnh'), findsOneWidget);
      expect(find.text('Xóa ảnh'), findsNothing); // chưa có ảnh

      // Ảnh không phải JPEG / PNG: báo ngay, không gửi.
      h.files.next = PickedFile('a.gif', Uint8List.fromList(utf8.encode('GIF89a....')));
      await _tap(tester, find.text('Chọn từ thư viện'));
      expect(h.files.picks, [false]);
      expect(find.text('Ảnh đại diện phải là JPEG hoặc PNG'), findsOneWidget);
      expect(h.server.where('POST', '/api/users/me/avatar'), isEmpty);

      h.files.next = PickedFile('IMG_0001.jpg', _jpeg);
      await _tap(tester, find.byKey(const Key('change-avatar')));
      await _tap(tester, find.text('Chụp ảnh'));
      expect(h.files.picks, [false, true]);
      final upload = h.server.where('POST', '/api/users/me/avatar').single;
      expect(upload.headers['content-type'], startsWith('multipart/form-data'));
      final body = latin1.decode(upload.bytes).toLowerCase();
      expect(body, contains('name="file"; filename="avatar.jpg"'));
      expect(body, contains('content-type: image/jpeg'));
      expect(find.text('Ảnh không hợp lệ (chỉ nhận JPEG, PNG, tối đa 2 MB)'), findsOneWidget);

      h.server.avatarError = null;
      final mes = h.server.where('GET', '/api/auth/me').length;
      await _tap(tester, find.byKey(const Key('change-avatar')));
      await _tap(tester, find.text('Chọn từ thư viện'));
      expect(h.server.where('GET', '/api/auth/me').length, mes + 1);
      expect(h.services.auth.me!.avatarUrl, '/api/users/1/avatar?v=new1');
      expect(find.text('Đã đổi ảnh đại diện'), findsOneWidget);
      expect(h.server.where('GET', '/api/users/1/avatar').single.headers['Cookie'], 'tm_session=abc');

      // Xóa ảnh.
      await openSheet(tester);
      await _tap(tester, find.text('Xóa ảnh'));
      await _tap(tester, find.widgetWithText(FilledButton, 'Xóa ảnh'));
      expect(h.server.where('DELETE', '/api/users/me/avatar'), hasLength(1));
      expect(h.services.auth.me!.avatarUrl, isNull);
      await _stop(tester);
    });

    testWidgets('ảnh lớn hơn 2 MB bị từ chối ở máy', (tester) async {
      final h = await _start(tester, ChatServer());
      final big = Uint8List(2 * 1024 * 1024 + 1)..setAll(0, [0xFF, 0xD8, 0xFF]);
      h.files.next = PickedFile('big.jpg', big);
      await openSheet(tester);
      await _tap(tester, find.text('Chọn từ thư viện'));
      expect(find.text('Ảnh quá lớn (tối đa 2 MB)'), findsOneWidget);
      expect(h.server.where('POST', '/api/users/me/avatar'), isEmpty);
      await _stop(tester);
    });
  });
}
