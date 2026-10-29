import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';

import 'auth/auth_controller.dart';
import 'push/messaging.dart';
import 'screens/account_screens.dart';
import 'screens/login_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/search_screen.dart';
import 'screens/security_screens.dart';
import 'screens/task_detail_screen.dart';
import 'screens/tasks_screen.dart';
import 'security/lock_screen.dart';
import 'services/app_services.dart';
import 'services/badge.dart';
import 'theme.dart';

/// Màn hình trước khi vào ứng dụng (không mở nhiệm vụ từ thông báo đẩy khi đang ở đây).
const preAppLocations = {'/splash', '/login', '/blocked', '/setup/password', '/setup/2fa'};

GoRouter buildRouter(AuthController auth) {
  final rootKey = GlobalKey<NavigatorState>();
  return GoRouter(
    navigatorKey: rootKey,
    initialLocation: '/splash',
    refreshListenable: auth.statusListenable,
    redirect: (context, state) {
      final loc = state.matchedLocation;
      String? go(String target) => loc == target ? null : target;
      return switch (auth.status) {
        AuthStatus.loading => go('/splash'),
        AuthStatus.loggedOut => go('/login'),
        AuthStatus.mustChangePassword => go('/setup/password'),
        AuthStatus.twoFactorSetup => go('/setup/2fa'),
        AuthStatus.adminOnly || AuthStatus.offline => go('/blocked'),
        AuthStatus.ready => preAppLocations.contains(loc) ? '/tasks' : null,
      };
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: '/blocked',
        builder: (_, _) => ListenableBuilder(listenable: auth, builder: (_, _) => BlockedScreen(status: auth.status)),
      ),
      GoRoute(path: '/setup/password', builder: (_, _) => const ForcedChangePasswordScreen()),
      GoRoute(path: '/setup/2fa', builder: (_, _) => const ForcedTwoFactorScreen()),
      GoRoute(path: '/search', parentNavigatorKey: rootKey, builder: (_, _) => const SearchScreen()),
      GoRoute(
        path: '/security/password',
        parentNavigatorKey: rootKey,
        builder: (_, _) => const ChangePasswordScreen(),
      ),
      GoRoute(path: '/security/2fa', parentNavigatorKey: rootKey, builder: (_, _) => const TwoFactorSetupScreen()),
      GoRoute(
        path: '/task/:id',
        parentNavigatorKey: rootKey,
        builder: (_, state) => TaskDetailScreen(
          key: ValueKey(state.pathParameters['id']),
          taskId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => HomeShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/tasks', builder: (_, _) => const TasksScreen())]),
          StatefulShellBranch(
              routes: [GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, _) => const AccountScreen())]),
        ],
      ),
    ],
  );
}

/// Khung chính sau khi đăng nhập: Việc của tôi, Thông báo (huy hiệu số chưa đọc), Tài khoản.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  late AppServices _app;
  bool _init = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _app = AppScope.of(context);
    WidgetsBinding.instance.addObserver(this);
    _app.unread.start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _app.unread.stop();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Quay lại ứng dụng: làm mới số chưa đọc và danh sách việc.
    if (state == AppLifecycleState.resumed) {
      _app.unread.refresh();
      _app.events.changed();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: widget.shell,
      bottomNavigationBar: ListenableBuilder(
        listenable: _app.unread,
        builder: (context, _) {
          final unread = _app.unread.count;
          return NavigationBar(
            selectedIndex: widget.shell.currentIndex,
            onDestinationSelected: (i) => widget.shell.goBranch(i, initialLocation: i == widget.shell.currentIndex),
            destinations: [
              const NavigationDestination(
                icon: Icon(Icons.checklist_outlined),
                selectedIcon: Icon(Icons.checklist),
                label: 'Việc của tôi',
              ),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: unread > 0,
                  label: Text(unread > 99 ? '99+' : '$unread'),
                  child: const Icon(Icons.notifications_outlined),
                ),
                selectedIcon: Badge(
                  isLabelVisible: unread > 0,
                  label: Text(unread > 99 ? '99+' : '$unread'),
                  child: const Icon(Icons.notifications),
                ),
                label: 'Thông báo',
              ),
              const NavigationDestination(
                icon: Icon(Icons.account_circle_outlined),
                selectedIcon: Icon(Icons.account_circle),
                label: 'Tài khoản',
              ),
            ],
          );
        },
      ),
    );
  }
}

class GiaoViecApp extends StatefulWidget {
  const GiaoViecApp({super.key, required this.services});
  final AppServices services;

  @override
  State<GiaoViecApp> createState() => _GiaoViecAppState();
}

class _GiaoViecAppState extends State<GiaoViecApp> {
  late final GoRouter _router = buildRouter(widget.services.auth);
  final _messenger = GlobalKey<ScaffoldMessengerState>();
  StreamSubscription<PushMessage>? _foregroundSub;
  AuthStatus? _lastStatus;

