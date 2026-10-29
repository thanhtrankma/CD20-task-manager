// Kiểm thử giao diện: đổi mật khẩu, bật / tắt xác thực hai lớp ngay trên ứng dụng; tìm nhiệm vụ.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/api/api_client.dart';
import 'package:giaoviec/api/session_store.dart';
import 'package:giaoviec/app.dart';
import 'package:giaoviec/auth/auth_controller.dart';
import 'package:giaoviec/push/push_service.dart';
import 'package:giaoviec/screens/search_screen.dart';
import 'package:giaoviec/security/app_lock.dart';
import 'package:giaoviec/services/app_services.dart';
import 'package:giaoviec/services/attachments.dart';
import 'package:giaoviec/services/prefs.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});

const _oldPassword = 'matkhau-cu-01';
const _secret = 'JBSWY3DPEHPK3PXPJBSW';
const _code = '246810';

// Ảnh PNG 1x1.
const _png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';

final _due = DateTime.now().add(const Duration(days: 5)).toUtc().toIso8601String();

Map<String, dynamic> _row(int id, String title, {String status = 'IN_PROGRESS'}) => {
      'id': id,
      'title': title,
      'dueDate': _due,
      'priority': 'NORMAL',
      'status': status,
      'progress': 0,
      'overdue': false,
      'createdBy': {'id': 9, 'fullName': 'Trưởng khoa'},
      'assignees': [],
    };

/// Máy chủ giả có trạng thái tài khoản (mật khẩu, 2 lớp) và danh sách để tìm.
class SecServer {
  SecServer({
    this.role = 'STAFF',
    this.mustChangePassword = false,
    this.totpEnabled = false,
    this.overdueSupported = true,
    this.searchTotal = 3,
  });

  final String role;
  bool mustChangePassword;
  bool totpEnabled;
  bool overdueSupported;
  int searchTotal;
  final requests = <http.Request>[];

  bool get mandatory => role == 'LEADER';

  Iterable<http.Request> where(String method, String path) =>
      requests.where((r) => r.method == method && r.url.path == path);

  List<Map<String, String>> get searches =>
      where('GET', '/api/tasks').map((r) => r.url.queryParameters).toList();

  Future<http.Response> handle(http.Request req) async {
    requests.add(req);
    final path = req.url.path;
    if (req.headers['Cookie'] != 'tm_session=abc') return _json({'message': 'Chưa đăng nhập'}, 401);
    final body = req.body.isEmpty ? const {} : jsonDecode(req.body) as Map;
    switch (path) {
      case '/api/auth/me':
        return _json({
          'id': 1,
          'username': role == 'LEADER' ? 'lanhdao' : 'canbo',
          'fullName': 'Nguyễn Văn A',
          'rank': 'Thiếu tá',
          'role': role,
          'unit': {'id': 1, 'name': 'Khoa CNTT'},
          'mustChangePassword': mustChangePassword,
          'totpEnabled': totpEnabled,
          'twoFactorMandatory': mandatory,
          'twoFactorRequired': mandatory && !totpEnabled,
        });
      case '/api/auth/change-password':
        if (body['currentPassword'] != _oldPassword) return _json({'message': 'Mật khẩu hiện tại không đúng'}, 400);
        mustChangePassword = false;
        return http.Response('', 204);
      case '/api/auth/2fa/setup':
        if (mustChangePassword) {
          return _json({'code': 'PASSWORD_CHANGE_REQUIRED', 'message': 'Cần đổi mật khẩu'}, 403);
        }
        return _json({
          'otpauthUrl': 'otpauth://totp/Giao%20viec:canbo?secret=$_secret&period=30&digits=6&issuer=Giao%20viec',
          'qrDataUrl': 'data:image/png;base64,$_png',
        });
      case '/api/auth/2fa/enable':
        if (body['code'] != _code) return _json({'message': 'Mã xác thực không đúng'}, 400);
        totpEnabled = true;
        return http.Response('', 204);
      case '/api/auth/2fa/disable':
        if (body['password'] != _oldPassword || body['code'] != _code) {
          return _json({'message': 'Mật khẩu hoặc mã xác thực không đúng'}, 400);
        }
        totpEnabled = false;
        return http.Response('', 204);
      case '/api/tasks/counts':
        return _json({'todo': 0, 'review': 0, 'assigned': 0, 'created': 0, 'following': 0});
      case '/api/tasks/todo':
        return _json({'items': []});
      case '/api/tasks':
        final q = req.url.queryParameters;
        if (q['overdue'] != null && !overdueSupported) {
          return _json({'message': ['property overdue should not exist'], 'statusCode': 400}, 400);
        }
        if (q['view'] != null) return _json({'items': [], 'total': 0, 'page': 1, 'pageSize': 20});
        if ((q['q'] ?? '').contains('khongco')) return _json({'items': [], 'total': 0, 'page': 1, 'pageSize': 20});
        final page = int.parse(q['page'] ?? '1');
        final size = int.parse(q['pageSize'] ?? '20');
        final from = (page - 1) * size;
        final count = (searchTotal - from).clamp(0, size);
        return _json({
          'items': [
            for (var i = 0; i < count; i++)
              _row(from + i + 1, 'Báo cáo số ${from + i + 1}', status: q['status'] ?? 'IN_PROGRESS'),
          ],
          'total': searchTotal,
          'page': page,
          'pageSize': size,
        });
      case '/api/tasks/1':
        return _json({
          ..._row(1, 'Báo cáo số 1'),
          'description': 'Nội dung',
          'createdAt': _due,
          'children': [],
          'updates': [],
          'submissions': [],
          'attachments': [],
          'comments': [],
          'permissions': {'manage': false, 'work': true, 'acknowledge': false},
          'following': false,
        });
      case '/api/notifications/unread-count':
        return _json({'count': 0});
      case '/api/notifications/settings':
        return _json({'mobile': {'enabled': false, 'devices': 0}});
      case '/api/devices':
      case '/api/devices/unregister':
      case '/api/auth/logout':
        return http.Response('', 204);
    }
    return _json({'message': 'Không tìm thấy'}, 404);
  }
}

