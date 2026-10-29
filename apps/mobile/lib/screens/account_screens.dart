import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import '../constants.dart';
import '../models/models.dart';
import '../push/push_service.dart';
import '../security/app_lock.dart';
import '../services/app_services.dart';
import '../theme.dart';
import '../widgets/avatar.dart';
import '../widgets/common.dart';
import 'security_screens.dart';

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

/// Tài khoản: họ tên, đơn vị, vai trò, đổi mật khẩu, xác thực hai lớp, khóa ứng dụng, đăng xuất.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = AppScope.of(context).auth;
    // Tải lại /auth/me (sau khi bật / tắt xác thực hai lớp) thì vẽ lại.
    return ListenableBuilder(listenable: auth, builder: (context, _) => _build(context, auth));
  }

  Widget _build(BuildContext context, AuthController auth) {
    final me = auth.me;
    final theme = Theme.of(context);
    final topPad = MediaQuery.paddingOf(context).top;
    final position = me?.position?.trim() ?? '';
    return Scaffold(
      // Dải đỏ cố định dưới thanh trạng thái: cuộn xuống chữ giờ, pin vẫn đọc được.
      body: Column(
        children: [
          Container(height: topPad, color: Palette.red900),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.only(bottom: 16),
              children: [
                // Đầu trang: ảnh đại diện viền vàng, cấp bậc họ tên, chức vụ, đơn vị, vai trò.
                SizedBox(
                  height: 196,
                  child: HeaderBackground(
                    starSize: 200,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Tài khoản',
                                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white),
                                ),
                              ),
                              if (me != null)
                                TextButton.icon(
                                  key: const Key('change-avatar'),
                                  style: TextButton.styleFrom(
                                    foregroundColor: Palette.goldLight,
                                    visualDensity: VisualDensity.compact,
                                  ),
                                  onPressed: () => changeAvatar(context),
                                  icon: const Icon(Icons.photo_camera_outlined, size: 18),
                                  label: const Text('Đổi ảnh đại diện'),
                                ),
                            ],
                          ),
                          const Spacer(),
                          Row(
                            children: [
                              _HeaderAvatar(me: me),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      me?.rankName ?? '',
                                      style: const TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w800,
                                        color: Colors.white,
                                      ),
                                    ),
                                    if (position.isNotEmpty)
                                      Text(position, style: TextStyle(color: Colors.white.withValues(alpha: 0.85))),
                                    Text(
                                      me?.unitName ?? '',
                                      style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 13),
                                    ),
                                    const SizedBox(height: 6),
                                    if (me != null)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: Palette.goldLight,
                                          borderRadius: BorderRadius.circular(999),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Star(size: 10, color: Palette.red800),
                                            const SizedBox(width: 4),
                                            Text(
                                              roleLabel[me.role]!,
                                              style: const TextStyle(
                                                color: Palette.red900,
                                                fontSize: 12,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                ListTile(
                  leading: const Icon(Icons.badge_outlined),
                  title: const Text('Tên đăng nhập'),
                  subtitle: Text(me?.username ?? ''),
                ),
                ListTile(
                  leading: const Icon(Icons.apartment),
                  title: const Text('Đơn vị'),
                  subtitle: Text(me?.unitName ?? ''),
                ),
                ListTile(
                  leading: const Icon(Icons.military_tech_outlined),
                  title: const Text('Vai trò'),
                  subtitle: Text(me == null ? '' : roleLabel[me.role]!),
                ),
                if (me?.email != null)
                  ListTile(
                    leading: const Icon(Icons.mail_outline),
                    title: const Text('Thư nhắc việc'),
                    subtitle: Text(me!.email!),
                  ),
                const Divider(),
                const _SectionLabel('Bảo mật tài khoản'),
                ListTile(
                  key: const Key('change-password'),
                  leading: const Icon(Icons.password),
                  title: const Text('Đổi mật khẩu'),
                  subtitle: const Text('Ít nhất 10 ký tự, gồm cả chữ và số'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/security/password'),
                ),
                if (me != null) _TwoFactorTile(me: me),
                const Divider(),
                const _SectionLabel('Điện thoại này'),
                const _SecuritySection(),
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Text(
                    'Thư nhắc việc: đồng chí đăng ký, thay đổi trên trang web của hệ thống.',
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
                  child: Text(
                    securityNotice,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: Color(0xFF9A3412)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Ảnh đại diện trên đầu trang (viền vàng, nút máy ảnh nhỏ), bấm để đổi.
class _HeaderAvatar extends StatelessWidget {
  const _HeaderAvatar({required this.me});
  final Me? me;

  @override
  Widget build(BuildContext context) {
    final me = this.me;
    return GestureDetector(
      onTap: me == null ? null : () => changeAvatar(context),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          UserAvatar(
            key: const Key('account-avatar'),
            name: me?.fullName ?? '',
            url: me?.avatarUrl,
            size: 68,
            borderColor: Palette.goldLight,
            borderWidth: 2.5,
          ),
          if (me != null)
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: Palette.goldLight,
                  shape: BoxShape.circle,
                  border: Border.all(color: Palette.red900, width: 1.5),
                ),
                child: const Icon(Icons.photo_camera, size: 14, color: Palette.red900),
              ),
            ),
        ],
      ),
    );
  }
}

/// Đổi ảnh đại diện: Chụp ảnh / Chọn từ thư viện / Xóa ảnh (nếu đang có). Xong thì tải lại `/auth/me`.
Future<void> changeAvatar(BuildContext context) async {
  final app = AppScope.of(context);
  final hasAvatar = app.auth.me?.avatarUrl != null;
  final choice = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (ctx) => SafeArea(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text('Ảnh đại diện', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Chụp ảnh'),
              onTap: () => Navigator.pop(ctx, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Chọn từ thư viện'),
              onTap: () => Navigator.pop(ctx, 'gallery'),
            ),
            if (hasAvatar)
              ListTile(
                leading: Icon(Icons.delete_outline, color: Theme.of(ctx).colorScheme.error),
                title: Text('Xóa ảnh', style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
                onTap: () => Navigator.pop(ctx, 'delete'),
              ),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Text(
                'Ảnh JPEG hoặc PNG, tối đa 2 MB; ứng dụng tự thu nhỏ. Ảnh chỉ người đã đăng nhập hệ thống xem được.',
                style: TextStyle(fontSize: 12, color: Palette.muted),
              ),
            ),
          ],
        ),
      ),
    ),
  );
  if (choice == null || !context.mounted) return;
  try {
    if (choice == 'delete') {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Xóa ảnh đại diện?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Xóa ảnh')),
          ],
        ),
      );
      if (ok != true || !context.mounted) return;
      await _withProgress(context, 'Đang xóa ảnh...', () async {
        await app.files.deleteAvatar();
        await app.auth.refreshMe();
      });
      if (context.mounted) showMessage(context, 'Đã xóa ảnh đại diện');
      return;
    }
    final picked = await app.files.pickAvatar(camera: choice == 'camera');
    if (picked == null || !context.mounted) return;
    await _withProgress(context, 'Đang tải ảnh lên...', () async {
      await app.files.uploadAvatar(picked);
      await app.auth.refreshMe();
    });
    if (context.mounted) showMessage(context, 'Đã đổi ảnh đại diện');
  } on ApiException catch (e) {
    if (context.mounted) showError(context, e);
  }
}

