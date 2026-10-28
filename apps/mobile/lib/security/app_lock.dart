import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:local_auth/local_auth.dart';

import '../services/prefs.dart';

enum DeviceAuthResult { success, failed, notAvailable }

/// Xác thực bằng khóa của máy: sinh trắc (vân tay, khuôn mặt) **hoặc** mã khóa màn hình (không chỉ sinh trắc).
abstract class DeviceAuth {
  /// Máy có đặt khóa màn hình (mã PIN / hình vẽ / mật khẩu) hoặc sinh trắc dùng được.
  Future<bool> isSupported();
  Future<DeviceAuthResult> authenticate(String reason);
}

class LocalDeviceAuth implements DeviceAuth {
  LocalDeviceAuth([LocalAuthentication? auth]) : _auth = auth ?? LocalAuthentication();
  final LocalAuthentication _auth;

  @override
  Future<bool> isSupported() async {
    try {
      return await _auth.isDeviceSupported();
    } catch (_) {
      return false;
    }
  }

  @override
  Future<DeviceAuthResult> authenticate(String reason) async {
    try {
      final ok = await _auth.authenticate(
        localizedReason: reason,
        biometricOnly: false,
        persistAcrossBackgrounding: true,
      );
      return ok ? DeviceAuthResult.success : DeviceAuthResult.failed;
    } on LocalAuthException catch (e) {
      return switch (e.code) {
        LocalAuthExceptionCode.noCredentialsSet ||
        LocalAuthExceptionCode.noBiometricHardware ||
        LocalAuthExceptionCode.noBiometricsEnrolled =>
          DeviceAuthResult.notAvailable,
        _ => DeviceAuthResult.failed,
      };
    } on PlatformException {
      return DeviceAuthResult.failed;
    } on MissingPluginException {
      return DeviceAuthResult.notAvailable;
    }
  }
}

/// Khóa ứng dụng: khi mở ứng dụng (khởi động lạnh) và khi quay lại sau hơn [relockAfter] ở chế độ nền.
///
/// - Mặc định bật nếu máy có khóa màn hình; tắt được ở màn hình Tài khoản (phải xác thực trước khi tắt).
/// - Máy chưa đặt khóa màn hình: không chặn, chỉ báo một lần khuyên đặt khóa màn hình.
/// - Chỉ khóa khi đang có phiên đăng nhập ([isSignedIn]).
/// - Đồng thời chặn nút Quay lại của Android khi đang khóa (đăng ký trước bộ định tuyến nên được hỏi trước).
class AppLock extends ChangeNotifier with WidgetsBindingObserver {
  AppLock({
    required this.deviceAuth,
    required this.prefs,
    required this.isSignedIn,
    DateTime Function()? clock,
  }) : _now = clock ?? DateTime.now;

  static const relockAfter = Duration(minutes: 5);
  static const _kEnabled = 'app_lock_enabled';
  static const _kNoticeShown = 'screen_lock_notice_shown';
  static const reason = 'Mở khóa ứng dụng Giao nhiệm vụ';

  final DeviceAuth deviceAuth;
  final PrefsStore prefs;
  final bool Function() isSignedIn;
  final DateTime Function() _now;

  bool _enabled = true;
  bool _supported = false;
  bool _locked = false;
  bool _authenticating = false;
  bool _noticePending = false;
  DateTime? _backgroundAt;

  /// Người dùng để bật (mặc định bật).
  bool get enabled => _enabled;

  /// Máy có khóa màn hình / sinh trắc.
  bool get supported => _supported;

  /// Khóa đang có hiệu lực.
  bool get active => _enabled && _supported;
  bool get locked => _locked;
  bool get authenticating => _authenticating;

  /// Cần báo (một lần) khuyên đặt khóa màn hình cho máy.
  bool get noticePending => _noticePending;

  String? error;

  /// Thời điểm quá ngưỡng thì khóa lại.
  static bool shouldRelock(DateTime backgroundAt, DateTime now, {Duration after = relockAfter}) =>
      now.difference(backgroundAt) > after;

  /// Mở ứng dụng: đọc cài đặt, kiểm tra máy có khóa màn hình; có phiên đăng nhập thì khóa ngay.
  Future<void> init() async {
    _enabled = (await prefs.read(_kEnabled)) != 'false';
    _supported = await deviceAuth.isSupported();
    _noticePending = !_supported && (await prefs.read(_kNoticeShown)) != 'true';
    if (active && isSignedIn()) _locked = true;
    notifyListeners();
  }

  Future<void> markNoticeShown() async {
    _noticePending = false;
    await prefs.write(_kNoticeShown, 'true');
  }

  void onBackground() {
    if (_authenticating) return; // Hộp xác thực của hệ thống đưa ứng dụng xuống nền tạm thời.
    _backgroundAt ??= _now();
  }

  Future<void> onForeground() async {
    final since = _backgroundAt;
    _backgroundAt = null;
    if (since == null || _authenticating) return;
    // Người dùng có thể vừa đặt / gỡ khóa màn hình trong Cài đặt.
    final wasSupported = _supported;
    _supported = await deviceAuth.isSupported();
    if (_supported && !wasSupported) _noticePending = false;
    if (active && isSignedIn() && shouldRelock(since, _now())) {
      _locked = true;
      error = null;
    }
    notifyListeners();
  }

  /// Hiện hộp xác thực của hệ thống. Trả về true nếu đã mở khóa.
  Future<bool> unlock() async {
    if (!_locked) return true;
    if (_authenticating) return false;
    _authenticating = true;
    error = null;
    notifyListeners();
    try {
      final r = await deviceAuth.authenticate(reason);
      switch (r) {
        case DeviceAuthResult.success:
          _locked = false;
        case DeviceAuthResult.notAvailable:
          // Máy đã gỡ khóa màn hình: không thể xác thực, không chặn người dùng.
          _supported = false;
          _locked = false;
        case DeviceAuthResult.failed:
          error = 'Chưa mở khóa được. Đồng chí thử lại.';
      }
      return !_locked;
    } finally {
      _authenticating = false;
      notifyListeners();
    }
  }

  /// Bật / tắt. Tắt phải xác thực trước. Trả về false nếu không đổi được.
  Future<bool> setEnabled(bool value) async {
    if (value == _enabled) return true;
    if (!value && _supported) {
      _authenticating = true;
      notifyListeners();
      try {
        final r = await deviceAuth.authenticate('Xác thực để tắt khóa ứng dụng');
        if (r == DeviceAuthResult.failed) return false;
      } finally {
        _authenticating = false;
      }
    }
    _enabled = value;
    await prefs.write(_kEnabled, value ? 'true' : 'false');
    notifyListeners();
    return true;
  }

  /// Đăng xuất / hết phiên: bỏ khóa (màn hình đăng nhập không cần khóa).
  void reset() {
    if (!_locked && error == null) return;
    _locked = false;
    error = null;
    notifyListeners();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
        onBackground();
      case AppLifecycleState.resumed:
        unawaited(onForeground());
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
        break;
    }
  }

  /// Đang khóa thì nút Quay lại không được làm gì với các màn hình bên dưới.
  @override
  Future<bool> didPopRoute() async => _locked;
}
