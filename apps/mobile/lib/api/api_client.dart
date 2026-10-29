import 'dart:async';
import 'dart:convert';
import 'dart:io' show SocketException, HandshakeException;
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;

import '../config.dart';
import 'session_store.dart';

const sessionCookie = 'tm_session';

/// Lỗi từ máy chủ (hoặc lỗi kết nối, [status] = 0). [message] đã là câu tiếng Việt để hiện cho người dùng.
class ApiException implements Exception {
  ApiException(this.status, this.message, {this.code});
  final int status;
  final String message;
  final String? code;

  bool get isOtpRequired => status == 401 && code == 'OTP_REQUIRED';

  @override
  String toString() => message;
}

/// Mã lỗi 403 của máy chủ khi tài khoản chưa hoàn tất thiết lập (đổi mật khẩu, bật xác thực hai lớp).
const setupCodes = {'PASSWORD_CHANGE_REQUIRED', 'TWO_FACTOR_REQUIRED'};

/// Lấy giá trị cookie phiên từ tiêu đề Set-Cookie (có thể gộp nhiều cookie, ngăn cách bằng dấu phẩy).
String? extractSessionCookie(String? setCookie) {
  if (setCookie == null) return null;
  final m = RegExp('(?:^|[,;]\\s*)$sessionCookie=([^;,\\s]*)').firstMatch(setCookie);
  final value = m?.group(1);
  return (value == null || value.isEmpty) ? null : value;
}

/// Ghép thông báo lỗi: `message` của NestJS là chuỗi hoặc mảng chuỗi (lỗi kiểm tra dữ liệu).
String errorMessageFrom(int status, Object? body) {
  final raw = body is Map ? body['message'] : null;
  String? msg;
  if (raw is List) {
    msg = raw.map((e) => e.toString()).where((e) => e.isNotEmpty).join('; ');
  } else if (raw is String) {
    msg = raw;
  }
  if (status == 429 && (msg == null || msg.contains('ThrottlerException'))) {
    return 'Thao tác quá nhiều lần, đồng chí thử lại sau ít phút';
  }
  if (msg != null && msg.isNotEmpty) return msg;
  return switch (status) {
    401 => 'Chưa đăng nhập hoặc phiên đã hết hạn',
    403 => 'Không có quyền thực hiện chức năng này',
    404 => 'Không tìm thấy dữ liệu',
    413 => 'Tệp quá lớn',
    >= 500 => 'Máy chủ đang gặp sự cố, đồng chí thử lại sau',
    _ => 'Có lỗi xảy ra (mã $status)',
  };
}

/// Ứng dụng là máy khách của API `/api`. Phiên đăng nhập là cookie `tm_session` do máy chủ cấp khi đăng nhập;
/// ứng dụng giữ giá trị cookie trong kho bảo mật và tự gửi lại qua tiêu đề `Cookie`.
/// Không gửi tiêu đề `Origin` (máy chủ từ chối thao tác ghi có Origin lạ). Không ghi nhật ký nội dung.
class ApiClient {
  ApiClient({
    required String baseUrl,
    required this.store,
    http.Client? client,
    this.userAgent = 'GiaoNhiemVu-Mobile/$appVersion',
    this.timeout = const Duration(seconds: 20),
    this.transferTimeout = const Duration(minutes: 3),
  })  : _base = Uri.parse('$baseUrl/api'),
        _http = client ?? http.Client();

  final Uri _base;
  final SessionStore store;
  final http.Client _http;
  final String userAgent;
  final Duration timeout;
  final Duration transferTimeout;
  String? _token;

  /// Gọi khi máy chủ báo phiên hết hạn (401) với một yêu cầu đã đăng nhập; phiên đã được xóa trước đó.
  void Function()? onUnauthorized;

  /// Gọi khi máy chủ yêu cầu hoàn tất thiết lập tài khoản (403 PASSWORD_CHANGE_REQUIRED, TWO_FACTOR_REQUIRED).
  void Function(String code)? onSetupRequired;

  bool get hasSession => _token != null;

  /// Đọc mã phiên đã lưu (khi mở ứng dụng).
  Future<void> restore() async {
    try {
      _token = await store.read();
    } catch (_) {
      _token = null;
    }
  }

