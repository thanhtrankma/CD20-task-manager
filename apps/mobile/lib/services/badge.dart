import 'dart:io' show Platform;

import 'package:flutter/services.dart';

/// Số trên biểu tượng ứng dụng (chỉ iOS; Android tự hiện chấm theo thông báo chưa xóa).
/// Kênh gốc khai báo trong `ios/Runner/AppDelegate.swift`.
class AppBadge {
  static const _channel = MethodChannel('vn.cdn20.giaoviec/app');
  static int? _last;

  static Future<void> set(int count) async {
    if (!Platform.isIOS || count == _last) return;
    _last = count;
    try {
      await _channel.invokeMethod<void>('setBadge', count);
    } catch (_) {
      // Chưa có quyền hiện số trên biểu tượng hoặc bản build cũ: bỏ qua.
    }
  }
}
