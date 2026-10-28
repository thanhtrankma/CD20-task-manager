import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Nơi giữ mã phiên (giá trị cookie `tm_session`).
abstract class SessionStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

/// Lưu mã phiên trong Keychain (iOS) / Keystore (Android); không đồng bộ iCloud, không chuyển sang máy khác.
class SecureSessionStore implements SessionStore {
  SecureSessionStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
              aOptions: AndroidOptions(),
            );

  static const _key = 'tm_session';
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String token) => _storage.write(key: _key, value: token);

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

/// Dùng cho kiểm thử.
class MemorySessionStore implements SessionStore {
  MemorySessionStore([this.token]);
  String? token;

  @override
  Future<String?> read() async => token;

  @override
  Future<void> write(String value) async => token = value;

  @override
  Future<void> clear() async => token = null;
}