  Future<void> clearSession() async {
    _token = null;
    try {
      await store.clear();
    } catch (_) {}
  }

  Uri uri(String path, [Map<String, Object?>? query]) {
    final q = <String, String>{
      for (final e in (query ?? const {}).entries)
        if (e.value != null && '${e.value}'.isNotEmpty) e.key: '${e.value}',
    };
    return _base.replace(path: '${_base.path}$path', queryParameters: q.isEmpty ? null : q);
  }

  Map<String, String> _headers({bool json = false}) => {
        'Accept': 'application/json',
        'User-Agent': userAgent,
        if (json) 'Content-Type': 'application/json; charset=utf-8',
        if (_token != null) 'Cookie': '$sessionCookie=$_token',
      };

  // ---------- Đăng nhập ----------

  /// POST /auth/login. Thành công: lưu cookie phiên, trả về thông tin người dùng rút gọn.
  /// Cần mã OTP: ném [ApiException] có [ApiException.isOtpRequired].
  Future<Map<String, dynamic>> login(String username, String password, {String? otp}) async {
    await clearSession();
    final res = await _send(
      () => _http.post(
        uri('/auth/login'),
        headers: _headers(json: true),
        body: jsonEncode({
          'username': username,
          'password': password,
          if (otp != null && otp.isNotEmpty) 'otp': otp,
        }),
      ),
      timeout,
    );
    final body = _decode(res);
    if (res.statusCode != 200) {
      throw ApiException(res.statusCode, errorMessageFrom(res.statusCode, body),
          code: body is Map ? body['code']?.toString() : null);
    }
    final token = extractSessionCookie(res.headers['set-cookie']);
    if (token == null) {
      throw ApiException(0, 'Máy chủ không cấp phiên đăng nhập. Đồng chí kiểm tra lại địa chỉ máy chủ.');
    }
    _token = token;
    await store.write(token);
    return body is Map<String, dynamic> ? body : <String, dynamic>{};
  }

  /// POST /auth/logout (bỏ qua lỗi mạng) rồi xóa phiên trên máy.
  Future<void> logout() async {
    if (_token != null) {
      try {
        await _http.post(uri('/auth/logout'), headers: _headers(json: true), body: '{}').timeout(timeout);
      } catch (_) {}
    }
    await clearSession();
  }

  // ---------- Gọi API ----------

  Future<dynamic> get(String path, {Map<String, Object?>? query}) =>
      _json(() => _http.get(uri(path, query), headers: _headers()));

  Future<dynamic> post(String path, [Object? body]) => _json(
      () => _http.post(uri(path), headers: _headers(json: true), body: jsonEncode(body ?? const {})));

  Future<dynamic> patch(String path, Object body) =>
      _json(() => _http.patch(uri(path), headers: _headers(json: true), body: jsonEncode(body)));

  Future<dynamic> delete(String path) => _json(() => _http.delete(uri(path), headers: _headers()));

  /// Tải tệp lên (multipart, trường `file`). [contentType] ví dụ `image/jpeg` (mặc định application/octet-stream).
  Future<dynamic> upload(
    String path, {
    required Uint8List bytes,
    required String filename,
    Map<String, Object?>? query,
    String? contentType,
  }) {
    return _json(() async {
      final req = http.MultipartRequest('POST', uri(path, query))
        ..headers.addAll(_headers())
        ..files.add(http.MultipartFile.fromBytes(
          'file',
          bytes,
          filename: filename,
          contentType: contentType == null ? null : MediaType.parse(contentType),
        ));
      return http.Response.fromStream(await _http.send(req));
    }, transferTimeout);
  }

  /// Tải tệp về (giữ trong bộ nhớ).
  Future<Uint8List> download(String path) async {
    final res = await _send(() => _http.get(uri(path), headers: _headers()), transferTimeout);
    _check(res);
    return res.bodyBytes;
  }

