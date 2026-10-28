import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../constants.dart';
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
