import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import '../models/models.dart';
import '../security/app_lock.dart';
import 'sse.dart';

/// Sự kiện trò chuyện nhận qua luồng thời gian thực (`GET /chat/stream`).
sealed class ChatEvent {
  const ChatEvent();
}

/// `event: message`: tin mới (của người khác hoặc của chính mình từ máy khác).
class ChatMessageEvent extends ChatEvent {
  const ChatMessageEvent(this.message);
  final ChatMessage message;
}

/// `event: message_deleted`: tin bị thu hồi.
class ChatMessageDeletedEvent extends ChatEvent {
  const ChatMessageDeletedEvent(this.conversationId, this.id);
  final int conversationId;
  final int id;
}

/// `event: conversation`: tạo mới, đổi tên, đổi thành viên, bị bỏ khỏi nhóm... → tải lại.
class ChatConversationEvent extends ChatEvent {
  const ChatConversationEvent(this.id);
  final int id;
}

/// `event: read`: [userId] đã đọc tới tin [messageId].
class ChatReadEvent extends ChatEvent {
  const ChatReadEvent(this.conversationId, this.userId, this.messageId);
  final int conversationId;
  final int userId;
  final int messageId;
}

/// Vừa kết nối (lại) luồng: có thể đã lỡ sự kiện trong lúc mất kết nối → các màn hình tải lại.
class ChatResyncEvent extends ChatEvent {
  const ChatResyncEvent();
}

/// Phân tích một sự kiện SSE của máy chủ; sự kiện lạ hoặc dữ liệu hỏng trả về null.
ChatEvent? chatEventFromSse(SseEvent e) {
  Object? data;
  try {
    data = jsonDecode(e.data);
  } catch (_) {
    return null;
  }
  if (data is! Map) return null;
  final j = data.cast<String, dynamic>();
  int? n(String k) => j[k] is num ? (j[k] as num).toInt() : int.tryParse('${j[k] ?? ''}');
  switch (e.event) {
    case 'message':
      final m = ChatMessage.fromJson(j);
      return m.id > 0 && m.conversationId > 0 ? ChatMessageEvent(m) : null;
    case 'message_deleted':
      final c = n('conversationId'), id = n('id');
      return c == null || id == null ? null : ChatMessageDeletedEvent(c, id);
    case 'conversation':
      final id = n('id');
      return id == null ? null : ChatConversationEvent(id);
    case 'read':
      final c = n('conversationId'), u = n('userId'), m = n('messageId');
      return c == null || u == null || m == null ? null : ChatReadEvent(c, u, m);
  }
  return null;
}

enum ChatConnection {
  /// Không kết nối (chưa đăng nhập, ứng dụng ở nền, đang khóa).
  idle,
  connecting,

  /// Luồng thời gian thực đang mở.
  live,

  /// Luồng lỗi nhiều lần (hoặc máy chủ không có luồng): các màn hình tự hỏi lại định kỳ.
  fallback,
}

/// Trò chuyện phía ứng dụng: số tin chưa đọc (huy hiệu trên thanh dưới) và luồng thời gian thực.
///
/// Luồng `GET /chat/stream` chỉ mở khi đã đăng nhập, ứng dụng ở tiền cảnh và không bị khóa; đóng khi xuống nền,
/// khóa, đăng xuất. Mất kết nối thì nối lại sau [backoff]; lỗi liên tiếp [failuresBeforeFallback] lần thì chuyển
/// sang [ChatConnection.fallback] (màn hình danh sách hỏi lại mỗi 30 giây, cuộc trò chuyện đang mở mỗi 10 giây)
/// và vẫn thử nối lại. Tài khoản quản trị không dùng trò chuyện.
class ChatService extends ChangeNotifier {
  ChatService({
    required this.api,
    required this.auth,
    required this.lock,
    this.backoff = const [Duration(seconds: 1), Duration(seconds: 3), Duration(seconds: 8), Duration(seconds: 20)],
    this.failuresBeforeFallback = 3,
    this.idleTimeout = const Duration(seconds: 70),
    this.healthyAfter = const Duration(seconds: 30),
    this.unreadPollInterval = const Duration(seconds: 30),
  });

  final ApiClient api;
  final AuthController auth;
  final AppLock lock;

  /// Thời gian chờ trước lần nối lại thứ 1, 2, ...; hết danh sách thì dùng phần tử cuối.
  final List<Duration> backoff;
  final int failuresBeforeFallback;

