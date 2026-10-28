import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/api/api_client.dart';
import 'package:giaoviec/api/session_store.dart';
import 'package:giaoviec/app.dart';
import 'package:giaoviec/auth/auth_controller.dart';
import 'package:giaoviec/services/app_services.dart';
import 'package:giaoviec/push/messaging.dart';
import 'package:giaoviec/push/push_service.dart';
import 'package:giaoviec/security/app_lock.dart';
import 'package:giaoviec/services/attachments.dart';
import 'package:giaoviec/services/prefs.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes.dart';

http.Response json(Object body, [int status = 200, Map<String, String> headers = const {}]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8', ...headers});

final _due = DateTime.now().subtract(const Duration(days: 2)).toUtc().toIso8601String();
final _soon = DateTime.now().add(const Duration(days: 10)).toUtc().toIso8601String();

Map<String, dynamic> _row(int id, String title, String reason, {String status = 'IN_PROGRESS', String? due}) => {
      'id': id,
      'title': title,
      'dueDate': due ?? _due,
      'priority': 'HIGH',
      'status': status,
      'progress': 30,
      'overdue': reason == 'overdue',
      'createdBy': {'id': 9, 'fullName': 'Trưởng khoa'},
      'assignees': [],
      'reason': reason,
    };

/// Máy chủ giả: trả lời theo đường dẫn, ghi lại các yêu cầu.
class FakeServer {
  FakeServer({this.role = 'STAFF', this.otp = false});
  final String role;
  final bool otp;
  final requests = <http.Request>[];
  bool acknowledged = false;

  Future<http.Response> handle(http.Request req) async {
    requests.add(req);
    final path = req.url.path;
    if (path == '/api/auth/login') {
      final body = jsonDecode(req.body) as Map;
      if (otp && body['otp'] == null) return json({'code': 'OTP_REQUIRED', 'message': 'Nhập mã xác thực hai lớp'}, 401);
      return json({'id': 1}, 200, {'set-cookie': 'tm_session=abc; Path=/; HttpOnly'});
    }
    if (req.headers['Cookie'] != 'tm_session=abc') return json({'message': 'Chưa đăng nhập'}, 401);
    switch (path) {
      case '/api/auth/me':
        return json({'id': 1, 'username': 'canbo', 'fullName': 'Nguyễn Văn A', 'role': role, 'unit': {'id': 1, 'name': 'Khoa CNTT'}});
      case '/api/tasks/counts':
        return json({'todo': 2, 'review': 0, 'assigned': 5, 'created': 0, 'following': 0});
      case '/api/tasks/todo':
        return json({
          'items': [
            _row(1, 'Báo cáo tổng kết học kỳ', 'overdue'),
            _row(2, 'Chuẩn bị giáo án mới', 'new', status: 'NEW', due: _soon),
          ],
        });
      case '/api/notifications/unread-count':
        return json({'count': 3});
      case '/api/tasks/2':
        return json({
          ..._row(2, 'Chuẩn bị giáo án mới', 'new', status: acknowledged ? 'IN_PROGRESS' : 'NEW', due: _soon)..remove('reason'),
          'description': 'Soạn giáo án học phần mới',
          'source': 'Kết luận giao ban tuần 20',
          'createdAt': _due,
          'parent': null,
          'children': [],
          'updates': [],
          'submissions': [],
          'attachments': [],
          'comments': [],
          'permissions': {'manage': false, 'work': true, 'acknowledge': !acknowledged},
          'following': false,
        });
      case '/api/tasks/2/acknowledge':
        acknowledged = true;
        return http.Response('', 204);
      case '/api/users':
        return json([
          {'id': 5, 'fullName': 'Nguyễn Văn Cán', 'role': 'STAFF', 'isActive': true, 'unit': {'id': 1, 'name': 'Khoa CNTT'}},
          {'id': 6, 'fullName': 'Trần Thị Bộ', 'role': 'STAFF', 'isActive': true, 'unit': {'id': 1, 'name': 'Khoa CNTT'}},
          {'id': 7, 'fullName': 'Quản Trị', 'role': 'ADMIN', 'isActive': true, 'unit': {'id': 1, 'name': 'Khoa CNTT'}},
        ]);
      case '/api/units':
        return json([
          {'id': 1, 'name': 'Khoa CNTT', 'parentId': null, 'isActive': true},
          {'id': 2, 'name': 'Phòng Đào tạo', 'parentId': null, 'isActive': true},
        ]);
      case '/api/tasks':
        if (req.method == 'POST') return json({'id': 42}, 201);
      case '/api/devices':
      case '/api/devices/unregister':
      case '/api/auth/logout':
        return http.Response('', 204);
      case '/api/notifications/settings':
        return json({
          'push': {'enabled': false, 'devices': 0},
          'mobile': {'enabled': true, 'devices': 1},
        });
    }
    return json({'message': 'Không tìm thấy'}, 404);
  }
}

Future<(AppServices, FakeServer)> startApp(
  WidgetTester tester, {
  String role = 'STAFF',
  bool otp = false,
  String? token,
  FakeDeviceAuth? deviceAuth,
  FakeMessaging? messaging,
}) async {
  final server = FakeServer(role: role, otp: otp);
  final api = ApiClient(baseUrl: 'http://api.test', store: MemorySessionStore(token), client: MockClient(server.handle));
  final push = PushService(
    api: api,
    messaging: messaging ?? FakeMessaging(),
    config: messaging == null ? emptyPushConfig : fullPushConfig,
    isAndroid: true,
  );
  final auth = AuthController(api, beforeLogout: push.unregister);
  final lock = AppLock(deviceAuth: deviceAuth ?? FakeDeviceAuth(), prefs: MemoryPrefsStore(), isSignedIn: () => api.hasSession);
  final services = AppServices(api: api, auth: auth, files: AttachmentService(api), lock: lock, push: push);
  await api.restore();
  await lock.init();
  await tester.pumpWidget(GiaoViecApp(services: services));
  await push.start();
  await auth.bootstrap();
  await tester.pumpAndSettle();
  return (services, server);
}

/// Gỡ cây widget để hủy bộ đếm thông báo định kỳ.
Future<void> stopApp(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump();
}

void main() {
  testWidgets('đăng nhập có bước mã OTP rồi vào "Cần xử lý" nhóm theo lý do', (tester) async {
    final (services, server) = await startApp(tester, otp: true);

    expect(find.text('Đăng nhập'), findsOneWidget);
    expect(find.textContaining('bí mật nhà nước'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).at(0), 'canbo');
    await tester.enterText(find.byType(TextFormField).at(1), 'mat-khau-thu');
    await tester.ensureVisible(find.text('Đăng nhập'));
    await tester.tap(find.text('Đăng nhập'));
    await tester.pumpAndSettle();

    // Máy chủ đòi mã: hiện ô nhập mã 6 số.
    expect(find.byKey(const Key('otp')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('otp')), '123456');
    await tester.ensureVisible(find.text('Xác nhận'));
    await tester.tap(find.text('Xác nhận'));
    await tester.pumpAndSettle();

    final login = server.requests.where((r) => r.url.path == '/api/auth/login').last;
    expect((jsonDecode(login.body) as Map)['otp'], '123456');
    expect(services.auth.status, AuthStatus.ready);

    expect(find.text('Việc của tôi'), findsWidgets);
    expect(find.text('Quá hạn'), findsOneWidget);
    expect(find.text('Mới được giao, chưa xác nhận'), findsOneWidget);
    expect(find.text('Báo cáo tổng kết học kỳ'), findsOneWidget);
    expect(find.text('Trễ 2 ngày'), findsOneWidget);
    // Cán bộ không có mục "Đã giao", "Chờ duyệt".
    expect(find.text('Được giao'), findsOneWidget);
    expect(find.text('Đã giao'), findsNothing);
    expect(find.text('Chờ duyệt'), findsNothing);
    // Huy hiệu thông báo chưa đọc.
    expect(find.text('3'), findsOneWidget);

    await stopApp(tester);
  });

  testWidgets('chỉ huy đơn vị thấy mục Đã giao, Chờ duyệt', (tester) async {
    await startApp(tester, role: 'UNIT_HEAD', token: 'abc');
    expect(find.text('Đã giao'), findsOneWidget);
    expect(find.text('Chờ duyệt'), findsOneWidget);
    await stopApp(tester);
  });

  testWidgets('mở chi tiết, bấm "Đã nhận nhiệm vụ" một chạm', (tester) async {
    final (_, server) = await startApp(tester, token: 'abc');

    await tester.tap(find.text('Chuẩn bị giáo án mới'));
    await tester.pumpAndSettle();
    expect(find.text('Chi tiết nhiệm vụ'), findsOneWidget);
    expect(find.text('Kết luận giao ban tuần 20'), findsOneWidget);
    expect(find.text('Cập nhật tiến độ'), findsOneWidget);

    await tester.tap(find.text('Đã nhận nhiệm vụ'));
    await tester.pumpAndSettle();
    expect(server.requests.any((r) => r.method == 'POST' && r.url.path == '/api/tasks/2/acknowledge'), isTrue);
    expect(find.text('Đã nhận nhiệm vụ'), findsNothing);
    expect(find.text('Đã xác nhận nhận nhiệm vụ'), findsOneWidget);

    await stopApp(tester);
  });

  testWidgets('tài khoản quản trị bị chặn', (tester) async {
    await startApp(tester, role: 'ADMIN', token: 'abc');
    expect(find.text('Ứng dụng dành cho người giao, nhận nhiệm vụ'), findsOneWidget);
    await stopApp(tester);
  });

  testWidgets('khởi động có phiên: màn hình khóa, xác thực thất bại vẫn khóa, thử lại thì mở', (tester) async {
    final deviceAuth = FakeDeviceAuth(result: DeviceAuthResult.failed);
    final (services, _) = await startApp(tester, token: 'abc', deviceAuth: deviceAuth);

    expect(find.text('Mở khóa'), findsOneWidget);
    expect(find.text('Chưa mở khóa được. Đồng chí thử lại.'), findsOneWidget);
    expect(deviceAuth.prompts, 1); // Tự hiện hộp xác thực một lần.
    expect(services.lock.locked, isTrue);

    deviceAuth.result = DeviceAuthResult.success;
    await tester.tap(find.text('Mở khóa'));
    await tester.pumpAndSettle();
    expect(find.text('Mở khóa'), findsNothing);
    expect(find.text('Báo cáo tổng kết học kỳ'), findsOneWidget);
    await stopApp(tester);
  });

  testWidgets('máy chưa đặt khóa màn hình: không khóa, báo một lần', (tester) async {
    final (services, _) = await startApp(tester, token: 'abc', deviceAuth: FakeDeviceAuth(supported: false));
    expect(find.text('Mở khóa'), findsNothing);
    expect(find.text('Đồng chí nên đặt khóa màn hình'), findsOneWidget);
    await tester.tap(find.text('Đã hiểu'));
    await tester.pumpAndSettle();
    expect(services.lock.noticePending, isFalse);
    await stopApp(tester);
  });

  testWidgets('đăng xuất từ màn hình khóa: hủy đăng ký thiết bị trước khi đăng xuất', (tester) async {
    final messaging = FakeMessaging();
    final (_, server) = await startApp(
      tester,
      token: 'abc',
      deviceAuth: FakeDeviceAuth(result: DeviceAuthResult.failed),
      messaging: messaging,
    );
    expect(server.requests.where((r) => r.url.path == '/api/devices'), hasLength(1));

    await tester.tap(find.text('Đăng xuất'));
    await tester.pump();
    await tester.tap(find.text('Bấm lần nữa để đăng xuất'));
    await tester.pumpAndSettle();

    final paths = server.requests.map((r) => r.url.path).toList();
    final unregister = paths.indexOf('/api/devices/unregister');
    expect(unregister, greaterThanOrEqualTo(0));
    expect(paths.indexOf('/api/auth/logout'), greaterThan(unregister));
    expect(find.text('Mở khóa'), findsNothing);
    expect(find.text('Đăng nhập'), findsOneWidget);
    await stopApp(tester);
  });

  testWidgets('cán bộ không có nút Giao nhanh', (tester) async {
    await startApp(tester, token: 'abc');
    expect(find.text('Giao nhanh'), findsNothing);
    await stopApp(tester);
  });

  testWidgets('chỉ huy đơn vị giao nhanh: kiểm tra dữ liệu và gửi POST /tasks', (tester) async {
    final (_, server) = await startApp(tester, role: 'UNIT_HEAD', token: 'abc');
    await tester.tap(find.text('Giao nhanh'));
    await tester.pumpAndSettle();

    // Chưa nhập gì: báo lỗi, không gửi.
    await tester.ensureVisible(find.text('Giao nhiệm vụ'));
    await tester.tap(find.text('Giao nhiệm vụ'));
    await tester.pumpAndSettle();
    expect(find.text('Tên nhiệm vụ cần từ 3 đến 255 ký tự'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('qa-title')), 'Rà soát hồ sơ học viên');
    await tester.tap(find.text('Giao nhiệm vụ'));
    await tester.pumpAndSettle();
    expect(find.text('Đồng chí chọn ít nhất một người hoặc đơn vị nhận việc'), findsOneWidget);

    await tester.tap(find.text('Chọn người'));
    await tester.pumpAndSettle();
    expect(find.text('Quản Trị'), findsNothing); // Không giao cho tài khoản quản trị.
    await tester.tap(find.text('Nguyễn Văn Cán'));
    await tester.pump();
    await tester.tap(find.text('Xong (1)'));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Giao nhiệm vụ'));
    await tester.tap(find.text('Giao nhiệm vụ'));
    await tester.pumpAndSettle();

    final post = server.requests.singleWhere((r) => r.method == 'POST' && r.url.path == '/api/tasks');
    final body = jsonDecode(post.body) as Map;
    expect(body['title'], 'Rà soát hồ sơ học viên');
    expect(body['assignees'], [
      {'userId': 5, 'role': 'LEAD'},
    ]);
    expect(body['priority'], 'NORMAL');
    expect(body.containsKey('source'), isFalse);
    final due = DateTime.parse(body['dueDate'] as String).toLocal();
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    expect((due.year, due.month, due.day, due.hour, due.minute), (tomorrow.year, tomorrow.month, tomorrow.day, 23, 59));
    expect(find.text('Đã giao nhiệm vụ'), findsOneWidget);
    await stopApp(tester);
  });

  testWidgets('thông báo đẩy: khi đang mở hiện thanh báo; bấm thông báo mở nhiệm vụ', (tester) async {
    final messaging = FakeMessaging();
    final (services, server) = await startApp(tester, token: 'abc', messaging: messaging);
    expect(services.push.state, PushState.registered);
    final reg = jsonDecode(server.requests.singleWhere((r) => r.url.path == '/api/devices').body) as Map;
    expect(reg['platform'], 'ANDROID');
    expect(reg['provider'], 'FCM');

    messaging.foreground.add(const PushMessage(
        title: 'Giao nhiệm vụ', body: 'Đồng chí được giao nhiệm vụ mới', link: '/tasks/2'));
    await tester.pumpAndSettle();
    expect(find.text('Đồng chí được giao nhiệm vụ mới'), findsOneWidget);

    messaging.opened.add(const PushMessage(link: '/tasks/2'));
    await tester.pumpAndSettle();
    expect(find.text('Chi tiết nhiệm vụ'), findsOneWidget);
    expect(find.text('Kết luận giao ban tuần 20'), findsOneWidget);
    await stopApp(tester);
  });

  testWidgets('bấm thông báo khi đang khóa: mở nhiệm vụ sau khi mở khóa', (tester) async {
    final messaging = FakeMessaging()..initial = const PushMessage(link: '/tasks/2');
    final deviceAuth = FakeDeviceAuth(result: DeviceAuthResult.failed);
    await startApp(tester, token: 'abc', messaging: messaging, deviceAuth: deviceAuth);
    expect(find.text('Mở khóa'), findsOneWidget);
    expect(find.text('Chi tiết nhiệm vụ'), findsNothing);

    deviceAuth.result = DeviceAuthResult.success;
    await tester.tap(find.text('Mở khóa'));
    await tester.pumpAndSettle();
    expect(find.text('Chi tiết nhiệm vụ'), findsOneWidget);
    await stopApp(tester);
  });

  testWidgets('tài khoản: khóa ứng dụng, thông báo chưa cấu hình, thông tin máy chủ', (tester) async {
    await startApp(tester, token: 'abc');
    await tester.tap(find.text('Tài khoản'));
    await tester.pumpAndSettle();
    expect(find.text('Khóa ứng dụng'), findsOneWidget);
    expect(find.textContaining('chưa được cấu hình'), findsOneWidget);
    expect(find.textContaining('Máy chủ đã bật gửi thông báo tới điện thoại · 1 thiết bị'), findsOneWidget);
    await stopApp(tester);
  });
}
