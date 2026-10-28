import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'api/session_store.dart';
import 'app.dart';
import 'auth/auth_controller.dart';
import 'config.dart';
import 'push/messaging.dart';
import 'push/push_config.dart';
import 'push/push_service.dart';
import 'screens/account_screens.dart';
import 'security/app_lock.dart';
import 'services/app_services.dart';
import 'services/attachments.dart';
import 'services/prefs.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final String base;
  try {
    base = resolveApiBase();
  } on ConfigError catch (e) {
    runApp(ConfigErrorApp(e.message));
    return;
  }

  final api = ApiClient(baseUrl: base, store: SecureSessionStore());
  final files = AttachmentService(api);
  final push = PushService(
    api: api,
    messaging: FirebaseMessagingLayer(),
    config: PushConfig.fromEnvironment(),
    isAndroid: Platform.isAndroid,
  );
  final auth = AuthController(api, onSignedOut: files.cleanup, beforeLogout: push.unregister);
  final lock = AppLock(deviceAuth: LocalDeviceAuth(), prefs: SecurePrefsStore(), isSignedIn: () => api.hasSession);
  final services = AppServices(api: api, auth: auth, files: files, lock: lock, push: push);

  // Đăng ký trước bộ định tuyến để chặn nút Quay lại khi đang khóa; theo dõi thời gian ở chế độ nền.
  WidgetsBinding.instance.addObserver(lock);

  // Xóa tệp tạm còn sót từ lần chạy trước (không lưu dữ liệu nhiệm vụ lâu dài trên máy).
  files.cleanup();
  // Đọc phiên đã lưu trước khi quyết định khóa ứng dụng (khởi động lạnh có phiên thì khóa).
  await api.restore();
  await lock.init();
  runApp(GiaoViecApp(services: services));
  unawaited(push.start());
  unawaited(auth.bootstrap());
}
