import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../constants.dart';
import '../push/push_service.dart';
import '../security/app_lock.dart';
import '../services/app_services.dart';

Future<void> confirmLogout(BuildContext context) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Đăng xuất?'),
      content: const Text('Đồng chí sẽ cần đăng nhập lại để sử dụng ứng dụng.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Đăng xuất')),
      ],
    ),
  );
  if (ok == true && context.mounted) await AppScope.of(context).auth.logout();
}

/// Tài khoản: họ tên, đơn vị, vai trò, đăng xuất.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final me = AppScope.of(context).auth.me;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Tài khoản')),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 16),
        children: [
          Center(
            child: CircleAvatar(
              radius: 36,
              backgroundColor: theme.colorScheme.primaryContainer,
              child: Text(
                _initials(me?.fullName ?? ''),
                style: TextStyle(fontSize: 26, color: theme.colorScheme.onPrimaryContainer, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(me?.fullName ?? '',
              textAlign: TextAlign.center, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          ListTile(leading: const Icon(Icons.badge_outlined), title: const Text('Tên đăng nhập'), subtitle: Text(me?.username ?? '')),
          ListTile(leading: const Icon(Icons.apartment), title: const Text('Đơn vị'), subtitle: Text(me?.unitName ?? '')),
          ListTile(
            leading: const Icon(Icons.military_tech_outlined),
            title: const Text('Vai trò'),
            subtitle: Text(me == null ? '' : roleLabel[me.role]!),
          ),
          if (me?.email != null)
            ListTile(leading: const Icon(Icons.mail_outline), title: const Text('Thư nhắc việc'), subtitle: Text(me!.email!)),
          const Divider(),
          const _SecuritySection(),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Text(
              'Đổi mật khẩu, xác thực hai lớp, thư nhắc việc: đồng chí thực hiện trên trang web của hệ thống.',
              style: TextStyle(fontSize: 13),
            ),
          ),
          const Divider(),
          ListTile(
            leading: Icon(Icons.logout, color: theme.colorScheme.error),
            title: Text('Đăng xuất', style: TextStyle(color: theme.colorScheme.error)),
            onTap: () => confirmLogout(context),
          ),
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text(securityNotice, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Color(0xFF9A3412))),
          ),
        ],
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return parts.last.characters.first.toUpperCase();
  }
}

/// Khóa ứng dụng và thông báo trên điện thoại này.
class _SecuritySection extends StatefulWidget {
  const _SecuritySection();

  @override
  State<_SecuritySection> createState() => _SecuritySectionState();
}

