import 'dart:typed_data';

import '../api/api_client.dart';

/// Ảnh đại diện tải qua [ApiClient] (cần cookie phiên), giữ **trong bộ nhớ** theo địa chỉ.
/// `avatarUrl` của máy chủ có `?v=<phiên bản>` nên đổi ảnh là đổi địa chỉ, giữ theo địa chỉ là an toàn.
/// Không ghi ra đĩa; xóa khi đăng xuất / hết phiên.
class AvatarCache {
  AvatarCache(this.api, {this.capacity = 200});
  final ApiClient api;
  final int capacity;

  // Map mặc định của Dart (LinkedHashMap) giữ thứ tự dùng gần nhất (bỏ ảnh cũ nhất khi đầy).
  // Giá trị null: tải lỗi, không thử lại.
  final _bytes = <String, Uint8List?>{};
  final _pending = <String, Future<Uint8List?>>{};
  int _generation = 0;

  /// Đã có trong bộ nhớ (kể cả đã thử và lỗi).
  bool contains(String url) => _bytes.containsKey(url);

  /// Ảnh đã tải (null nếu chưa có hoặc tải lỗi).
  Uint8List? peek(String url) {
    final v = _bytes.remove(url);
    if (v != null) _bytes[url] = v;
    return v;
  }

  /// Tải ảnh (gộp các lần gọi cùng lúc). Lỗi trả về null, không ném.
  Future<Uint8List?> load(String url) {
    if (_bytes.containsKey(url)) return Future.value(peek(url));
    return _pending[url] ??= _fetch(url);
  }

  Future<Uint8List?> _fetch(String url) async {
    final gen = _generation;
    Uint8List? result;
    try {
      result = await api.downloadServerPath(url);
      if (result.isEmpty) result = null;
    } on ApiException catch (e) {
      // Lỗi mạng: không ghi nhớ để lần sau thử lại; lỗi khác (404...): nhớ là không có ảnh.
      if (e.status == 0) {
        _pending.remove(url);
        return null;
      }
    } catch (_) {}
    if (gen != _generation) return null;
    _pending.remove(url);
    _bytes[url] = result;
    while (_bytes.length > capacity) {
      _bytes.remove(_bytes.keys.first);
    }
    return result;
  }

  /// Đăng xuất / hết phiên.
  void clear() {
    _generation++;
    _bytes.clear();
    _pending.clear();
  }
}