  /// Không nhận được gì (máy chủ gửi `: ping` mỗi 25 giây) quá lâu thì coi như mất kết nối.
  final Duration idleTimeout;

  /// Kết nối giữ được lâu hơn thời gian này (hoặc đã nhận dữ liệu) thì không tính là lỗi.
  final Duration healthyAfter;
  final Duration unreadPollInterval;

  /// Thời gian chờ gộp các lần làm mới số chưa đọc.
  static const unreadDebounce = Duration(milliseconds: 400);

  /// Danh sách hỏi lại mỗi 30 giây, cuộc trò chuyện đang mở mỗi 10 giây khi không có luồng.
  static const listPollInterval = Duration(seconds: 30);
  static const threadPollInterval = Duration(seconds: 10);

  final _events = StreamController<ChatEvent>.broadcast();
  Stream<ChatEvent> get events => _events.stream;

  int _unread = 0;
  int get unread => _unread;

  ChatConnection _connection = ChatConnection.idle;
  ChatConnection get connection => _connection;

  /// Các màn hình phải tự hỏi lại định kỳ.
  bool get polling => _connection == ChatConnection.fallback;

  /// Số lần lỗi liên tiếp (để kiểm thử).
  int get failures => _failures;

  /// Người dùng hiện tại được dùng trò chuyện (không phải quản trị).
  bool get available {
    final me = auth.me;
    return me != null && me.role != Role.admin;
  }

  int? get meId => auth.me?.id;

  bool _started = false;
  bool _foreground = true;

  /// Máy chủ không có luồng (404) hoặc không cho dùng (403): chỉ hỏi lại định kỳ.
  bool _streamSupported = true;
  int _failures = 0;
  int _generation = 0;
  bool _connecting = false;
  Completer<void>? _abort;
  StreamSubscription<SseEvent>? _sub;
  Timer? _retryTimer;
  Timer? _idleTimer;
  Timer? _unreadDebounce;
  Timer? _unreadPoll;
  DateTime? _openedAt;
  bool _gotData = false;

  void _setConnection(ChatConnection c) {
    if (_connection == c) return;
    _connection = c;
    notifyListeners();
  }

  set _unreadCount(int v) {
    if (v == _unread) return;
    _unread = v;
    notifyListeners();
  }

  bool get _wanted => _started && _foreground && !lock.locked && api.hasSession && available && _streamSupported;

  /// Khung chính đã hiện (đã đăng nhập): bắt đầu đếm tin chưa đọc, mở luồng.
  void start() {
    if (_started) return;
    _started = true;
    lock.addListener(_evaluate);
    _streamSupported = true;
    _failures = 0;
    unawaited(refreshUnread());
    _evaluate();
  }

  /// Rời khung chính, đăng xuất, hết phiên: đóng luồng, bỏ số chưa đọc.
  void stop() {
    if (!_started) return;
    _started = false;
    lock.removeListener(_evaluate);
    _disconnect();
    _unreadDebounce?.cancel();
    _unreadPoll?.cancel();
    _unreadPoll = null;
    _failures = 0;
    _unreadCount = 0;
    _setConnection(ChatConnection.idle);
  }

  /// Ứng dụng lên tiền cảnh / xuống nền.
  void setForeground(bool value) {
    if (_foreground == value) return;
    _foreground = value;
    if (value) unawaited(refreshUnread());
    _evaluate();
  }

  Future<void> refreshUnread() async {
    if (!_started || !available || !api.hasSession) return;
    try {
      final data = await api.get('/chat/unread');
      if (_started && data is Map && data['count'] is num) _unreadCount = (data['count'] as num).toInt();
    } catch (_) {
      // Lỗi mạng tạm thời: giữ số cũ.
    }
  }

  /// Làm mới số chưa đọc sau một nhịp ngắn (gộp nhiều sự kiện liền nhau).
  void scheduleUnreadRefresh() {
    _unreadDebounce?.cancel();
    _unreadDebounce = Timer(unreadDebounce, () => unawaited(refreshUnread()));
  }

  void _evaluate() {
    final want = _wanted;
    if (!want) {
      _disconnect();
      final pollOnly = _started && available && api.hasSession && !_streamSupported && _foreground && !lock.locked;
      _setConnection(pollOnly ? ChatConnection.fallback : ChatConnection.idle);
    } else if (_sub == null && !_connecting && _retryTimer == null) {
      unawaited(_connect());
    }
    _syncUnreadPoll();
  }

