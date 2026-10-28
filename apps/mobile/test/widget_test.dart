import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/api/api_client.dart';
import 'package:giaoviec/api/session_store.dart';
import 'package:giaoviec/app.dart';
import 'package:giaoviec/auth/auth_controller.dart';
import 'package:giaoviec/services/app_services.dart';
import 'package:giaoviec/services/attachments.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

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
    }
    return json({'message': 'Không tìm thấy'}, 404);
  }
}

Future<(AppServices, FakeServer)> startApp(WidgetTester tester, {String role = 'STAFF', bool otp = false, String? token}) async {
  final server = FakeServer(role: role, otp: otp);
  final api = ApiClient(baseUrl: 'http://api.test', store: MemorySessionStore(token), client: MockClient(server.handle));
  final auth = AuthController(api);
  final services = AppServices(api: api, auth: auth, files: AttachmentService(api));
  await tester.pumpWidget(GiaoViecApp(services: services));
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
    await tester.tap(find.text('Đăng nhập'));
    await tester.pumpAndSettle();

    // Máy chủ đòi mã: hiện ô nhập mã 6 số.
    expect(find.byKey(const Key('otp')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('otp')), '123456');
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
}
