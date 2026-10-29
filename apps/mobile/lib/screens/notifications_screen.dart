import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../services/app_services.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import 'chat_list_screen.dart' show openChat;
import 'tasks_screen.dart' show openTask;

/// Thông báo (50 thông báo gần nhất). Bấm vào: đánh dấu đã đọc và mở nhiệm vụ liên quan.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<AppNotification>? _items;
  ApiException? _error;
  late AppServices _app;
  bool _init = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _app = AppScope.of(context);
    // Có thông báo mới (số chưa đọc thay đổi) thì tải lại danh sách.
    _app.unread.addListener(_onUnreadChanged);
    _load();
  }

  void _onUnreadChanged() {
    final shown = _items?.where((n) => !n.isRead).length ?? 0;
    if (_app.unread.count > shown) _load();
  }

  @override
  void dispose() {
    _app.unread.removeListener(_onUnreadChanged);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await _app.api.get('/notifications');
      final items = data is List
          ? data.whereType<Map>().map((e) => AppNotification.fromJson(e.cast())).toList()
          : <AppNotification>[];
      if (!mounted) return;
      setState(() {
        _items = items;
        _error = null;
      });
      _app.unread.refresh();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _open(AppNotification n) async {
    if (!n.isRead) {
      setState(() => _items = [for (final x in _items!) x.id == n.id ? x.markRead() : x]);
      _app.unread.count = (_app.unread.count - 1).clamp(0, 1 << 30);
      _app.api.post('/notifications/${n.id}/read').then((_) {}, onError: (_) {});
    }
    final id = n.taskId;
    final chatId = n.chatId;
    if (id != null) {
      openTask(context, id);
    } else if (chatId != null && _app.auth.me?.role != Role.admin) {
      openChat(context, chatId);
    }
  }

  Future<void> _readAll() async {
    try {
      await _app.api.post('/notifications/read-all');
      if (!mounted) return;
      setState(() => _items = [for (final x in _items ?? <AppNotification>[]) x.isRead ? x : x.markRead()]);
      _app.unread.count = 0;
      showMessage(context, 'Đã đánh dấu tất cả là đã đọc');
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    final hasUnread = items?.any((n) => !n.isRead) ?? false;
    Widget body;
    if (items == null && _error == null) {
      body = const Center(child: CircularProgressIndicator());
    } else if (items == null) {
      body = CenterMessage(
          icon: Icons.cloud_off, text: _error!.message, action: OutlinedButton(onPressed: _load, child: const Text('Thử lại')));
    } else if (items.isEmpty) {
      body = const CenterMessage(icon: Icons.notifications_none, text: 'Chưa có thông báo nào');
    } else {
      body = ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: items.length,
        separatorBuilder: (_, _) => const Divider(height: 1),
        itemBuilder: (context, i) => _NotificationTile(n: items[i], onTap: () => _open(items[i])),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Thông báo'),
        actions: [
          if (hasUnread)
            TextButton.icon(onPressed: _readAll, icon: const Icon(Icons.done_all), label: const Text('Đọc hết')),
        ],
      ),
      body: RefreshIndicator(onRefresh: _load, child: body),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.n, required this.onTap});
  final AppNotification n;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListTile(
      onTap: onTap,
      tileColor: n.isRead ? null : scheme.primaryContainer.withValues(alpha: 0.25),
      leading: Icon(
        n.isRead ? Icons.notifications_none : Icons.notifications_active,
        color: n.isRead ? scheme.outline : scheme.primary,
      ),
      title: Text(n.title, style: TextStyle(fontWeight: n.isRead ? FontWeight.normal : FontWeight.w700)),
      subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (n.body != null) Text(n.body!, maxLines: 2, overflow: TextOverflow.ellipsis),
        Text(formatAgo(n.createdAt), style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
      ]),
      trailing: n.taskId != null || n.chatId != null ? const Icon(Icons.chevron_right) : null,
    );
  }
}