  AppServices get _s => widget.services;

  @override
  void initState() {
    super.initState();
    _s.auth.addListener(_onAuth);
    _s.lock.addListener(_tryOpenPending);
    _s.push.pendingOpen.addListener(_tryOpenPending);
    _router.routerDelegate.addListener(_tryOpenPending);
    _s.unread.addListener(_onUnread);
    _foregroundSub = _s.push.foregroundMessages.listen(_onForegroundMessage);
    _onAuth();
  }

  @override
  void dispose() {
    _s.auth.removeListener(_onAuth);
    _s.lock.removeListener(_tryOpenPending);
    _s.push.pendingOpen.removeListener(_tryOpenPending);
    _router.routerDelegate.removeListener(_tryOpenPending);
    _s.unread.removeListener(_onUnread);
    _foregroundSub?.cancel();
    _router.dispose();
    super.dispose();
  }

  void _onAuth() {
    final status = _s.auth.status;
    if (status == _lastStatus) return;
    _lastStatus = status;
    if (status == AuthStatus.ready) {
      // Sau khi đăng nhập và mỗi lần mở ứng dụng khi đã đăng nhập: đăng ký nhận thông báo đẩy.
      unawaited(_s.push.register());
      if (_s.lock.noticePending) WidgetsBinding.instance.addPostFrameCallback((_) => _showScreenLockNotice());
    } else if (status == AuthStatus.loggedOut) {
      _s.lock.reset();
      _s.push.signedOut();
      AppBadge.set(0);
    }
    _tryOpenPending();
  }

  void _onUnread() => AppBadge.set(_s.unread.count);

  /// Máy chưa đặt khóa màn hình: khuyên một lần, không chặn.
  Future<void> _showScreenLockNotice() async {
    final ctx = _router.routerDelegate.navigatorKey.currentContext;
    if (ctx == null || !_s.lock.noticePending) return;
    await _s.lock.markNoticeShown();
    if (!ctx.mounted) return;
    await showDialog<void>(
      context: ctx,
      builder: (c) => AlertDialog(
        icon: const Icon(Icons.lock_outline),
        title: const Text('Đồng chí nên đặt khóa màn hình'),
        content: const Text(
          'Điện thoại chưa đặt mã khóa màn hình (mã PIN, hình vẽ, mật khẩu) nên ứng dụng không thể tự khóa. '
          'Để bảo vệ thông tin công tác khi mất máy, đồng chí đặt khóa màn hình trong Cài đặt của điện thoại; '
          'ứng dụng sẽ tự bật khóa sau đó.',
        ),
        actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Đã hiểu'))],
      ),
    );
  }

  /// Thông báo tới khi đang mở ứng dụng: hiện thanh báo câu chung, làm mới số chưa đọc và danh sách.
  void _onForegroundMessage(PushMessage m) {
    if (_s.auth.status != AuthStatus.ready) return;
    _s.unread.refresh();
    _s.events.changed();
    final text = (m.body?.isNotEmpty ?? false) ? m.body! : (m.title ?? 'Đồng chí có thông báo mới');
    final messenger = _messenger.currentState;
    messenger?.hideCurrentSnackBar();
    messenger?.showSnackBar(SnackBar(
      content: Text(text),
      duration: const Duration(seconds: 6),
      action: m.taskId == null
          ? null
          : SnackBarAction(label: 'Xem', onPressed: () => _s.push.pendingOpen.value = m),
    ));
  }

  /// Mở nhiệm vụ từ thông báo đã bấm: chờ đã đăng nhập, đã mở khóa và đã vào màn hình chính.
  void _tryOpenPending() {
    final m = _s.push.pendingOpen.value;
    if (m == null) return;
    if (_s.auth.status == AuthStatus.loggedOut) return; // Giữ lại, mở sau khi đăng nhập.
    if (_s.auth.status != AuthStatus.ready || _s.lock.locked) return;
    final path = _router.routerDelegate.currentConfiguration.uri.path;
    if (preAppLocations.contains(path) || path.isEmpty) return;
    _s.push.pendingOpen.value = null;
    final id = m.notificationId;
    if (id != null) _s.api.post('/notifications/$id/read').then((_) => _s.unread.refresh(), onError: (_) {});
    final taskId = m.taskId;
    if (taskId != null) {
      WidgetsBinding.instance
        ..addPostFrameCallback((_) {
          if (mounted) _router.push('/task/$taskId');
        })
        ..scheduleFrame();
    } else {
      _router.go('/notifications');
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      services: widget.services,
      child: MaterialApp.router(
        title: 'Giao nhiệm vụ',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        locale: const Locale('vi'),
        supportedLocales: const [Locale('vi'), Locale('en')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        scaffoldMessengerKey: _messenger,
        routerConfig: _router,
        builder: (context, child) => LockGate(lock: _s.lock, auth: _s.auth, child: child ?? const SizedBox()),
      ),
    );
  }
}