  /// Địa chỉ đầy đủ cho đường dẫn máy chủ trả về sẵn (ví dụ `avatarUrl` = `/api/users/12/avatar?v=1a2b`).
  /// Chỉ nhận đường dẫn tương đối trên **cùng máy chủ** (không gửi cookie phiên sang máy khác); sai thì trả null.
  Uri? serverUri(String serverPath) {
    if (!serverPath.startsWith('/api/') || serverPath.contains('..') || serverPath.contains('\\')) return null;
    final parsed = Uri.tryParse(serverPath);
    if (parsed == null || parsed.hasScheme || parsed.hasAuthority) return null;
    return _base.replace(path: parsed.path, query: parsed.hasQuery ? parsed.query : null);
  }

  /// Tải ảnh / tệp theo đường dẫn máy chủ trả về (xem [serverUri]), giữ trong bộ nhớ.
  Future<Uint8List> downloadServerPath(String serverPath) async {
    final target = serverUri(serverPath);
    if (target == null) throw ApiException(0, 'Đường dẫn không hợp lệ');
    final res = await _send(() => _http.get(target, headers: _headers()), timeout);
    _check(res);
    return res.bodyBytes;
  }

  /// Mở luồng Server-Sent Events (GET, `Accept: text/event-stream`), trả về luồng byte khi máy chủ trả 2xx.
  /// Mã lỗi xử lý như mọi yêu cầu khác (401: xóa phiên, về đăng nhập). [abort] hoàn thành thì ngắt kết nối.
  Future<Stream<List<int>>> openEventStream(String path, {Future<void>? abort}) async {
    final req = http.AbortableRequest('GET', uri(path), abortTrigger: abort)
      ..headers.addAll({..._headers(), 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache'});
    final http.StreamedResponse res;
    try {
      res = await _http.send(req).timeout(timeout);
    } on TimeoutException {
      throw ApiException(0, 'Máy chủ không phản hồi, đồng chí thử lại sau');
    } on http.RequestAbortedException {
      throw ApiException(0, 'Đã ngắt kết nối');
    } on SocketException {
      throw ApiException(0, 'Không kết nối được máy chủ. Đồng chí kiểm tra mạng.');
    } on HandshakeException {
      throw ApiException(0, 'Kết nối không an toàn tới máy chủ, đã ngắt');
    } on http.ClientException {
      throw ApiException(0, 'Không kết nối được máy chủ. Đồng chí kiểm tra mạng.');
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      _check(await http.Response.fromStream(res).timeout(timeout));
    }
    return res.stream;
  }

  Future<dynamic> _json(Future<http.Response> Function() run, [Duration? limit]) async {
    final res = await _send(run, limit ?? timeout);
    _check(res);
    if (res.statusCode == 204 || res.bodyBytes.isEmpty) return null;
    return _decode(res);
  }

  Future<http.Response> _send(Future<http.Response> Function() run, Duration limit) async {
    try {
      return await run().timeout(limit);
    } on TimeoutException {
      throw ApiException(0, 'Máy chủ không phản hồi, đồng chí thử lại sau');
    } on HandshakeException {
      throw ApiException(0, 'Kết nối không an toàn tới máy chủ, đã ngắt');
    } on SocketException {
      throw ApiException(0, 'Không kết nối được máy chủ. Đồng chí kiểm tra mạng.');
    } on http.ClientException {
      throw ApiException(0, 'Không kết nối được máy chủ. Đồng chí kiểm tra mạng.');
    }
  }

  void _check(http.Response res) {
    final status = res.statusCode;
    if (status >= 200 && status < 300) return;
    final body = _decode(res);
    final code = body is Map ? body['code']?.toString() : null;
    final error = ApiException(status, errorMessageFrom(status, body), code: code);
    if (status == 401) {
      final hadSession = _token != null;
      _token = null;
      // Xóa kho bảo mật không chờ; báo cho lớp trên chuyển về màn hình đăng nhập.
      unawaited(store.clear().catchError((_) {}));
      if (hadSession) onUnauthorized?.call();
    } else if (status == 403 && code != null && setupCodes.contains(code)) {
      onSetupRequired?.call(code);
    }
    throw error;
  }

  Object? _decode(http.Response res) {
    if (res.bodyBytes.isEmpty) return null;
    try {
      return jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {
      return null;
    }
  }
}
