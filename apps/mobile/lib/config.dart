import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

/// Địa chỉ máy chủ API, truyền khi build: `--dart-define=API_BASE=https://giaoviec.example.vn`.
const String _apiBaseDefine = String.fromEnvironment('API_BASE');

class ConfigError implements Exception {
  ConfigError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Chọn địa chỉ API.
///
/// - Có `API_BASE`: dùng địa chỉ đó (bỏ dấu `/` cuối).
/// - Không có, bản debug: Android giả lập `http://10.0.2.2:3100`, iOS giả lập `http://localhost:3100`.
/// - Bản phát hành (release/profile) bắt buộc `https://`, không có giá trị mặc định.
String resolveApiBase({
  String define = _apiBaseDefine,
  bool isRelease = !kDebugMode,
  bool? isAndroid,
}) {
  var base = define.trim();
  if (base.isEmpty) {
    if (isRelease) {
      throw ConfigError('Chưa cấu hình địa chỉ máy chủ (API_BASE) cho bản phát hành.');
    }
    final android = isAndroid ?? Platform.isAndroid;
    base = android ? 'http://10.0.2.2:3100' : 'http://localhost:3100';
  }
  while (base.endsWith('/')) {
    base = base.substring(0, base.length - 1);
  }
  final uri = Uri.tryParse(base);
  if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
    throw ConfigError('Địa chỉ máy chủ không hợp lệ: $base');
  }
  if (isRelease && uri.scheme != 'https') {
    throw ConfigError('Bản phát hành chỉ kết nối máy chủ qua https://');
  }
  return base;
}
