import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';

import 'auth/auth_controller.dart';
import 'constants.dart';
import 'screens/account_screens.dart';
import 'screens/login_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/task_detail_screen.dart';
import 'screens/tasks_screen.dart';
import 'services/app_services.dart';

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: primaryColor, primary: primaryColor);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: const Color(0xFFF5F7FB),
    appBarTheme: const AppBarTheme(centerTitle: false, backgroundColor: Colors.white, surfaceTintColor: Colors.white),
    cardTheme: CardThemeData(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFFE5E7EB)),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(backgroundColor: Colors.white, height: 64),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}

GoRouter buildRouter(AuthController auth) {
  final rootKey = GlobalKey<NavigatorState>();
  return GoRouter(
    navigatorKey: rootKey,
    initialLocation: '/splash',
    refreshListenable: auth,
    redirect: (context, state) {
      final loc = state.matchedLocation;
      String? go(String target) => loc == target ? null : target;
      return switch (auth.status) {
        AuthStatus.loading => go('/splash'),
        AuthStatus.loggedOut => go('/login'),
        AuthStatus.setupRequired || AuthStatus.adminOnly || AuthStatus.offline => go('/blocked'),
        AuthStatus.ready => const {'/splash', '/login', '/blocked'}.contains(loc) ? '/tasks' : null,
      };
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: '/blocked',
        builder: (_, _) => ListenableBuilder(listenable: auth, builder: (_, _) => BlockedScreen(status: auth.status)),
      ),
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

  @override
  void dispose() {
    _router.dispose();
    super.dispose();
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
        routerConfig: _router,
      ),
    );
  }
}