/// Chạy [task] với hộp "đang xử lý" chặn thao tác khác; đóng hộp khi xong (kể cả khi lỗi).
Future<T> _withProgress<T>(BuildContext context, String text, Future<T> Function() task) async {
  final nav = Navigator.of(context, rootNavigator: true);
  unawaited(
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      useRootNavigator: true,
      builder: (_) => PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(
            children: [
              const SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 2.5)),
              const SizedBox(width: 16),
              Expanded(child: Text(text)),
            ],
          ),
        ),
      ),
    ),
  );
  try {
    return await task();
  } finally {
    if (nav.mounted) nav.pop();
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 2),
      child: Row(
        children: [
          const Star(size: 11, color: Palette.red700),
          const SizedBox(width: 6),
          Text(
            text.toUpperCase(),
            style: const TextStyle(
              color: Palette.red800,
              fontSize: 12,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
            ),
          ),
        ],
      ),
    );
  }
}

/// Trạng thái xác thực hai lớp: chưa bật → nút bật; đang bật, không bắt buộc → nút tắt;
/// đang bật, vai trò bắt buộc → giải thích, mất điện thoại thì báo quản trị đặt lại.
class _TwoFactorTile extends StatelessWidget {
  const _TwoFactorTile({required this.me});
  final Me me;

  Future<void> _disable(BuildContext context) async {
    final ok = await showDisableTwoFactorDialog(context);
    if (ok && context.mounted) showMessage(context, 'Đã tắt xác thực hai lớp');
  }