class _SecuritySectionState extends State<_SecuritySection> {
  /// `mobile` trong GET /notifications/settings (null nếu máy chủ chưa có).
  ({bool enabled, int devices})? _server;
  bool _init = false;
  late PushService _push;
  PushState? _lastPush;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _push = AppScope.of(context).push;
    _lastPush = _push.state;
    _push.addListener(_onPush);
    _loadServer();
  }

  /// Vừa đăng ký xong thiết bị: tải lại số thiết bị trên máy chủ.
  void _onPush() {
    if (_push.state == PushState.registered && _lastPush != PushState.registered) _loadServer();
    _lastPush = _push.state;
  }

  @override
  void dispose() {
    _push.removeListener(_onPush);
    super.dispose();
  }

  Future<void> _loadServer() async {
    try {
      final data = await AppScope.of(context).api.get('/notifications/settings');
      final m = data is Map ? data['mobile'] : null;
      if (m is Map && mounted) {
        setState(() => _server = (
              enabled: m['enabled'] == true,
              devices: m['devices'] is num ? (m['devices'] as num).toInt() : 0,
            ));
      }
    } catch (_) {
      // Không hiện thông tin máy chủ nếu lỗi.
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return ListenableBuilder(
      listenable: Listenable.merge([app.lock, app.push]),
      builder: (context, _) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _lockTile(context, app.lock),
        _pushTile(context, app.push),
      ]),
    );
  }

  Widget _lockTile(BuildContext context, AppLock lock) {
    return SwitchListTile(
      secondary: const Icon(Icons.fingerprint),
      title: const Text('Khóa ứng dụng'),
      subtitle: Text(lock.supported
          ? 'Mở ứng dụng hoặc quay lại sau ${AppLock.relockAfter.inMinutes} phút phải xác thực bằng vân tay, '
              'khuôn mặt hoặc mã khóa màn hình'
          : 'Điện thoại chưa đặt khóa màn hình. Đồng chí đặt mã khóa màn hình trong Cài đặt để dùng chức năng này.'),
      isThreeLine: true,
      value: lock.supported && lock.enabled,
      onChanged: !lock.supported || lock.authenticating
          ? null
          : (v) async {
              final ok = await lock.setEnabled(v);
              if (!ok && context.mounted) {
                ScaffoldMessenger.of(context)
                  ..hideCurrentSnackBar()
                  ..showSnackBar(const SnackBar(content: Text('Chưa xác thực, khóa ứng dụng vẫn bật')));
              }
            },
    );
  }

  Widget _pushTile(BuildContext context, PushService push) {
    final (icon, text) = switch (push.state) {
      PushState.notConfigured => (
          Icons.notifications_off_outlined,
          'Thông báo trên điện thoại này chưa được cấu hình (bản cài đặt chưa có cấu hình Firebase). '
              'Đồng chí xem thông báo trong mục Thông báo.',
        ),
      PushState.idle => (Icons.notifications_none, 'Đang đăng ký nhận thông báo...'),
      PushState.permissionDenied => (
          Icons.notifications_off_outlined,
          'Đồng chí chưa cho phép ứng dụng hiện thông báo. Bật trong Cài đặt của điện thoại.',
        ),
      PushState.registered => (Icons.notifications_active_outlined, 'Điện thoại này đã đăng ký nhận thông báo nhắc việc.'),
      PushState.serverUnsupported => (
          Icons.notifications_off_outlined,
          'Máy chủ chưa hỗ trợ thông báo tới điện thoại.',
        ),
      PushState.unavailable => (
          Icons.notifications_off_outlined,
          'Chưa đăng ký được thông báo trên điện thoại này. Đồng chí mở lại ứng dụng sau.',
        ),
    };
    final server = _server;
    final serverText = server == null
        ? null
        : server.enabled
            ? 'Máy chủ đã bật gửi thông báo tới điện thoại · ${server.devices} thiết bị đã đăng ký'
            : 'Máy chủ chưa bật gửi thông báo tới điện thoại · ${server.devices} thiết bị đã đăng ký';
    return ListTile(
      leading: Icon(icon),
      title: const Text('Thông báo trên điện thoại'),
      subtitle: Text([text, ?serverText].join('\n')),
      isThreeLine: true,
    );
  }
}

/// Màn hình chặn: tài khoản phải thiết lập trên web trước, tài khoản quản trị, hoặc mất kết nối.
class BlockedScreen extends StatelessWidget {
  const BlockedScreen({super.key, required this.status});
  final AuthStatus status;

  @override
  Widget build(BuildContext context) {
    final auth = AppScope.of(context).auth;
    final (icon, title, text) = switch (status) {
      AuthStatus.adminOnly => (
          Icons.admin_panel_settings_outlined,
          'Ứng dụng dành cho người giao, nhận nhiệm vụ',
          'Tài khoản quản trị hệ thống không dùng trên ứng dụng di động. '
              'Đồng chí quản trị hệ thống trên trang web.',
        ),
      AuthStatus.offline => (
          Icons.cloud_off,
          'Không kết nối được máy chủ',
          auth.offlineMessage ?? 'Đồng chí kiểm tra kết nối mạng rồi thử lại.',
        ),
      _ => (
          Icons.manage_accounts_outlined,
          'Cần hoàn tất thiết lập tài khoản',
          'Tài khoản của đồng chí cần ${auth.setupReason ?? 'hoàn tất thiết lập'} trước khi sử dụng. '
              'Đồng chí đăng nhập trang web của hệ thống trên máy tính để thực hiện, sau đó quay lại ứng dụng.',
        ),
    };
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(icon, size: 64, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 16),
              Text(title,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Text(text, textAlign: TextAlign.center),
              const SizedBox(height: 24),
              if (status != AuthStatus.adminOnly)
                FilledButton.icon(
                  onPressed: auth.refreshMe,
                  icon: const Icon(Icons.refresh),
                  label: Text(status == AuthStatus.offline ? 'Thử lại' : 'Tôi đã thiết lập xong'),
                ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => auth.logout(),
                icon: const Icon(Icons.logout),
                label: const Text('Đăng xuất'),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Image.asset('assets/logo.png', height: 96),
          const SizedBox(height: 24),
          const CircularProgressIndicator(),
        ]),
      ),
    );
  }
}

/// Lỗi cấu hình (ví dụ bản phát hành thiếu API_BASE https): không chạy tiếp.
class ConfigErrorApp extends StatelessWidget {
  const ConfigErrorApp(this.message, {super.key});
  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(message, textAlign: TextAlign.center),
          ),
        ),
      ),
    );
  }
}
