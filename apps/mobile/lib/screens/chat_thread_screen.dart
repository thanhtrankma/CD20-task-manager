import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../chat/chat_service.dart';
import '../models/models.dart';
import '../services/app_services.dart';
import '../theme.dart';
import '../util/chat_format.dart';
import '../util/format.dart';
import '../widgets/avatar.dart';
import '../widgets/chat_notice.dart';
import '../widgets/common.dart';

/// Một cuộc trò chuyện: tin mới nhất ở dưới, cuộn lên để tải tin cũ, khung soạn tin.
class ChatThreadScreen extends StatefulWidget {
  const ChatThreadScreen({super.key, required this.conversationId});
  final int conversationId;

  @override
  State<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends State<ChatThreadScreen> with WidgetsBindingObserver {
  late AppServices _app;
  bool _init = false;

  ConversationDetail? _detail;

  /// Mới nhất trước (phần tử 0 nằm dưới cùng màn hình).
  var _messages = <ChatMessage>[];
  bool _hasMore = false;
  bool _loaded = false;
  bool _loadingOlder = false;
  ApiException? _error;

  final _text = TextEditingController();
  final _scroll = ScrollController();
  final _focus = FocusNode();
  bool _sending = false;

  /// Đã báo máy chủ đọc tới tin này.
  int _lastMarked = 0;
  bool _atBottom = true;

  /// Tin mới tới khi đang xem tin cũ (hiện nút "Tin mới").
  int _newBelow = 0;

  StreamSubscription<ChatEvent>? _sub;
  Timer? _poll;

  int get _id => widget.conversationId;
  int? get _meId => _app.chat.meId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _app = AppScope.of(context);
    WidgetsBinding.instance.addObserver(this);
    _sub = _app.chat.events.listen(_onEvent);
    _app.chat.addListener(_syncPolling);
    _scroll.addListener(_onScroll);
    _text.addListener(_onText);
    _syncPolling();
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sub?.cancel();
    _poll?.cancel();
    _app.chat.removeListener(_syncPolling);
    _text.dispose();
    _scroll.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _maybeMarkRead();
  }

  bool get _foreground {
    final s = WidgetsBinding.instance.lifecycleState;
    return s == null || s == AppLifecycleState.resumed;
  }

  void _onText() => setState(() {});

  /// Không có luồng thời gian thực: hỏi lại tin mới mỗi 10 giây.
  void _syncPolling() {
    if (_app.chat.polling && _poll == null) {
      _poll = Timer.periodic(ChatService.threadPollInterval, (_) => _refresh());
    } else if (!_app.chat.polling) {
      _poll?.cancel();
      _poll = null;
    }
  }

