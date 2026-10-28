import 'dart:async';

import 'package:flutter/widgets.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import 'attachments.dart';

/// Báo cho các danh sách tải lại sau khi có thao tác làm thay đổi nhiệm vụ.
class TaskEvents extends ChangeNotifier {
  void changed() => notifyListeners();
}

/// Số thông báo chưa đọc (huy hiệu trên thanh điều hướng), hỏi máy chủ mỗi phút khi đang đăng nhập.
class UnreadCounter extends ChangeNotifier {
  UnreadCounter(this.api);
  final ApiClient api;
  int _count = 0;
  int get count => _count;
  Timer? _timer;

  set count(int v) {
    if (v == _count) return;
    _count = v;
    notifyListeners();
  }

  Future<void> refresh() async {
    if (!api.hasSession) return;
    try {
      final data = await api.get('/notifications/unread-count');
      if (data is Map && data['count'] is num) count = (data['count'] as num).toInt();
    } catch (_) {
      // Lỗi mạng tạm thời: giữ số cũ.
    }
  }

  void start() {
    _timer ??= Timer.periodic(const Duration(seconds: 60), (_) => refresh());
    refresh();
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    count = 0;
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}

class AppServices {
  AppServices({required this.api, required this.auth, required this.files})
      : events = TaskEvents(),
        unread = UnreadCounter(api);

  final ApiClient api;
  final AuthController auth;
  final AttachmentService files;
  final TaskEvents events;
  final UnreadCounter unread;
}

class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.services, required super.child});
  final AppServices services;

  static AppServices of(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope không có trong cây widget');
    return scope!.services;
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) => services != oldWidget.services;
}
