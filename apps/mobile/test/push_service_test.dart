import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/api/api_client.dart';
import 'package:giaoviec/api/session_store.dart';
import 'package:giaoviec/config.dart';
import 'package:giaoviec/push/messaging.dart';
import 'package:giaoviec/push/push_config.dart';
import 'package:giaoviec/push/push_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes.dart';

void main() {
  late List<http.Request> requests;
  late int devicesStatus;

  ApiClient api() => ApiClient(
        baseUrl: 'http://api.test',
        store: MemorySessionStore('abc'),
        client: MockClient((req) async {
          requests.add(req);
          return http.Response('', devicesStatus);
        }),
      )..restore();

  setUp(() {
    requests = [];
    devicesStatus = 204;
  });

  Future<PushService> make(FakeMessaging m, {PushConfig config = fullPushConfig, bool android = true}) async {
    final client = api();
    await client.restore();
    return PushService(api: client, messaging: m, config: config, isAndroid: android);
  }

  group('cấu hình từ dart-define', () {
    test('thiếu giá trị: tắt thông báo đẩy, không gọi Firebase', () async {
      final m = FakeMessaging();
      final push = await make(m, config: emptyPushConfig);
      await push.start();
      await push.register();
      expect(push.state, PushState.notConfigured);
      expect(m.inits, 0);
      expect(requests, isEmpty);
    });

    test('mã ứng dụng theo nền tảng', () {
      const c = PushConfig(apiKey: 'k', senderId: 's', projectId: 'p', appIdAndroid: 'a', appIdIos: '');
      expect(c.isConfiguredFor(android: true), isTrue);
      expect(c.isConfiguredFor(android: false), isFalse);
      expect(PushConfig.fromEnvironment().isConfiguredFor(android: true), isFalse); // Kiểm thử không truyền define.
    });

    test('Firebase lỗi khi khởi tạo: không đăng ký, ứng dụng chạy tiếp', () async {
      final m = FakeMessaging()..failInit = true;
      final push = await make(m);
      await push.start();
      await push.register();
      expect(push.state, PushState.unavailable);
      expect(requests, isEmpty);
    });
  });

  test('đăng ký thiết bị: POST /devices đúng hợp đồng', () async {
    final m = FakeMessaging();
    final push = await make(m, android: false);
    await push.start();
    await push.register();
    expect(m.permissionRequests, 1);
    expect(push.state, PushState.registered);
    final req = requests.single;
    expect(req.method, 'POST');
    expect(req.url.path, '/api/devices');
    expect(jsonDecode(req.body), {
      'platform': 'IOS',
      'provider': 'FCM',
      'token': 'fcm-token-abcdefghijklmnopqrstuvwxyz',
      'appVersion': appVersion,
    });
  });

  test('không cho phép thông báo: không đăng ký', () async {
    final m = FakeMessaging(permission: PushPermission.denied);
    final push = await make(m);
    await push.start();
    await push.register();
    expect(push.state, PushState.permissionDenied);
    expect(requests, isEmpty);
  });

  test('máy chủ chưa có điểm cuối (404): không lỗi, báo chưa hỗ trợ', () async {
    devicesStatus = 404;
    final push = await make(FakeMessaging());
    await push.start();
    await push.register();
    expect(push.state, PushState.serverUnsupported);
  });

  test('mã đổi khi đang đăng nhập: đăng ký lại; sau khi hủy đăng ký thì không', () async {
    final m = FakeMessaging();
    final push = await make(m);
    await push.start();
    await push.register();
    m.refresh.add('fcm-token-moi-0123456789abcdefghij');
    await Future<void>.delayed(Duration.zero);
    expect(requests, hasLength(2));
    expect((jsonDecode(requests.last.body) as Map)['token'], 'fcm-token-moi-0123456789abcdefghij');

    await push.unregister();
    expect(requests.last.url.path, '/api/devices/unregister');
    expect(jsonDecode(requests.last.body), {'token': 'fcm-token-moi-0123456789abcdefghij'});
    expect(push.state, PushState.idle);

    m.refresh.add('fcm-token-khac-0123456789abcdefghij');
    await Future<void>.delayed(Duration.zero);
    expect(requests, hasLength(3));
  });

  test('hủy đăng ký khi chưa có mã: không gọi máy chủ', () async {
    final push = await make(FakeMessaging(token: null));
    await push.start();
    await push.register();
    expect(push.state, PushState.unavailable);
    await push.unregister();
    expect(requests, isEmpty);
  });

  test('thông báo bấm từ trạng thái tắt hẳn: giữ chờ mở', () async {
    final m = FakeMessaging()..initial = const PushMessage(link: '/tasks/123');
    final push = await make(m);
    await push.start();
    expect(push.pendingOpen.value?.taskId, 123);
  });

  test('đọc dữ liệu thông báo', () {
    final p = PushMessage.fromData(title: 'Giao nhiệm vụ', data: {'link': '/tasks/7', 'notificationId': '45'});
    expect(p.taskId, 7);
    expect(p.notificationId, 45);
    expect(PushMessage.fromData(data: {'link': '/khac'}).taskId, isNull);
  });
}