  // ---------- Tải dữ liệu ----------

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        _app.api.get('/chat/conversations/$_id'),
        _app.api.get('/chat/conversations/$_id/messages', query: {'limit': chatPageSize}),
      ]);
      if (!mounted) return;
      final detail = ConversationDetail.fromJson((results[0] as Map).cast());
      final page = MessagePage.fromJson((results[1] as Map).cast());
      setState(() {
        _detail = detail;
        _messages = mergeMessages(const [], page.items);
        _hasMore = page.hasMore;
        _loaded = true;
        _error = null;
        _lastMarked = _myLastRead(detail);
      });
      _afterLayout();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  int _myLastRead(ConversationDetail d) {
    for (final m in d.members) {
      if (m.id == _meId) return m.lastReadMessageId;
    }
    return 0;
  }

  Future<void> _reloadDetail() async {
    try {
      final data = await _app.api.get('/chat/conversations/$_id');
      if (mounted) setState(() => _detail = ConversationDetail.fromJson((data as Map).cast()));
    } on ApiException catch (e) {
      // Bị bỏ khỏi nhóm / nhóm không còn.
      if (mounted && (e.status == 403 || e.status == 404)) setState(() => _error = e);
    }
  }

  /// Tải trang tin mới nhất và ghép vào (khi hỏi định kỳ hoặc vừa nối lại luồng).
  Future<void> _refresh({bool withDetail = true}) async {
    if (!_loaded) return _load();
    try {
      final data = await _app.api.get('/chat/conversations/$_id/messages', query: {'limit': chatPageSize});
      if (!mounted) return;
      final page = MessagePage.fromJson((data as Map).cast());
      final before = _messages.isEmpty ? 0 : _messages.first.id;
      setState(() {
        if (_messages.isNotEmpty && page.hasMore && page.items.isNotEmpty && page.items.last.id > before) {
          // Lỡ quá nhiều tin: bỏ phần cũ, giữ trang mới nhất.
          _messages = page.items;
          _hasMore = true;
        } else {
          _messages = mergeMessages(_messages, page.items);
        }
      });
      _onNewArrived(_messages.isEmpty ? 0 : _messages.first.id, before);
    } on ApiException catch (e) {
      if (mounted && (e.status == 403 || e.status == 404)) setState(() => _error = e);
    }
    if (withDetail) await _reloadDetail();
  }

  Future<void> _loadOlder() async {
    if (_loadingOlder || !_hasMore || _messages.isEmpty) return;
    _loadingOlder = true;
    final oldest = _messages.last.id;
    try {
      final data = await _app.api.get(
        '/chat/conversations/$_id/messages',
        query: {'before': oldest, 'limit': chatPageSize},
      );
      if (!mounted) return;
      final page = MessagePage.fromJson((data as Map).cast());
      setState(() {
        _messages = mergeMessages(_messages, page.items);
        _hasMore = page.hasMore && page.items.isNotEmpty;
      });
      _afterLayout();
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    } finally {
      _loadingOlder = false;
    }
  }

  /// Sau khi vẽ: tin chưa đủ một màn hình thì tải thêm tin cũ; đang ở cuối thì báo đã đọc.
  void _afterLayout() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_scroll.hasClients && _scroll.position.maxScrollExtent <= 0 && _hasMore) _loadOlder();
      _maybeMarkRead();
    });
  }

  // ---------- Thời gian thực ----------

  void _onEvent(ChatEvent e) {
    if (!_loaded && e is! ChatResyncEvent) return;
    switch (e) {
      case ChatMessageEvent(:final message) when message.conversationId == _id:
        final before = _messages.isEmpty ? 0 : _messages.first.id;
        setState(() => _messages = mergeMessages(_messages, [message]));
        if (message.isSystem) unawaited(_reloadDetail());
        _onNewArrived(message.id, before, mine: message.sender?.id == _meId);
      case ChatMessageDeletedEvent(:final conversationId, :final id) when conversationId == _id:
        setState(() => _messages = [for (final m in _messages) m.id == id ? m.recalled() : m]);
      case ChatConversationEvent(:final id) when id == _id:
        unawaited(_reloadDetail());
      case ChatReadEvent(:final conversationId, :final userId, :final messageId) when conversationId == _id:
        final d = _detail;
        if (d == null) return;
        setState(() {
          _detail = d.copyWith(
            members: [
              for (final m in d.members)
                m.id == userId && messageId > m.lastReadMessageId ? m.withLastRead(messageId) : m,
            ],
          );
        });
      case ChatResyncEvent():
        unawaited(_refresh());
      default:
        break;
    }
  }

  void _onNewArrived(int newest, int before, {bool mine = false}) {
    if (newest <= before) return;
    if (mine || _atBottom) {
      _newBelow = 0;
      _afterLayout();
    } else {
      setState(() => _newBelow++);
    }
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final p = _scroll.position;
    // Danh sách đảo ngược: 0 là cuối (tin mới nhất), maxScrollExtent là đầu (tin cũ nhất).
    final atBottom = p.pixels <= 80;
    if (atBottom != _atBottom) {
      setState(() {
        _atBottom = atBottom;
        if (atBottom) _newBelow = 0;
      });
      if (atBottom) _maybeMarkRead();
    }
    if (p.maxScrollExtent - p.pixels < 300) _loadOlder();
  }

  /// Báo đã đọc tới tin mới nhất khi tin đó đang hiện (đang ở cuối danh sách, ứng dụng ở tiền cảnh).
  void _maybeMarkRead() {
    if (!mounted || _messages.isEmpty || !_atBottom || !_foreground || _error != null) return;
    final newest = _messages.first.id;
    if (newest <= _lastMarked) return;
    final previous = _lastMarked;
    _lastMarked = newest;
    _app.api
        .post('/chat/conversations/$_id/read', {'messageId': newest})
        .then(
          (_) => _app.chat.scheduleUnreadRefresh(),
          onError: (_) {
            if (_lastMarked == newest) _lastMarked = previous;
          },
        );
  }

  void _scrollToBottom() {
    if (_scroll.hasClients) {
      _scroll.animateTo(0, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    }
  }

  // ---------- Thao tác ----------

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty || _sending) return;
    if (body.length > chatMaxLength) return showError(context, 'Tin nhắn tối đa $chatMaxLength ký tự');
    setState(() => _sending = true);
    try {
      final data = await _app.api.post('/chat/conversations/$_id/messages', {'body': body});
      if (!mounted) return;
      final msg = ChatMessage.fromJson((data as Map).cast());
      _text.clear();
      setState(() => _messages = mergeMessages(_messages, [msg]));
      _scrollToBottom();
      _afterLayout();
    } on ApiException catch (e) {
      // Giữ nguyên nội dung đã soạn để gửi lại.
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _messageMenu(ChatMessage m) async {
    if (!canRecall(m, _meId)) return;
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              key: const Key('recall'),
              leading: const Icon(Icons.undo),
              title: const Text('Thu hồi'),
              subtitle: const Text('Mọi người sẽ thấy "Tin nhắn đã được thu hồi"'),
              onTap: () => Navigator.pop(ctx, 'recall'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (action != 'recall' || !mounted) return;
    try {
      await _app.api.delete('/chat/messages/${m.id}');
      if (!mounted) return;
      setState(() => _messages = [for (final x in _messages) x.id == m.id ? x.recalled() : x]);
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _openInfo() async {
    if (_detail == null) return;
    final result = await context.push<String>('/chat/$_id/info');
    if (!mounted) return;
    if (result == 'left') {
      context.pop();
      return;
    }
    unawaited(_reloadDetail());
  }

  // ---------- Giao diện ----------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        flexibleSpace: const HeaderBackground(starSize: 110),
        backgroundColor: Colors.transparent,
        titleSpacing: 0,
        title: _title(),
        actions: [
          if (_detail != null)
            IconButton(
              key: const Key('chat-info'),
              tooltip: 'Thông tin',
              icon: const Icon(Icons.info_outline, color: Colors.white),
              onPressed: _openInfo,
            ),
        ],
      ),
      body: Column(
        children: [
          const ChatNotice(),
          Expanded(child: _body()),
          if (_error == null) _composer(),
        ],
      ),
    );
  }

  Widget _title() {
    final d = _detail;
    if (d == null) return const Text('Trò chuyện');
    final c = d.conversation;
    final subtitle = c.isDirect
        ? (c.peer?.subtitle ?? '')
        : '${d.members.isEmpty ? c.memberCount : d.members.length} thành viên';
    return InkWell(
      key: const Key('chat-title'),
      onTap: _openInfo,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            ConversationAvatar(conversation: c, size: 36),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          c.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 17),
                        ),
                      ),
                      if (c.muted) ...[
                        const SizedBox(width: 4),
                        const Icon(Icons.notifications_off_outlined, size: 15, color: Colors.white70),
                      ],
                    ],
                  ),
                  if (subtitle.isNotEmpty)
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.white.withValues(alpha: 0.8),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (_error != null) {
      final gone = _error!.status == 403 || _error!.status == 404;
      return CenterMessage(
        icon: gone ? Icons.forum_outlined : Icons.cloud_off,
        text: gone ? 'Đồng chí không còn trong cuộc trò chuyện này' : _error!.message,
        action: gone ? null : OutlinedButton(onPressed: _load, child: const Text('Thử lại')),
      );
    }
    if (!_loaded) return const Center(child: CircularProgressIndicator());
    if (_messages.isEmpty) {
      return const CenterMessage(
        icon: Icons.waving_hand_outlined,
        text: 'Chưa có tin nhắn. Đồng chí gửi tin đầu tiên.',
      );
    }
    final seenId = _seenMessageId();
    final group = !(_detail?.conversation.isDirect ?? true);
    return Stack(
      children: [
        ListView.builder(
          key: const Key('chat-messages'),
          controller: _scroll,
          reverse: true,
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          itemCount: _messages.length + (_hasMore ? 1 : 0),
          itemBuilder: (context, i) {
            if (i >= _messages.length) {
              return const Padding(
                padding: EdgeInsets.all(12),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            final m = _messages[i];
            final older = i + 1 < _messages.length ? _messages[i + 1] : null;
            final newDay = older == null || !sameDay(older.createdAt, m.createdAt);
            final firstOfRun = newDay || older.isSystem || older.sender?.id != m.sender?.id;
            return Column(
              key: ValueKey('msg-${m.id}'),
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (newDay) _DateSeparator(chatDayLabel(m.createdAt)),
                if (m.isSystem)
                  _SystemLine(m)
                else
                  _Bubble(
                    message: m,
                    mine: m.sender?.id == _meId,
                    showSender: group && firstOfRun,
                    indentForAvatar: group,
                    seen: m.id == seenId,
                    onLongPress: canRecall(m, _meId) ? () => _messageMenu(m) : null,
                  ),
              ],
            );
          },
        ),
        if (_newBelow > 0)
          Positioned(
            bottom: 12,
            left: 0,
            right: 0,
            child: Center(
              child: ActionChip(
                key: const Key('new-below'),
                avatar: const Icon(Icons.arrow_downward, size: 16, color: Colors.white),
                label: Text('$_newBelow tin mới', style: const TextStyle(color: Colors.white)),
                backgroundColor: Palette.red700,
                onPressed: _scrollToBottom,
              ),
            ),
          ),
      ],
    );
  }

  /// Nhắn riêng: tin cuối của mình mà người kia đã đọc tới → hiện "Đã xem".
  int? _seenMessageId() {
    final d = _detail;
    final me = _meId;
    if (d == null || !d.conversation.isDirect || me == null) return null;
    ChatMessage? mine;
    for (final m in _messages) {
      if (!m.isSystem && m.sender?.id == me) {
        mine = m;
        break;
      }
    }
    if (mine == null) return null;
    for (final p in d.members) {
      if (p.id != me && p.lastReadMessageId >= mine.id) return mine.id;
    }
    return null;
  }

  Widget _composer() {
    final canSend = _text.text.trim().isNotEmpty && !_sending;
    return Material(
      color: Colors.white,
      elevation: 6,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  key: const Key('chat-input'),
                  controller: _text,
                  focusNode: _focus,
                  minLines: 1,
                  maxLines: 5,
                  maxLength: chatMaxLength,
                  keyboardType: TextInputType.multiline,
                  textCapitalization: TextCapitalization.sentences,
                  buildCounter: (_, {required currentLength, required isFocused, maxLength}) =>
                      currentLength > chatMaxLength - 300 ? Text('$currentLength/$maxLength') : null,
                  decoration: const InputDecoration(
                    hintText: 'Nhập tin nhắn',
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(22))),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.all(Radius.circular(22)),
                      borderSide: BorderSide(color: Palette.border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.all(Radius.circular(22)),
                      borderSide: BorderSide(color: Palette.red700, width: 1.4),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 4),
              IconButton.filled(
                key: const Key('chat-send'),
                tooltip: 'Gửi',
                onPressed: canSend ? _send : null,
                icon: _sending
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DateSeparator extends StatelessWidget {
  const _DateSeparator(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          const Expanded(child: Divider()),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Text(
              label,
              style: const TextStyle(fontSize: 12, color: Palette.muted, fontWeight: FontWeight.w600),
            ),
          ),
          const Expanded(child: Divider()),
        ],
      ),
    );
  }
}

