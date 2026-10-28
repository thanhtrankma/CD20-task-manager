import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../models/models.dart';

enum AuthStatus {
  /// Đang đọc phiên đã lưu, kiểm tra với máy chủ.
  loading,
  loggedOut,
  ready,

  /// Tài khoản phải đổi mật khẩu hoặc bật xác thực hai lớp trên bản web trước.
  setupRequired,

  /// Tài khoản quản trị: ứng dụng chỉ dành cho người giao, nhận nhiệm vụ.
  adminOnly,

  /// Có phiên đã lưu nhưng không kết nối được máy chủ.
  offline,
}

/// Trạng thái đăng nhập của ứng dụng; bộ định tuyến lắng nghe để chuyển màn hình.
class AuthController extends ChangeNotifier {
  AuthController(this.api, {this.onSignedOut}) {
    api.onUnauthorized = _expired;
    api.onSetupRequired = _setupRequired;
  }

  final ApiClient api;

  /// Dọn dữ liệu tạm (tệp đã tải về...) khi đăng xuất hoặc hết phiên.
  final Future<void> Function()? onSignedOut;

  AuthStatus _status = AuthStatus.loading;
  AuthStatus get status => _status;

  Me? _me;
  Me? get me => _me;

  /// Lý do phải thiết lập trên web (đổi mật khẩu / bật xác thực hai lớp).
  String? setupReason;

  /// Thông báo một lần cho màn hình đăng nhập (ví dụ: phiên đã hết hạn).
  String? notice;

  String? offlineMessage;

  void _set(AuthStatus s) {
    _status = s;
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
      } else if (_status != AuthStatus.setupRequired) {
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

  Future<void> logout() async {
    await api.logout();
    await _signedOut();
  }

  void _apply(Me me) {
    _me = me;
    if (me.role == Role.admin) {
      _set(AuthStatus.adminOnly);
    } else if (me.mustChangePassword) {
      setupReason = 'đổi mật khẩu lần đầu';
      _set(AuthStatus.setupRequired);
    } else if (me.twoFactorRequired) {
      setupReason = 'bật xác thực hai lớp';
      _set(AuthStatus.setupRequired);
    } else {
      _set(AuthStatus.ready);
    }
  }

  void _expired() {
    notice = 'Phiên đăng nhập đã hết hạn, đồng chí đăng nhập lại.';
    _signedOut();
  }

  void _setupRequired(String code) {
    setupReason = code == 'TWO_FACTOR_REQUIRED' ? 'bật xác thực hai lớp' : 'đổi mật khẩu lần đầu';
    _set(AuthStatus.setupRequired);
  }

  Future<void> _signedOut() async {
    _me = null;
    _set(AuthStatus.loggedOut);
    try {
      await onSignedOut?.call();
    } catch (_) {}
  }
}