Future<(AppServices, SecServer)> _start(WidgetTester tester, SecServer server) async {
  final api = ApiClient(baseUrl: 'http://api.test', store: MemorySessionStore('abc'), client: MockClient(server.handle));
  final push = PushService(api: api, messaging: FakeMessaging(), config: emptyPushConfig, isAndroid: true);
  final auth = AuthController(api, beforeLogout: push.unregister);
  final lock = AppLock(deviceAuth: FakeDeviceAuth(), prefs: MemoryPrefsStore(), isSignedIn: () => api.hasSession);
  final services = AppServices(api: api, auth: auth, files: AttachmentService(api), lock: lock, push: push);
  await api.restore();
  await lock.init();
  await tester.pumpWidget(GiaoViecApp(services: services));
  await push.start();
  await auth.bootstrap();
  await tester.pumpAndSettle();
  return (services, server);
}

Future<void> _stop(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump();
}

/// Ghi lại nội dung đặt vào bộ nhớ tạm (clipboard).
List<String?> _mockClipboard(WidgetTester tester) {
  final log = <String?>[];
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
    if (call.method == 'Clipboard.setData') log.add((call.arguments as Map)['text'] as String?);
    return null;
  });
  addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
  return log;
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> _tapText(WidgetTester tester, String text) => _tap(tester, find.text(text));

Future<void> _fillPasswords(WidgetTester tester, String current, String next, String confirm) async {
  await tester.enterText(find.byKey(const Key('pw-current')), current);
  await tester.enterText(find.byKey(const Key('pw-new')), next);
  await tester.enterText(find.byKey(const Key('pw-confirm')), confirm);
}

