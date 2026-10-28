import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Lưu vài cài đặt nhỏ của ứng dụng (khóa ứng dụng bật/tắt, đã báo chưa đặt khóa màn hình...).
/// Dùng chung Keychain / Keystore với mã phiên để không phải thêm gói lưu trữ khác.
abstract class PrefsStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class SecurePrefsStore implements PrefsStore {
  SecurePrefsStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
              aOptions: AndroidOptions(),
            );

  final FlutterSecureStorage _storage;
  static const _prefix = 'pref_';

  @override
  Future<String?> read(String key) async {
    try {
      return await _storage.read(key: '$_prefix$key');
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String key, String value) async {
    try {
      await _storage.write(key: '$_prefix$key', value: value);
    } catch (_) {}
  }
}

/// Dùng cho kiểm thử.
class MemoryPrefsStore implements PrefsStore {
  final values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;
}
