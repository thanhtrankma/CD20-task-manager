import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'api/session_store.dart';
import 'app.dart';
import 'auth/auth_controller.dart';
import 'config.dart';
import 'screens/account_screens.dart';
import 'services/app_services.dart';
import 'services/attachments.dart';

void main() {
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
  final auth = AuthController(api, onSignedOut: files.cleanup);
  final services = AppServices(api: api, auth: auth, files: files);

  // Xóa tệp tạm còn sót từ lần chạy trước (không lưu dữ liệu nhiệm vụ lâu dài trên máy).
  files.cleanup();
  runApp(GiaoViecApp(services: services));
  auth.bootstrap();
}
