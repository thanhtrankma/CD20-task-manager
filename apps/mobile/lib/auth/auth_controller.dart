import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../models/models.dart';

enum AuthStatus {
  /// Đang đọc phiên đã lưu, kiểm tra với máy chủ.
  loading,
  loggedOut,
  ready,

  /// Đăng nhập lần đầu (hoặc quản trị đặt lại mật khẩu): phải đổi mật khẩu trước khi sử dụng.
  mustChangePassword,

  /// Vai trò bắt buộc xác thực hai lớp nhưng tài khoản chưa bật: phải bật trước khi sử dụng.
  twoFactorSetup,

  /// Tài khoản quản trị: ứng dụng chỉ dành cho người giao, nhận nhiệm vụ.
  adminOnly,

  /// Có phiên đã lưu nhưng không kết nối được máy chủ.
  offline,
}

extension AuthStatusX on AuthStatus {
  /// Đang ở bước bắt buộc hoàn tất thiết lập tài khoản.
  bool get isSetup => this == AuthStatus.mustChangePassword || this == AuthStatus.twoFactorSetup;
}

/// Kết quả POST /auth/2fa/setup. Chứa khóa bí mật: chỉ giữ trong bộ nhớ, không ghi nhật ký.
class TwoFactorSetup {
  const TwoFactorSetup({required this.otpauthUrl, required this.qrDataUrl});
  final String otpauthUrl;
  final String qrDataUrl;

  factory TwoFactorSetup.fromJson(Map<String, dynamic> j) => TwoFactorSetup(
        otpauthUrl: j['otpauthUrl'] is String ? j['otpauthUrl'] as String : '',
        qrDataUrl: j['qrDataUrl'] is String ? j['qrDataUrl'] as String : '',
      );

  @override
  String toString() => 'TwoFactorSetup(***)';
}

/// Trạng thái đăng nhập của ứng dụng; bộ định tuyến lắng nghe để chuyển màn hình.
class AuthController extends ChangeNotifier {
  AuthController(this.api, {this.onSignedOut, this.beforeLogout}) {
    api.onUnauthorized = _expired;
    api.onSetupRequired = _setupRequired;
  }

  final ApiClient api;

  /// Dọn dữ liệu tạm (tệp đã tải về...) khi đăng xuất hoặc hết phiên.
  final Future<void> Function()? onSignedOut;

  /// Chạy trước `POST /auth/logout` khi phiên còn hiệu lực (hủy đăng ký thông báo đẩy).
  Future<void> Function()? beforeLogout;

  AuthStatus _status = AuthStatus.loading;
  AuthStatus get status => _status;

  /// Chỉ báo khi trạng thái đổi. Bộ định tuyến nghe cái này (không nghe cả [AuthController]) để việc tải lại
  /// thông tin người dùng (sau khi đổi mật khẩu, bật 2 lớp) không làm bộ định tuyến dựng lại các màn hình đang mở.
  late final ValueNotifier<AuthStatus> statusListenable = ValueNotifier(_status);

  Me? _me;
  Me? get me => _me;

  /// Thông báo một lần cho màn hình đăng nhập (ví dụ: phiên đã hết hạn).
  String? notice;

  String? offlineMessage;

  void _set(AuthStatus s) {
    _status = s;
    statusListenable.value = s;
    notifyListeners();
  }

  /// Mở ứng dụng: đọc phiên trong kho bảo mật, có thì hỏi máy chủ thông tin người dùng.
  Future<void> bootstrap() async {
    await api.restore();
    if (!api.hasSession) {
      _set(AuthStatus.loggedOut);
      return;
    }
    await refreshMe();
  }

  Future<void> refreshMe() async {
    try {
      final data = await api.get('/auth/me');
      _apply(Me.fromJson((data as Map).cast<String, dynamic>()));
    } on ApiException catch (e) {
      if (e.status == 401) {
        _me = null;
        _set(AuthStatus.loggedOut);
      } else if (e.status == 0) {
        offlineMessage = e.message;
        _set(AuthStatus.offline);
      } else if (!_status.isSetup) {
        offlineMessage = e.message;
        _set(AuthStatus.offline);
      }
    }
  }

  /// Đăng nhập. Ném [ApiException]; `isOtpRequired` khi cần nhập mã xác thực hai lớp.
  Future<void> login(String username, String password, {String? otp}) async {
    notice = null;
    await api.login(username, password, otp: otp);
    await refreshMe();
  }

  /// POST /auth/change-password (máy chủ giữ phiên này, thu hồi các phiên khác) rồi tải lại thông tin.
  /// Ném [ApiException] (ví dụ 400 "Mật khẩu hiện tại không đúng").
  Future<void> changePassword(String currentPassword, String newPassword) async {
    await api.post('/auth/change-password', {'currentPassword': currentPassword, 'newPassword': newPassword});
    await refreshMe();
  }

  /// Bước 1 bật xác thực hai lớp: máy chủ tạo khóa bí mật (chưa kích hoạt).
  Future<TwoFactorSetup> startTwoFactorSetup() async {
    final data = await api.post('/auth/2fa/setup');
    return TwoFactorSetup.fromJson(data is Map ? data.cast<String, dynamic>() : const {});
  }

  /// Bước 2: nhập đúng mã 6 số thì máy chủ kích hoạt.
  Future<void> enableTwoFactor(String code) async {
    await api.post('/auth/2fa/enable', {'code': code});
    await refreshMe();
  }

  /// Tắt xác thực hai lớp (chỉ khi vai trò không bắt buộc): cần mật khẩu và mã hiện tại.
  Future<void> disableTwoFactor(String password, String code) async {
    await api.post('/auth/2fa/disable', {'password': password, 'code': code});
    await refreshMe();
  }

  Future<void> logout() async {
    try {
      await beforeLogout?.call();
    } catch (_) {}
    await api.logout();
    await _signedOut();
  }

  void _apply(Me me) {
    _me = me;
    if (me.role == Role.admin) {
      _set(AuthStatus.adminOnly);
    } else if (me.mustChangePassword) {
      _set(AuthStatus.mustChangePassword);
    } else if (me.twoFactorRequired) {
      _set(AuthStatus.twoFactorSetup);
    } else {
      _set(AuthStatus.ready);
    }
  }

  void _expired() {
    notice = 'Phiên đăng nhập đã hết hạn, đồng chí đăng nhập lại.';
    _signedOut();
  }

  /// Máy chủ trả 403 PASSWORD_CHANGE_REQUIRED / TWO_FACTOR_REQUIRED với một yêu cầu bất kỳ.
  void _setupRequired(String code) {
    final next = code == 'TWO_FACTOR_REQUIRED' ? AuthStatus.twoFactorSetup : AuthStatus.mustChangePassword;
    if (_status != next) _set(next);
  }

  Future<void> _signedOut() async {
    _me = null;
    _set(AuthStatus.loggedOut);
    try {
      await onSignedOut?.call();
    } catch (_) {}
  }
}