  /// Khi không có luồng: hỏi số chưa đọc định kỳ.
  void _syncUnreadPoll() {
    final need = _started && polling && _foreground && !lock.locked;
    if (need && _unreadPoll == null) {
      _unreadPoll = Timer.periodic(unreadPollInterval, (_) => unawaited(refreshUnread()));
    } else if (!need) {
      _unreadPoll?.cancel();
      _unreadPoll = null;
    }
  }

  Future<void> _connect() async {
    final gen = ++_generation;
    _connecting = true;
    if (_connection != ChatConnection.fallback) _setConnection(ChatConnection.connecting);
    final abort = _abort = Completer<void>();
    Stream<List<int>> bytes;
    try {
      bytes = await api.openEventStream('/chat/stream', abort: abort.future);
    } on ApiException catch (e) {
      if (gen != _generation) return;
      _connecting = false;
      if (e.status == 401) {
        // Phiên hết: ApiClient đã báo về màn hình đăng nhập.
        _disconnect();
        _setConnection(ChatConnection.idle);
      } else if (e.status == 403 || e.status == 404) {
        // Máy chủ chưa có / không cho dùng luồng: không thử lại, các màn hình hỏi lại định kỳ.
        _streamSupported = false;
        _setConnection(ChatConnection.fallback);
        _syncUnreadPoll();
      } else {
        _failed();
      }
      return;
    }
    _connecting = false;
    if (gen != _generation || !_wanted) {
      if (!abort.isCompleted) abort.complete();
      return;
    }
    _openedAt = DateTime.now();
    _gotData = false;
    _sub = parseSse(
      bytes,
      onChunk: _onAlive,
    ).listen(_onSse, onError: (Object _) => _dropped(gen), onDone: () => _dropped(gen), cancelOnError: true);
    _resetIdle();
    _setConnection(ChatConnection.live);
    _syncUnreadPoll();
    // Có thể đã lỡ tin trong lúc chưa có luồng.
    _events.add(const ChatResyncEvent());
    unawaited(refreshUnread());
  }

  void _onAlive() {
    _gotData = true;
    _resetIdle();
  }

  void _resetIdle() {
    _idleTimer?.cancel();
    final gen = _generation;
    _idleTimer = Timer(idleTimeout, () => _dropped(gen));
  }

  void _onSse(SseEvent e) {
    final event = chatEventFromSse(e);
    if (event == null) return;
    _events.add(event);
    switch (event) {
      case ChatMessageEvent(:final message):
        if (message.sender?.id != meId) scheduleUnreadRefresh();
      case ChatReadEvent(:final userId):
        if (userId == meId) scheduleUnreadRefresh();
      case ChatMessageDeletedEvent() || ChatConversationEvent():
        scheduleUnreadRefresh();
      case ChatResyncEvent():
        break;
    }
  }

  /// Luồng đóng / lỗi / im lặng quá lâu.
  void _dropped(int gen) {
    if (gen != _generation) return;
    final opened = _openedAt;
    final healthy = _gotData || (opened != null && DateTime.now().difference(opened) >= healthyAfter);
    _closeStream();
    if (healthy) _failures = 0;
    _failed();
  }

  void _failed() {
    _failures++;
    if (_failures >= failuresBeforeFallback) {
      _setConnection(ChatConnection.fallback);
    } else if (_connection == ChatConnection.live) {
      _setConnection(ChatConnection.connecting);
    }
    _syncUnreadPoll();
    if (!_wanted) return;
    final delay = backoff[(_failures - 1).clamp(0, backoff.length - 1)];
    _retryTimer?.cancel();
    _retryTimer = Timer(delay, () {
      _retryTimer = null;
      if (_wanted && _sub == null && !_connecting) unawaited(_connect());
    });
  }

  void _closeStream() {
    _generation++;
    _idleTimer?.cancel();
    _idleTimer = null;
    final sub = _sub;
    _sub = null;
    if (sub != null) unawaited(sub.cancel().catchError((_) {}));
    final abort = _abort;
    _abort = null;
    if (abort != null && !abort.isCompleted) abort.complete();
    _connecting = false;
    _openedAt = null;
  }

  void _disconnect() {
    _retryTimer?.cancel();
    _retryTimer = null;
    _closeStream();
  }

  @override
  void dispose() {
    stop();
    _events.close();
    super.dispose();
  }
}
