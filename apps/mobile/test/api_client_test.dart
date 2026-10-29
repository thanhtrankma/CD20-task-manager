import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/api/api_client.dart';
import 'package:giaoviec/api/session_store.dart';
import 'package:giaoviec/auth/auth_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response jsonRes(Object body, int status, {Map<String, String> headers = const {}}) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json; charset=utf-8', ...headers},
    );

void main() {
  group('extractSessionCookie', () {
    test('lấy đúng cookie phiên, bỏ thuộc tính', () {
      expect(extractSessionCookie('tm_session=abc123; Path=/; HttpOnly; SameSite=Strict'), 'abc123');
    });
    test('nhiều cookie gộp bằng dấu phẩy', () {
      expect(extractSessionCookie('other=1; Path=/,tm_session=xyz; Path=/; HttpOnly'), 'xyz');
    });
    test('cookie rỗng (xóa phiên) hoặc không có', () {
      expect(extractSessionCookie('tm_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'), isNull);
      expect(extractSessionCookie(null), isNull);
      expect(extractSessionCookie('xtm_session=1'), isNull);
    });
  });

  group('errorMessageFrom', () {
    test('chuỗi', () => expect(errorMessageFrom(400, {'message': 'Hạn mới phải sau hạn hiện tại'}), 'Hạn mới phải sau hạn hiện tại'));
    test('mảng lỗi kiểm tra dữ liệu', () {
      expect(errorMessageFrom(400, {'message': ['a', 'b']}), 'a; b');
    });
    test('429 của bộ giới hạn đăng nhập', () {
      expect(errorMessageFrom(429, {'message': 'ThrottlerException: Too Many Requests'}), contains('quá nhiều lần'));
    });
    test('429 của đôn đốc giữ câu của máy chủ', () {
      expect(errorMessageFrom(429, {'message': 'Mỗi ngày chỉ đôn đốc tối đa 3 lần'}), 'Mỗi ngày chỉ đôn đốc tối đa 3 lần');
    });
    test('không có nội dung', () => expect(errorMessageFrom(500, null), contains('sự cố')));
  });

  group('ApiClient', () {
    late List<http.BaseRequest> requests;
    late MemorySessionStore store;

    ApiClient make(Future<http.Response> Function(http.Request) handler) {
      requests = [];
      return ApiClient(
        baseUrl: 'http://api.test',
        store: store,
        client: MockClient((req) {
          requests.add(req);
          return handler(req);
        }),
      );
    }

    setUp(() => store = MemorySessionStore());

    test('đăng nhập: lưu cookie phiên, gửi lại qua tiêu đề Cookie, không gửi Origin', () async {
      final api = make((req) async {
        if (req.url.path == '/api/auth/login') {
          expect(jsonDecode(req.body), {'username': 'canbo', 'password': 'pw'});
          return jsonRes({'id': 1}, 200, headers: {'set-cookie': 'tm_session=tok123; Path=/; HttpOnly; SameSite=Strict'});
        }
        return jsonRes({'id': 1, 'fullName': 'A'}, 200);
      });
      await api.login('canbo', 'pw');
      expect(store.token, 'tok123');
      expect(api.hasSession, isTrue);

      await api.get('/auth/me');
      final me = requests.last;
      expect(me.url.toString(), 'http://api.test/api/auth/me');
      expect(me.headers['Cookie'], 'tm_session=tok123');
      for (final r in requests) {
        expect(r.headers.keys.map((k) => k.toLowerCase()), isNot(contains('origin')));
      }
    });

    test('khôi phục phiên đã lưu khi mở ứng dụng', () async {
      store.token = 'saved';
      final api = make((req) async => jsonRes({'count': 2}, 200));
      await api.restore();
      await api.get('/notifications/unread-count');
      expect(requests.single.headers['Cookie'], 'tm_session=saved');
    });

    test('cần mã OTP: ném lỗi isOtpRequired, gửi lại kèm otp', () async {
      final api = make((req) async {
        final body = jsonDecode(req.body) as Map;
        if (body['otp'] == null) {
          return jsonRes({'statusCode': 401, 'code': 'OTP_REQUIRED', 'message': 'Nhập mã xác thực hai lớp'}, 401);
        }
        expect(body['otp'], '123456');
        return jsonRes({'id': 3}, 200, headers: {'set-cookie': 'tm_session=t2; Path=/'});
      });
      await expectLater(
        api.login('lanhdao', 'pw'),
        throwsA(isA<ApiException>().having((e) => e.isOtpRequired, 'isOtpRequired', isTrue)),
      );
      expect(store.token, isNull);
      await api.login('lanhdao', 'pw', otp: '123456');
      expect(store.token, 't2');
    });

    test('sai mật khẩu: lỗi 401 với câu của máy chủ, không gọi onUnauthorized', () async {
      var expired = 0;
      final api = make((req) async => jsonRes({'message': 'Sai tên đăng nhập hoặc mật khẩu'}, 401));
      api.onUnauthorized = () => expired++;
      await expectLater(
        api.login('x', 'y'),
        throwsA(isA<ApiException>()
            .having((e) => e.message, 'message', 'Sai tên đăng nhập hoặc mật khẩu')
            .having((e) => e.isOtpRequired, 'otp', isFalse)),
      );
      expect(expired, 0);
    });

    test('401 khi đang đăng nhập: xóa phiên và báo hết hạn', () async {
      store.token = 'old';
      var expired = 0;
      final api = make((req) async => jsonRes({'message': 'Chưa đăng nhập hoặc phiên đã hết hạn'}, 401));
      api.onUnauthorized = () => expired++;
      await api.restore();
      await expectLater(api.get('/tasks/todo'), throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
      await Future<void>.delayed(Duration.zero);
      expect(expired, 1);
      expect(api.hasSession, isFalse);
      expect(store.token, isNull);
    });

    test('403 cần thiết lập tài khoản: gọi onSetupRequired', () async {
      store.token = 't';
      String? code;
      final api = make((req) async =>
          jsonRes({'code': 'PASSWORD_CHANGE_REQUIRED', 'message': 'Cần đổi mật khẩu trước khi sử dụng'}, 403));
      api.onSetupRequired = (c) => code = c;
      await api.restore();
      await expectLater(api.get('/tasks/counts'), throwsA(isA<ApiException>()));
      expect(code, 'PASSWORD_CHANGE_REQUIRED');
      expect(api.hasSession, isTrue);
    });

    test('lỗi mạng thành câu tiếng Việt', () async {
      final api = make((req) async => throw const SocketException('down'));
      await expectLater(
        api.get('/tasks/todo'),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 0).having((e) => e.message, 'm', contains('mạng'))),
      );
    });

    test('204 trả về null; tham số truy vấn', () async {
      store.token = 't';
      final api = make((req) async => http.Response('', 204));
      await api.restore();
      expect(await api.post('/tasks/5/acknowledge'), isNull);
      await api.get('/tasks', query: {'view': 'assigned', 'page': 2, 'q': null});
      expect(requests.last.url.toString(), 'http://api.test/api/tasks?view=assigned&page=2');
    });

    test('tải tệp lên dạng multipart, trường file', () async {
      store.token = 't';
      final api = make((req) async => jsonRes({'id': 9, 'originalName': 'a.jpg', 'size': 3}, 201));
      await api.restore();
      final r = await api.upload('/files', bytes: Uint8List.fromList([0xff, 0xd8, 0xff]), filename: 'a.jpg', query: {'taskId': 4});
      expect(r['id'], 9);
      final req = requests.single;
      expect(req.url.toString(), 'http://api.test/api/files?taskId=4');
      expect(req.headers['content-type'], startsWith('multipart/form-data'));
      expect(req.headers['Cookie'], 'tm_session=t');
      expect(latin1.decode((req as http.Request).bodyBytes), contains('name="file"; filename="a.jpg"'));
    });

    test('đăng xuất: gọi máy chủ rồi xóa phiên', () async {
      store.token = 't';
      final api = make((req) async => http.Response('', 204));
      await api.restore();
      await api.logout();
      expect(requests.single.url.path, '/api/auth/logout');
      expect(store.token, isNull);
      expect(api.hasSession, isFalse);
    });
  });

  group('AuthController', () {
    Future<AuthController> boot(Map<String, dynamic> me) async {
      final store = MemorySessionStore('t');
      final api = ApiClient(baseUrl: 'http://api.test', store: store, client: MockClient((req) async => jsonRes(me, 200)));
      final auth = AuthController(api);
      await auth.bootstrap();
      return auth;
    }

    test('không có phiên: về đăng nhập', () async {
      final api = ApiClient(baseUrl: 'http://api.test', store: MemorySessionStore(), client: MockClient((_) async => http.Response('', 500)));
      final auth = AuthController(api);
      await auth.bootstrap();
      expect(auth.status, AuthStatus.loggedOut);
    });

    test('cán bộ: sẵn sàng', () async {
      final auth = await boot({'id': 1, 'role': 'STAFF', 'fullName': 'A', 'unit': {'name': 'Khoa CNTT'}});
      expect(auth.status, AuthStatus.ready);
      expect(auth.me!.unitName, 'Khoa CNTT');
    });

    test('phải đổi mật khẩu / bật 2 lớp: chuyển sang màn hình bắt buộc tương ứng', () async {
      expect((await boot({'role': 'STAFF', 'mustChangePassword': true})).status, AuthStatus.mustChangePassword);
      expect((await boot({'role': 'LEADER', 'twoFactorRequired': true})).status, AuthStatus.twoFactorSetup);
      // Cả hai: đổi mật khẩu trước (máy chủ không cho tạo khóa 2 lớp khi chưa đổi mật khẩu).
      expect(
        (await boot({'role': 'LEADER', 'mustChangePassword': true, 'twoFactorRequired': true})).status,
        AuthStatus.mustChangePassword,
      );
    });

    test('403 TWO_FACTOR_REQUIRED / PASSWORD_CHANGE_REQUIRED giữa chừng: chuyển màn hình bắt buộc', () async {
      var code = '';
      final api = ApiClient(
        baseUrl: 'http://api.test',
        store: MemorySessionStore('t'),
        client: MockClient((req) async => req.url.path == '/api/auth/me'
            ? jsonRes({'role': 'LEADER'}, 200)
            : jsonRes({'code': code, 'message': 'Cần thiết lập'}, 403)),
      );
      final auth = AuthController(api);
      await auth.bootstrap();
      expect(auth.status, AuthStatus.ready);
      code = 'TWO_FACTOR_REQUIRED';
      await expectLater(api.get('/tasks'), throwsA(isA<ApiException>()));
      expect(auth.status, AuthStatus.twoFactorSetup);
      code = 'PASSWORD_CHANGE_REQUIRED';
      await expectLater(api.get('/tasks'), throwsA(isA<ApiException>()));
      expect(auth.status, AuthStatus.mustChangePassword);
    });

    test('quản trị: không dùng ứng dụng', () async {
      expect((await boot({'role': 'ADMIN'})).status, AuthStatus.adminOnly);
    });

    test('phiên hết hạn giữa chừng: về đăng nhập kèm thông báo', () async {
      var calls = 0;
      final api = ApiClient(
        baseUrl: 'http://api.test',
        store: MemorySessionStore('t'),
        client: MockClient((req) async {
          calls++;
          return calls == 1 ? jsonRes({'role': 'STAFF'}, 200) : jsonRes({'message': 'hết hạn'}, 401);
        }),
      );
      final auth = AuthController(api);
      await auth.bootstrap();
      expect(auth.status, AuthStatus.ready);
      await expectLater(api.get('/tasks/todo'), throwsA(isA<ApiException>()));
      expect(auth.status, AuthStatus.loggedOut);
      expect(auth.notice, isNotNull);
    });
  });
}