class _SystemLine extends StatelessWidget {
  const _SystemLine(this.message);
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 24),
      child: Text(
        message.body,
        key: Key('system-${message.id}'),
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 12, color: Palette.muted, fontStyle: FontStyle.italic),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({
    required this.message,
    required this.mine,
    required this.showSender,
    required this.indentForAvatar,
    required this.seen,
    this.onLongPress,
  });

  final ChatMessage message;
  final bool mine;
  final bool showSender;
  final bool indentForAvatar;
  final bool seen;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final m = message;
    final deleted = m.isDeleted;
    final bg = deleted ? Palette.bg : (mine ? Palette.red700 : Colors.white);
    final fg = deleted ? Palette.muted : (mine ? Colors.white : Palette.ink);
    const r = Radius.circular(16);
    const small = Radius.circular(4);
    final bubble = GestureDetector(
      onLongPress: onLongPress,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.74),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.only(
            topLeft: r,
            topRight: r,
            bottomLeft: mine ? r : small,
            bottomRight: mine ? small : r,
          ),
          border: mine && !deleted ? null : Border.all(color: Palette.border),
        ),
        child: Column(
          crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              deleted ? recalledText : m.body,
              style: TextStyle(color: fg, fontSize: 15, fontStyle: deleted ? FontStyle.italic : FontStyle.normal),
            ),
            const SizedBox(height: 2),
            Text(
              formatTime(m.createdAt),
              style: TextStyle(fontSize: 11, color: mine && !deleted ? Colors.white70 : Palette.muted),
            ),
          ],
        ),
      ),
    );
    if (mine) {
      return Padding(
        padding: const EdgeInsets.only(top: 3, left: 48),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Align(alignment: Alignment.centerRight, child: bubble),
            if (seen)
              const Padding(
                padding: EdgeInsets.only(top: 2, right: 4),
                child: Text(
                  'Đã xem',
                  key: Key('seen'),
                  style: TextStyle(fontSize: 11, color: Palette.muted),
                ),
              ),
          ],
        ),
      );
    }
    final sender = m.sender;
    return Padding(
      padding: EdgeInsets.only(top: showSender ? 8 : 3, right: 48),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (indentForAvatar)
            SizedBox(
              width: 38,
              child: showSender && sender != null
                  ? Align(
                      alignment: Alignment.bottomLeft,
                      child: UserAvatar(name: sender.fullName, url: sender.avatarUrl, size: 30),
                    )
                  : null,
            ),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (showSender && sender != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 4, bottom: 2),
                    child: Text(
                      sender.fullName,
                      style: const TextStyle(fontSize: 12, color: Palette.olive, fontWeight: FontWeight.w700),
                    ),
                  ),
                bubble,
              ],
            ),
          ),
        ],
      ),
    );
  }
}
