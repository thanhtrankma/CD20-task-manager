import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../theme.dart';
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
        return Stack(
          fit: StackFit.expand,
          children: [
            Offstage(
              offstage: show,
              child: TickerMode(enabled: !show, child: child),
            ),
            if (show) LockScreen(lock: lock, auth: auth),
          ],
        );
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
    final lock = widget.lock;
    const errorColor = Color(0xFFFFD7D7);
    return Material(
      child: HeaderBackground(
        starSize: 320,
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(32),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 400),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const LogoBadge(size: 112),
                    const SizedBox(height: 22),
                    const OrgLine(),
                    const SizedBox(height: 10),
                    const Text(
                      'Giao nhiệm vụ',
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.lock_outline, color: Palette.goldLight, size: 18),
                        const SizedBox(width: 6),
                        Text(
                          'Ứng dụng đang khóa',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Đồng chí xác thực bằng vân tay, khuôn mặt hoặc mã khóa màn hình.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.78), fontSize: 13),
                    ),
                    const SizedBox(height: 28),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: lock.authenticating || _loggingOut ? null : lock.unlock,
                        style: FilledButton.styleFrom(
                          backgroundColor: Palette.goldLight,
                          foregroundColor: Palette.red900,
                          disabledBackgroundColor: Palette.goldLight.withValues(alpha: 0.5),
                          minimumSize: const Size.fromHeight(50),
                        ),
                        icon: const Icon(Icons.fingerprint),
                        label: const Text('Mở khóa'),
                      ),
                    ),
                    if (lock.error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        lock.error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: errorColor),
                      ),
                    ],
                    const SizedBox(height: 20),
                    TextButton.icon(
                      onPressed: _loggingOut ? null : _logout,
                      style: TextButton.styleFrom(foregroundColor: _confirmLogout ? errorColor : Colors.white70),
                      icon: const Icon(Icons.logout, size: 18),
                      label: Text(_confirmLogout ? 'Bấm lần nữa để đăng xuất' : 'Đăng xuất'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
