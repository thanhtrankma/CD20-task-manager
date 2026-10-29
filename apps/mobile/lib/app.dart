import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';

import 'auth/auth_controller.dart';
import 'models/models.dart';
import 'push/messaging.dart';
import 'screens/account_screens.dart';
import 'screens/chat_info_screen.dart';
import 'screens/chat_list_screen.dart';
import 'screens/chat_thread_screen.dart';
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
        AuthStatus.ready => preAppLocations.contains(loc) || (loc.startsWith('/chat') && !_chatAllowed(auth))
            ? '/tasks'
            : null,
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
      GoRoute(
        path: '/chat/:id',
        parentNavigatorKey: rootKey,
        builder: (_, state) => ChatThreadScreen(
          key: ValueKey('chat-${state.pathParameters['id']}'),
          conversationId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
        ),
        routes: [
          GoRoute(
            path: 'info',
            parentNavigatorKey: rootKey,
            builder: (_, state) =>
                ChatInfoScreen(conversationId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0),
          ),
        ],
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => HomeShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/tasks', builder: (_, _) => const TasksScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/chat', builder: (_, _) => const ChatListScreen())]),
          StatefulShellBranch(
              routes: [GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, _) => const AccountScreen())]),
        ],
      ),
    ],
  );
}

/// Tài khoản quản trị không dùng trò chuyện.
bool _chatAllowed(AuthController auth) => auth.me != null && auth.me!.role != Role.admin;

/// Thứ tự nhánh trong [StatefulShellRoute]: Việc của tôi, Trò chuyện, Thông báo, Tài khoản.
const _chatBranch = 1;

/// Khung chính sau khi đăng nhập: Việc của tôi, Trò chuyện (số tin chưa đọc; không có với quản trị),
/// Thông báo (huy hiệu số chưa đọc), Tài khoản.
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
    if (_chatAllowed(_app.auth)) _app.chat.start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _app.unread.stop();
    _app.chat.stop();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        // Quay lại ứng dụng: làm mới số chưa đọc và danh sách việc, mở lại luồng trò chuyện.
        _app.unread.refresh();
        _app.events.changed();
        _app.chat.setForeground(true);
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
      case AppLifecycleState.detached:
        // Xuống nền: đóng luồng trò chuyện (không giữ kết nối khi không dùng).
        _app.chat.setForeground(false);
      case AppLifecycleState.inactive:
        // Tạm thời (hộp xác thực, kéo trung tâm điều khiển): giữ nguyên.
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: widget.shell,
      bottomNavigationBar: ListenableBuilder(
        listenable: Listenable.merge([_app.unread, _app.chat]),
        builder: (context, _) {
          final unread = _app.unread.count;
          final chatUnread = _app.chat.unread;
          final showChat = _chatAllowed(_app.auth);
          // Chỉ số nhánh ↔ vị trí trên thanh dưới (bỏ Trò chuyện với quản trị).
          final branches = [0, if (showChat) _chatBranch, 2, 3];
          final selected = branches.indexOf(widget.shell.currentIndex);
          return NavigationBar(
            selectedIndex: selected < 0 ? 0 : selected,
            onDestinationSelected: (i) {
              final b = branches[i];
              widget.shell.goBranch(b, initialLocation: b == widget.shell.currentIndex);
            },
            destinations: [
              const NavigationDestination(
                icon: Icon(Icons.checklist_outlined),
                selectedIcon: Icon(Icons.checklist),
                label: 'Việc của tôi',
              ),
              if (showChat)
                NavigationDestination(
                  key: const Key('nav-chat'),
                  icon: _CountBadge(count: chatUnread, child: const Icon(Icons.forum_outlined)),
                  selectedIcon: _CountBadge(count: chatUnread, child: const Icon(Icons.forum)),
                  label: 'Trò chuyện',
                ),
              NavigationDestination(
                icon: _CountBadge(count: unread, child: const Icon(Icons.notifications_outlined)),
                selectedIcon: _CountBadge(count: unread, child: const Icon(Icons.notifications)),
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

class _CountBadge extends StatelessWidget {
  const _CountBadge({required this.count, required this.child});
  final int count;
  final Widget child;

  @override
  Widget build(BuildContext context) =>
      Badge(isLabelVisible: count > 0, label: Text(count > 99 ? '99+' : '$count'), child: child);
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
      _s.chat.stop();
      _s.avatars.clear();
      AppBadge.set(0);
    }
    _tryOpenPending();
  }

  void _onUnread() => AppBadge.set(_s.unread.count);

  /// Đường dẫn màn hình trên cùng (kể cả màn hình mở bằng `push`, ví dụ `/chat/5`).
  String _currentPath() {
    final config = _router.routerDelegate.currentConfiguration;
    final last = config.isEmpty ? null : config.last;
    if (last is ImperativeRouteMatch) return last.matches.uri.path;
    return config.uri.path;
  }

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
    final chatId = m.chatId;
    if (chatId != null) {
      _s.chat.scheduleUnreadRefresh();
      // Đang mở đúng cuộc trò chuyện (hoặc danh sách trò chuyện) thì không cần báo.
      final path = _currentPath();
      if (path == '/chat/$chatId' || path == '/chat') return;
    } else {
      _s.unread.refresh();
      _s.events.changed();
    }
    final text = (m.body?.isNotEmpty ?? false) ? m.body! : (m.title ?? 'Đồng chí có thông báo mới');
    final messenger = _messenger.currentState;
    messenger?.hideCurrentSnackBar();
    messenger?.showSnackBar(SnackBar(
      content: Text(text),
      duration: const Duration(seconds: 6),
      action: m.taskId == null && m.chatId == null
          ? null
          : SnackBarAction(label: 'Xem', onPressed: () => _s.push.pendingOpen.value = m),
    ));
  }

  /// Mở nhiệm vụ / cuộc trò chuyện từ thông báo đã bấm: chờ đã đăng nhập, đã mở khóa và đã vào màn hình chính.
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
    final chatId = m.chatId;
    final target = taskId != null
        ? '/task/$taskId'
        : chatId != null && _chatAllowed(_s.auth)
            ? '/chat/$chatId'
            : null;
    if (target != null) {
      WidgetsBinding.instance
        ..addPostFrameCallback((_) {
          if (!mounted) return;
          // Đang mở đúng cuộc trò chuyện đó thì thôi.
          if (_currentPath() != target) _router.push(target);
        })
        ..scheduleFrame();
    } else if (chatId != null) {
      _router.go('/tasks');
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