void main() {
  group('bắt buộc đổi mật khẩu', () {
    testWidgets('kiểm tra dữ liệu, báo lỗi máy chủ, đổi xong vào ứng dụng', (tester) async {
      final (services, server) = await _start(tester, SecServer(mustChangePassword: true));
      expect(services.auth.status, AuthStatus.mustChangePassword);
      expect(find.text('Đổi mật khẩu lần đầu'), findsOneWidget);
      expect(find.text('Đăng xuất'), findsOneWidget);
      // Không còn màn hình "thiết lập trên web".
      expect(find.textContaining('trang web'), findsNothing);

      const submit = 'Đổi mật khẩu và tiếp tục';
      await _fillPasswords(tester, _oldPassword, 'ngan123', 'ngan123');
      await _tapText(tester, submit);
      expect(find.text('Mật khẩu phải có ít nhất 10 ký tự, gồm cả chữ và số'), findsOneWidget);

      await _fillPasswords(tester, _oldPassword, _oldPassword, _oldPassword);
      await _tapText(tester, submit);
      expect(find.text('Mật khẩu mới phải khác mật khẩu cũ'), findsOneWidget);

      await _fillPasswords(tester, _oldPassword, 'matkhaumoi2026', 'matkhaumoi2025');
      await _tapText(tester, submit);
      expect(find.text('Mật khẩu nhập lại không khớp'), findsOneWidget);
      expect(server.where('POST', '/api/auth/change-password'), isEmpty);

      // Máy chủ báo sai mật khẩu hiện tại: hiện ngay trên biểu mẫu, không đăng xuất.
      await _fillPasswords(tester, 'sai-mat-khau-1', 'matkhaumoi2026', 'matkhaumoi2026');
      await _tapText(tester, submit);
      expect(find.text('Mật khẩu hiện tại không đúng'), findsOneWidget);
      expect(services.auth.status, AuthStatus.mustChangePassword);

      await _fillPasswords(tester, _oldPassword, 'matkhaumoi2026', 'matkhaumoi2026');
      await _tapText(tester, submit);
      final body = jsonDecode(server.where('POST', '/api/auth/change-password').last.body) as Map;
      expect(body, {'currentPassword': _oldPassword, 'newPassword': 'matkhaumoi2026'});
      expect(services.auth.status, AuthStatus.ready);
      expect(find.text('Việc của tôi'), findsWidgets);
      expect(find.textContaining('Đã đổi mật khẩu'), findsOneWidget);
      await _stop(tester);
    });

    testWidgets('mật khẩu có nút hiện / ẩn', (tester) async {
      await _start(tester, SecServer(mustChangePassword: true));
      EditableText field() => tester.widget<EditableText>(
          find.descendant(of: find.byKey(const Key('pw-new')), matching: find.byType(EditableText)));
      expect(field().obscureText, isTrue);
      await tester.tap(find.descendant(of: find.byKey(const Key('pw-new')), matching: find.byTooltip('Hiện mật khẩu')));
      await tester.pump();
      expect(field().obscureText, isFalse);
      await _stop(tester);
    });

    testWidgets('lãnh đạo: đổi mật khẩu xong chuyển sang bắt buộc bật 2 lớp, bật xong vào ứng dụng',
        (tester) async {
      final clipboard = _mockClipboard(tester);
      final (services, server) = await _start(tester, SecServer(role: 'LEADER', mustChangePassword: true));
      expect(services.auth.status, AuthStatus.mustChangePassword);

      await _fillPasswords(tester, _oldPassword, 'matkhaumoi2026', 'matkhaumoi2026');
      await _tapText(tester, 'Đổi mật khẩu và tiếp tục');
      expect(services.auth.status, AuthStatus.twoFactorSetup);
      expect(find.text('Bật xác thực hai lớp'), findsWidgets);
      expect(server.where('POST', '/api/auth/2fa/setup'), hasLength(1));

      // Khóa nhập tay: nhóm 4 ký tự, tên tài khoản, nút sao chép; mã QR cho máy khác.
      expect(find.text('JBSW Y3DP EHPK 3PXP JBSW'), findsOneWidget);
      expect(find.text('lanhdao'), findsNothing); // nằm trong Text.rich
      expect(find.textContaining('lanhdao', findRichText: true), findsOneWidget);
      expect(find.byKey(const Key('otp-qr')), findsOneWidget);
      await _tapText(tester, 'Sao chép khóa');
      expect(clipboard, [_secret]);

      // Sai mã: báo trên màn hình.
      await tester.enterText(find.byType(TextFormField).last, '111111');
      await _tap(tester, find.widgetWithText(FilledButton, 'Bật xác thực hai lớp'));
      expect(find.text('Mã xác thực không đúng'), findsOneWidget);
      expect(services.auth.status, AuthStatus.twoFactorSetup);

      await tester.enterText(find.byType(TextFormField).last, _code);
      await _tap(tester, find.widgetWithText(FilledButton, 'Bật xác thực hai lớp'));
      expect((jsonDecode(server.where('POST', '/api/auth/2fa/enable').last.body) as Map)['code'], _code);
      expect(services.auth.status, AuthStatus.ready);
      expect(find.text('Việc của tôi'), findsWidgets);
      // Rời màn hình thiết lập: khóa đã sao chép bị xóa khỏi bộ nhớ tạm.
      expect(clipboard.last, '');
      await _stop(tester);
    });

    testWidgets('màn hình bắt buộc có nút đăng xuất', (tester) async {
      final (services, server) = await _start(tester, SecServer(role: 'LEADER'));
      expect(services.auth.status, AuthStatus.twoFactorSetup);
      await _tapText(tester, 'Đăng xuất');
      expect(server.where('POST', '/api/auth/logout'), hasLength(1));
      expect(services.auth.status, AuthStatus.loggedOut);
      expect(find.text('Đăng nhập'), findsOneWidget);
      await _stop(tester);
    });
  });

  group('Tài khoản', () {
    Future<void> openAccount(WidgetTester tester) async {
      await tester.tap(find.text('Tài khoản'));
      await tester.pumpAndSettle();
    }

    testWidgets('cán bộ chưa bật 2 lớp: nút bật, mở màn hình thiết lập, bật xong quay lại', (tester) async {
      final (_, server) = await _start(tester, SecServer());
      await openAccount(tester);
      expect(find.byKey(const Key('2fa-off')), findsOneWidget);
      expect(find.textContaining('Đổi mật khẩu, xác thực hai lớp'), findsNothing);

      await _tapText(tester, 'Bật xác thực hai lớp');
      expect(find.text('JBSW Y3DP EHPK 3PXP JBSW'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField).last, _code);
      await _tap(tester, find.widgetWithText(FilledButton, 'Bật xác thực hai lớp'));
      expect(server.totpEnabled, isTrue);
      expect(find.byKey(const Key('2fa-on')), findsOneWidget);
      expect(find.text('JBSW Y3DP EHPK 3PXP JBSW'), findsNothing);
      await _stop(tester);
    });

    testWidgets('đang bật, không bắt buộc: tắt bằng mật khẩu và mã', (tester) async {
      final (_, server) = await _start(tester, SecServer(totpEnabled: true));
      await openAccount(tester);
      expect(find.byKey(const Key('2fa-on')), findsOneWidget);
      await _tapText(tester, 'Tắt');
      expect(find.text('Tắt xác thực hai lớp?'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('disable-password')), 'sai-mat-khau');
      await tester.enterText(find.byType(TextFormField).last, _code);
      await _tap(tester, find.widgetWithText(FilledButton, 'Tắt'));
      expect(find.text('Mật khẩu hoặc mã xác thực không đúng'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('disable-password')), _oldPassword);
      await _tap(tester, find.widgetWithText(FilledButton, 'Tắt'));
      expect(jsonDecode(server.where('POST', '/api/auth/2fa/disable').last.body), {
        'password': _oldPassword,
        'code': _code,
      });
      expect(find.text('Tắt xác thực hai lớp?'), findsNothing);
      expect(find.text('Đã tắt xác thực hai lớp'), findsOneWidget);
      expect(find.byKey(const Key('2fa-off')), findsOneWidget);
      await _stop(tester);
    });

    testWidgets('lãnh đạo, bắt buộc: không có nút tắt, hướng dẫn báo quản trị khi mất máy', (tester) async {
      await _start(tester, SecServer(role: 'LEADER', totpEnabled: true));
      await openAccount(tester);
      expect(find.byKey(const Key('2fa-mandatory')), findsOneWidget);
      expect(find.textContaining('bắt buộc dùng xác thực hai lớp'), findsOneWidget);
      expect(find.textContaining('báo quản trị hệ thống đặt lại'), findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, 'Tắt'), findsNothing);
      await _stop(tester);
    });

    testWidgets('đổi mật khẩu (không bắt buộc) rồi quay lại Tài khoản', (tester) async {
      final (services, server) = await _start(tester, SecServer());
      await openAccount(tester);
      await _tapText(tester, 'Đổi mật khẩu');
      expect(find.byKey(const Key('pw-current')), findsOneWidget);
      await _fillPasswords(tester, _oldPassword, 'matkhaumoi2026', 'matkhaumoi2026');
      await _tap(tester, find.widgetWithText(FilledButton, 'Đổi mật khẩu'));
      expect(server.where('POST', '/api/auth/change-password'), hasLength(1));
      expect(find.byKey(const Key('pw-current')), findsNothing);
      expect(find.byKey(const Key('2fa-off')), findsOneWidget);
      expect(services.auth.status, AuthStatus.ready);
      await _stop(tester);
    });
  });

  group('Tìm nhiệm vụ', () {
    Future<void> openSearch(WidgetTester tester) async {
      await _tap(tester, find.byKey(const Key('open-search')));
    }

    testWidgets('chờ 400 ms, tối thiểu 2 ký tự, gửi q/page/pageSize, mở chi tiết', (tester) async {
      final (_, server) = await _start(tester, SecServer());
      await openSearch(tester);
      final field = tester.widget<TextField>(find.byKey(const Key('search-field')));
      expect(field.autofocus, isTrue);
      expect(find.textContaining('Nhập tên nhiệm vụ'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('search-field')), 'b');
      await tester.pump(searchDebounce);
      await tester.pumpAndSettle();
      expect(server.searches, isEmpty);
      expect(find.text('Nhập ít nhất 2 ký tự để tìm'), findsOneWidget);

      // Gõ liên tục: chỉ gửi một lần sau khi ngừng gõ.
      await tester.enterText(find.byKey(const Key('search-field')), 'bá');
      await tester.pump(const Duration(milliseconds: 200));
      await tester.enterText(find.byKey(const Key('search-field')), 'báo c');
      await tester.pump(const Duration(milliseconds: 300));
      expect(server.searches, isEmpty);
      await tester.pump(const Duration(milliseconds: 150));
      await tester.pumpAndSettle();
      expect(server.searches, [
        {'q': 'báo c', 'page': '1', 'pageSize': '20'},
      ]);
      expect(find.text('Tìm thấy 3 nhiệm vụ'), findsOneWidget);
      expect(find.text('Báo cáo số 2'), findsOneWidget);

      await tester.tap(find.text('Báo cáo số 1'));
      await tester.pumpAndSettle();
      expect(find.text('Chi tiết nhiệm vụ'), findsOneWidget);
      await _stop(tester);
    });

    testWidgets('lọc trạng thái, "Quá hạn" chưa hỗ trợ thì bỏ lọc lặng lẽ, trạng thái rỗng', (tester) async {
      final (_, server) = await _start(tester, SecServer(overdueSupported: false));
      await openSearch(tester);
      await tester.enterText(find.byKey(const Key('search-field')), 'báo cáo');
      await tester.pump(searchDebounce);
      await tester.pumpAndSettle();
      expect(server.searches, hasLength(1));

      await _tap(tester, find.byKey(const Key('chip-PENDING_REVIEW')));
      expect(server.searches.last, {'q': 'báo cáo', 'page': '1', 'pageSize': '20', 'status': 'PENDING_REVIEW'});

      await _tap(tester, find.byKey(const Key('chip-overdue')));
      final last = server.searches.sublist(server.searches.length - 2);
      expect(last[0]['overdue'], '1'); // bị 400
      expect(last[1], {'q': 'báo cáo', 'page': '1', 'pageSize': '20', 'status': 'PENDING_REVIEW'});
      expect(find.byKey(const Key('chip-overdue')), findsNothing);
      expect(find.textContaining('overdue'), findsNothing);
      expect(find.text('Tìm thấy 3 nhiệm vụ'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('search-field')), 'khongco');
      await tester.pump(searchDebounce);
      await tester.pumpAndSettle();
      expect(find.text('Không tìm thấy nhiệm vụ phù hợp'), findsOneWidget);
      await _stop(tester);
    });

    testWidgets('máy chủ có "Quá hạn": gửi overdue=1', (tester) async {
      final (_, server) = await _start(tester, SecServer());
      await openSearch(tester);
      await tester.enterText(find.byKey(const Key('search-field')), 'báo cáo');
      await tester.testTextInput.receiveAction(TextInputAction.search); // bấm Tìm: không chờ
      await tester.pumpAndSettle();
      expect(server.searches, hasLength(1));
      await _tap(tester, find.byKey(const Key('chip-overdue')));
      expect(server.searches.last['overdue'], '1');
      expect(find.byKey(const Key('chip-overdue')), findsOneWidget);
      await _stop(tester);
    });

    testWidgets('cuộn xuống tải trang tiếp', (tester) async {
      final (_, server) = await _start(tester, SecServer(searchTotal: 25));
      await openSearch(tester);
      await tester.enterText(find.byKey(const Key('search-field')), 'báo cáo');
      await tester.pump(searchDebounce);
      await tester.pumpAndSettle();
      expect(server.searches.map((q) => q['page']), ['1']);
      final results = find.byKey(const Key('search-results'));
      await tester.drag(results, const Offset(0, -3000));
      await tester.pumpAndSettle();
      expect(server.searches.map((q) => q['page']), ['1', '2']);
      await tester.scrollUntilVisible(
        find.text('Báo cáo số 25'),
        300,
        scrollable: find.descendant(of: results, matching: find.byType(Scrollable)).first,
      );
      expect(find.text('Báo cáo số 25'), findsOneWidget);
      await _stop(tester);
    });
  });
}
