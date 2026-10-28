import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../config.dart';
import 'messaging.dart';
import 'push_config.dart';

enum PushState {
  /// Bản build không có cấu hình Firebase (thiếu dart-define).
  notConfigured,

  /// Đã cấu hình, chưa đăng ký (chưa đăng nhập hoặc đang đăng ký).
  idle,

  /// Người dùng không cho phép hiện thông báo.
  permissionDenied,

  /// Đã đăng ký thiết bị với máy chủ.
  registered,

  /// Máy chủ chưa có chức năng nhận thiết bị (404) — bản API cũ.
  serverUnsupported,

  /// Không khởi tạo được Firebase hoặc không lấy được mã thiết bị.
  unavailable,
}

/// Ghi nhật ký gỡ lỗi về thông báo đẩy: chỉ ở bản debug, **không bao giờ** ghi mã thiết bị hay nội dung thông báo.
void _log(String message) {
  if (kDebugMode) debugPrint('[push] $message');
}

/// Thông báo đẩy phía ứng dụng: khởi tạo FCM, xin quyền sau khi đăng nhập, đăng ký / hủy đăng ký mã thiết bị
/// với máy chủ (`POST /devices`, `POST /devices/unregister`), chuyển tiếp thông báo tới giao diện.
class PushService extends ChangeNotifier {
  PushService({
    required this.api,
    required this.messaging,
    required this.config,
    required this.isAndroid,
  });

  final ApiClient api;
  final MessagingLayer messaging;
  final PushConfig config;
  final bool isAndroid;

  PushState _state = PushState.notConfigured;
  PushState get state => _state;

  bool get configured => config.isConfiguredFor(android: isAndroid);

  String? _token;
  bool _signedIn = false;
  Future<void>? _starting;
  bool _ready = false;
  Future<void>? _registering;
  final _subs = <StreamSubscription<Object?>>[];

  /// Thông báo tới khi ứng dụng đang mở (giao diện hiện thanh báo, làm mới số chưa đọc).
  final _foreground = StreamController<PushMessage>.broadcast();
  Stream<PushMessage> get foregroundMessages => _foreground.stream;

  /// Thông báo người dùng đã bấm, chờ mở nhiệm vụ (sau khi mở khóa và đã đăng nhập).
  final pendingOpen = ValueNotifier<PushMessage?>(null);

  void _setState(PushState s) {
    if (_state == s) return;
    _state = s;
    notifyListeners();
  }

  /// Gọi một lần khi mở ứng dụng.
  Future<void> start() => _starting ??= _start();

  Future<void> _start() async {
    if (!configured) {
      _log('chưa cấu hình FCM, tắt thông báo đẩy');
      _setState(PushState.notConfigured);
      return;
    }
    try {
      await messaging.init(config, android: isAndroid);
    } catch (e) {
      _log('không khởi tạo được Firebase (${e.runtimeType})');
      _setState(PushState.unavailable);
      return;
    }
    _ready = true;
    _setState(PushState.idle);
    _subs.add(messaging.onTokenRefresh.listen((t) {
      _token = t;
      if (_signedIn) unawaited(_post(t));
    }));
    _subs.add(messaging.onForegroundMessage.listen(_foreground.add));
    _subs.add(messaging.onMessageOpened.listen((m) => pendingOpen.value = m));
    try {
      final initial = await messaging.initialMessage();
      if (initial != null) pendingOpen.value = initial;
    } catch (_) {}
  }

  /// Sau khi đăng nhập và mỗi lần mở ứng dụng khi đã đăng nhập: xin quyền, lấy mã, đăng ký với máy chủ.
  Future<void> register() async {
    _signedIn = true;
    await start();
    if (!_ready || !_signedIn) return;
    await (_registering ??= _register().whenComplete(() => _registering = null));
  }

  Future<void> _register() async {
    try {
      final permission = await messaging.requestPermission();
      if (permission == PushPermission.denied) {
        _log('người dùng không cho phép thông báo');
        _setState(PushState.permissionDenied);
        return;
      }
      final token = await messaging.getToken();
      if (token == null || token.isEmpty) {
        _log('chưa lấy được mã thiết bị');
        _setState(PushState.unavailable);
        return;
      }
      _token = token;
      if (_signedIn) await _post(token);
    } catch (e) {
      _log('lỗi đăng ký thông báo đẩy (${e.runtimeType})');
      _setState(PushState.unavailable);
    }
  }

  Future<void> _post(String token) async {
    try {
      await api.post('/devices', {
        'platform': isAndroid ? 'ANDROID' : 'IOS',
        'provider': 'FCM',
        'token': token,
        'appVersion': appVersion,
      });
      _log('đã đăng ký thiết bị');
      _setState(PushState.registered);
    } on ApiException catch (e) {
      _log('máy chủ trả lỗi ${e.status} khi đăng ký thiết bị');
      _setState(e.status == 404 ? PushState.serverUnsupported : PushState.unavailable);
    }
  }

  /// Trước khi đăng xuất: hủy đăng ký mã thiết bị (bỏ qua lỗi; máy chủ cũng xóa thiết bị khi thu hồi phiên).
  Future<void> unregister() async {
    _signedIn = false;
    final token = _token;
    if (token != null && api.hasSession) {
      try {
        await api.post('/devices/unregister', {'token': token});
        _log('đã hủy đăng ký thiết bị');
      } on ApiException catch (e) {
        _log('máy chủ trả lỗi ${e.status} khi hủy đăng ký thiết bị');
      }
    }
    if (_ready) _setState(PushState.idle);
  }

  /// Phiên hết hạn (401): máy chủ đã xóa thiết bị theo phiên; chỉ cần ngừng đăng ký lại khi mã đổi.
  void signedOut() {
    _signedIn = false;
    if (_ready) _setState(PushState.idle);
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _foreground.close();
    pendingOpen.dispose();
    super.dispose();
  }
}