  @override
  Widget build(BuildContext context) {
    if (!me.totpEnabled) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ListTile(
            key: Key('2fa-off'),
            leading: Icon(Icons.shield_outlined),
            title: Text('Xác thực hai lớp: chưa bật'),
            subtitle: Text(
              'Khi bật, mỗi lần đăng nhập đồng chí nhập thêm mã 6 chữ số từ ứng dụng xác thực '
              '(Google Authenticator, Microsoft Authenticator). Kẻ gian biết mật khẩu cũng không đăng nhập được.',
            ),
            isThreeLine: true,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(72, 0, 16, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.tonalIcon(
                onPressed: () => context.push('/security/2fa'),
                icon: const Icon(Icons.verified_user_outlined, size: 18),
                label: const Text('Bật xác thực hai lớp'),
              ),
            ),
          ),
        ],
      );
    }
    if (me.twoFactorMandatory) {
      return ListTile(
        key: const Key('2fa-mandatory'),
        leading: const Icon(Icons.verified_user, color: Palette.olive),
        title: const Text('Xác thực hai lớp: đang bật (bắt buộc)'),
        subtitle: Text(
          'Vai trò ${roleLabel[me.role]} bắt buộc dùng xác thực hai lớp, không tắt được. '
          'Mất điện thoại hoặc xóa ứng dụng xác thực: đồng chí báo quản trị hệ thống đặt lại.',
        ),
        isThreeLine: true,
      );
    }
    return ListTile(
      key: const Key('2fa-on'),
      leading: const Icon(Icons.verified_user, color: Palette.olive),
      title: const Text('Xác thực hai lớp: đang bật'),
      subtitle: const Text('Mỗi lần đăng nhập cần mã 6 chữ số từ ứng dụng xác thực.'),
      isThreeLine: true,
      trailing: OutlinedButton(onPressed: () => _disable(context), child: const Text('Tắt')),
    );
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
        setState(
          () => _server = (
            enabled: m['enabled'] == true,
            devices: m['devices'] is num ? (m['devices'] as num).toInt() : 0,
          ),
        );
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
      builder: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [_lockTile(context, app.lock), _pushTile(context, app.push)],
      ),
    );
  }

  Widget _lockTile(BuildContext context, AppLock lock) {
    return SwitchListTile(
      secondary: const Icon(Icons.fingerprint),
      title: const Text('Khóa ứng dụng'),
      subtitle: Text(
        lock.supported
            ? 'Mở ứng dụng hoặc quay lại sau ${AppLock.relockAfter.inMinutes} phút phải xác thực bằng vân tay, '
                  'khuôn mặt hoặc mã khóa màn hình'
            : 'Điện thoại chưa đặt khóa màn hình. Đồng chí đặt mã khóa màn hình trong Cài đặt để dùng chức năng này.',
      ),
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
      PushState.registered => (
        Icons.notifications_active_outlined,
        'Điện thoại này đã đăng ký nhận thông báo nhắc việc.',
      ),
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

/// Màn hình chặn: tài khoản quản trị, hoặc có phiên nhưng mất kết nối máy chủ.
class BlockedScreen extends StatelessWidget {
  const BlockedScreen({super.key, required this.status});
  final AuthStatus status;

  @override
  Widget build(BuildContext context) {
    final auth = AppScope.of(context).auth;
    final (icon, title, text) = status == AuthStatus.adminOnly
        ? (
            Icons.admin_panel_settings_outlined,
            'Ứng dụng dành cho người giao, nhận nhiệm vụ',
            'Tài khoản quản trị hệ thống không dùng trên ứng dụng di động. '
                'Đồng chí quản trị hệ thống trên trang web.',
          )
        : (
            Icons.cloud_off,
            'Không kết nối được máy chủ',
            auth.offlineMessage ?? 'Đồng chí kiểm tra kết nối mạng rồi thử lại.',
          );
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 64, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 16),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                Text(text, textAlign: TextAlign.center),
                const SizedBox(height: 24),
                if (status != AuthStatus.adminOnly)
                  FilledButton.icon(
                    onPressed: auth.refreshMe,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Thử lại'),
                  ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () => auth.logout(),
                  icon: const Icon(Icons.logout),
                  label: const Text('Đăng xuất'),
                ),
              ],
            ),
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/logo.png', height: 96),
            const SizedBox(height: 24),
            const CircularProgressIndicator(),
          ],
        ),
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
