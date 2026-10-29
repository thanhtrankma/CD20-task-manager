import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../chat/chat_service.dart';
import '../models/models.dart';
import '../services/app_services.dart';
import '../theme.dart';
import '../util/chat_format.dart';
import '../widgets/avatar.dart';
import '../widgets/chat_notice.dart';
import '../widgets/common.dart';
import 'chat_create.dart';

void openChat(BuildContext context, int id) => context.push('/chat/$id');

/// Trò chuyện: danh sách cuộc trò chuyện (mới nhất trước), nút tạo mới.
class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  List<Conversation>? _items;
  ApiException? _error;
  late AppServices _app;
  StreamSubscription<ChatEvent>? _sub;
  Timer? _debounce;
  Timer? _poll;
  bool _init = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _app = AppScope.of(context);
    _sub = _app.chat.events.listen(_onEvent);
    _app.chat.addListener(_syncPolling);
    _syncPolling();
    _load();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _debounce?.cancel();
    _poll?.cancel();
    _app.chat.removeListener(_syncPolling);
    super.dispose();
  }

  /// Không có luồng thời gian thực: hỏi lại danh sách mỗi 30 giây.
  void _syncPolling() {
    if (_app.chat.polling && _poll == null) {
      _poll = Timer.periodic(ChatService.listPollInterval, (_) => _load());
    } else if (!_app.chat.polling) {
      _poll?.cancel();
      _poll = null;
    }
  }

  void _onEvent(ChatEvent e) {
    final reload = switch (e) {
      ChatReadEvent(:final userId) => userId == _app.chat.meId,
      _ => true,
    };
    if (!reload) return;
    // Gộp nhiều sự kiện liền nhau thành một lần tải.
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), _load);
  }

  Future<void> _load() async {
    try {
      final data = await _app.api.get('/chat/conversations');
      if (!mounted) return;
      setState(() {
        _items = Conversation.listFrom(data);
        _error = null;
      });
      unawaited(_app.chat.refreshUnread());
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _open(Conversation c) async {
    if (c.unread > 0) {
      setState(() => _items = [for (final x in _items!) x.id == c.id ? x.copyWith(unread: 0) : x]);
    }
    await context.push('/chat/${c.id}');
    if (mounted) unawaited(_load());
  }

  Future<void> _newMenu() async {
    final role = _app.auth.me?.role ?? Role.staff;
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.person_outline),
              title: const Text('Nhắn riêng'),
              subtitle: const Text('Chọn một cán bộ trong danh bạ'),
              onTap: () => Navigator.pop(ctx, 'direct'),
            ),
            ListTile(
              leading: const Icon(Icons.group_add_outlined),
              title: const Text('Tạo nhóm'),
              subtitle: const Text('Đặt tên và chọn thành viên'),
              onTap: () => Navigator.pop(ctx, 'group'),
            ),
            if (role.canAssign)
              ListTile(
                leading: const Star(size: 20, color: Palette.red700),
                title: const Text('Nhóm theo đơn vị'),
                subtitle: const Text('Thành viên tự cập nhật theo đơn vị'),
                onTap: () => Navigator.pop(ctx, 'unit'),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    Conversation? created;
    switch (choice) {
      case 'direct':
        final person = await pickChatPerson(context);
        if (person == null || !mounted) return;
        try {
          final data = await _app.api.post('/chat/direct', {'userId': person.id});
          created = Conversation.fromJson((data as Map).cast());
        } on ApiException catch (e) {
          if (mounted) showError(context, e);
          return;
        }
      case 'group':
        created = await Navigator.of(context)
            .push<Conversation>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const CreateGroupScreen()));
      case 'unit':
        created = await Navigator.of(context)
            .push<Conversation>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const UnitGroupScreen()));
    }
    if (created == null || !mounted) return;
    unawaited(_load());
    await _open(created);
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    Widget body;
    if (items == null && _error == null) {
      body = const Center(child: CircularProgressIndicator());
    } else if (items == null) {
      body = CenterMessage(
        icon: Icons.cloud_off,
        text: _error!.message,
        action: OutlinedButton(onPressed: _load, child: const Text('Thử lại')),
      );
    } else if (items.isEmpty) {
      body = const CenterMessage(
        icon: Icons.forum_outlined,
        text: 'Chưa có cuộc trò chuyện nào.\nBấm "Tin nhắn mới" để nhắn riêng hoặc tạo nhóm.',
      );
    } else {
      final meId = _app.chat.meId;
      body = ListView.separated(
        key: const Key('chat-list'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 88),
        itemCount: items.length,
        separatorBuilder: (_, _) => const Divider(height: 1, indent: 76),
        itemBuilder: (context, i) => _ConversationTile(c: items[i], meId: meId, onTap: () => _open(items[i])),
      );
    }
    return Scaffold(
      appBar: AppBar(
        flexibleSpace: const HeaderBackground(starSize: 120),
        backgroundColor: Colors.transparent,
        title: const Text('Trò chuyện'),
        actions: [
          ListenableBuilder(
            listenable: _app.chat,
            builder: (context, _) => _app.chat.polling
                ? const Tooltip(
                    message: 'Mất kết nối thời gian thực, tự làm mới định kỳ',
                    child: Padding(
                      padding: EdgeInsets.only(right: 14),
                      child: Icon(Icons.sync_problem, key: Key('chat-polling'), color: Palette.goldLight),
                    ),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('chat-new'),
        heroTag: 'chat-new',
        onPressed: _newMenu,
        icon: const Icon(Icons.add_comment_outlined),
        label: const Text('Tin nhắn mới'),
      ),
      body: Column(
        children: [
          const ChatNotice(),
          Expanded(
            child: RefreshIndicator(onRefresh: _load, child: body),
          ),
        ],
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.c, required this.meId, required this.onTap});
  final Conversation c;
  final int? meId;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (preview, italic) = messagePreview(c, meId);
    final unread = c.unread > 0;
    final time = chatListTime(c.lastMessageAt ?? c.lastMessage?.createdAt ?? c.createdAt);
    return ListTile(
      key: Key('conversation-${c.id}'),
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      leading: ConversationAvatar(conversation: c),
      title: Row(
        children: [
          Flexible(
            child: Text(
              c.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontWeight: unread ? FontWeight.w800 : FontWeight.w600),
            ),
          ),
          if (c.muted) ...[
            const SizedBox(width: 4),
            const Icon(Icons.notifications_off_outlined, key: Key('muted'), size: 15, color: Palette.muted),
          ],
        ],
      ),
      subtitle: Text(
        preview,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontStyle: italic ? FontStyle.italic : FontStyle.normal,
          color: unread ? Palette.ink : Palette.muted,
          fontWeight: unread ? FontWeight.w600 : FontWeight.normal,
        ),
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(time, style: TextStyle(fontSize: 12, color: unread ? Palette.red700 : Palette.muted)),
          const SizedBox(height: 4),
          if (unread)
            Badge(
              key: Key('unread-${c.id}'),
              label: Text(c.unread > 99 ? '99+' : '${c.unread}'),
              backgroundColor: c.muted ? Palette.muted : Palette.red700,
            )
          else
            const SizedBox(height: 16),
        ],
      ),
    );
  }
}
