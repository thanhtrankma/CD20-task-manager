import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import 'app_lock.dart';

/// Phủ màn hình khóa lên toàn bộ ứng dụng khi [AppLock.locked]. Các màn hình bên dưới vẫn giữ trạng thái
/// (ẩn bằng [Offstage]) để mở khóa xong đồng chí làm tiếp đúng chỗ cũ.
class LockGate extends StatelessWidget {
  const LockGate({super.key, required this.lock, required this.auth, required this.child});
  final AppLock lock;
  final AuthController auth;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([lock, auth]),
      builder: (context, _) {
        final show = lock.locked && auth.status != AuthStatus.loggedOut;
        return Stack(fit: StackFit.expand, children: [
          Offstage(offstage: show, child: TickerMode(enabled: !show, child: child)),
          if (show) LockScreen(lock: lock, auth: auth),
        ]);
      },
    );
  }
}

/// Màn hình khóa: logo Nhà trường, nút "Mở khóa" (sinh trắc hoặc mã khóa màn hình), nút đăng xuất.
class LockScreen extends StatefulWidget {
  const LockScreen({super.key, required this.lock, required this.auth});
  final AppLock lock;
  final AuthController auth;

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> {
  bool _confirmLogout = false;
  bool _loggingOut = false;

  @override
  void initState() {
    super.initState();
    // Tự hiện hộp xác thực một lần khi màn hình khóa xuất hiện.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.lock.unlock();
    });
  }

  Future<void> _logout() async {
    if (!_confirmLogout) {
      setState(() => _confirmLogout = true);
      return;
    }
    setState(() => _loggingOut = true);
    await widget.auth.logout();
    widget.lock.reset();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lock = widget.lock;
    return Material(
      color: Colors.white,
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(32),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Image.asset('assets/logo.png', height: 112, semanticLabel: 'Logo Nhà trường'),
              const SizedBox(height: 20),
              Text('Giao nhiệm vụ',
                  style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, color: theme.colorScheme.primary)),
              const SizedBox(height: 8),
              const Text('Ứng dụng đang khóa. Đồng chí xác thực bằng vân tay, khuôn mặt hoặc mã khóa màn hình.',
                  textAlign: TextAlign.center),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: lock.authenticating || _loggingOut ? null : lock.unlock,
                  icon: const Icon(Icons.lock_open),
                  label: const Text('Mở khóa'),
                ),
              ),
              if (lock.error != null) ...[
                const SizedBox(height: 12),
                Text(lock.error!, textAlign: TextAlign.center, style: TextStyle(color: theme.colorScheme.error)),
              ],
              const SizedBox(height: 24),
              TextButton.icon(
                onPressed: _loggingOut ? null : _logout,
                icon: Icon(Icons.logout, color: _confirmLogout ? theme.colorScheme.error : null),
                label: Text(
                  _confirmLogout ? 'Bấm lần nữa để đăng xuất' : 'Đăng xuất',
                  style: TextStyle(color: _confirmLogout ? theme.colorScheme.error : null),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
