part of 'models.dart';

// Trò chuyện nội bộ (roadmap giai đoạn G, `/api/chat/...`).

/// Mã cuộc trò chuyện trong đường dẫn thông báo dạng `/chat/5`.
int? chatIdFromLink(String? link) {
  final m = RegExp(r'^/chat/(\d+)$').firstMatch(link ?? '');
  return m == null ? null : int.tryParse(m.group(1)!);
}

/// Người trong danh bạ trò chuyện, thành viên, người nhắn riêng (`UserBrief` của API).
class UserBrief {
  const UserBrief({
    required this.id,
    required this.fullName,
    this.rank,
    this.position,
    this.unitId,
    this.unitName,
    this.avatarUrl,
  });

  final int id;
  final String fullName;
  final String? rank;
  final String? position;
  final int? unitId;
  final String? unitName;
  final String? avatarUrl;

  factory UserBrief.fromJson(Json j) {
    final unit = _map(j['unit']);
    return UserBrief(
      id: _int(j['id']),
      fullName: _str(j['fullName']),
      rank: _strOrNull(j['rank']),
      position: _strOrNull(j['position']),
      unitId: _intOrNull(unit['id']),
      unitName: _strOrNull(unit['name']),
      avatarUrl: _strOrNull(j['avatarUrl']),
    );
  }

  static List<UserBrief> listFrom(Object? data) => _list(data).map(UserBrief.fromJson).toList();

  /// "Thượng úy Nguyễn Văn A" (có cấp bậc) hoặc họ tên.
  String get rankName => [if ((rank ?? '').trim().isNotEmpty) rank!.trim(), fullName].join(' ');

  /// Chức vụ · đơn vị.
  String get subtitle => [position, unitName].whereType<String>().where((s) => s.trim().isNotEmpty).join(' · ');

  @override
  bool operator ==(Object other) => other is UserBrief && other.id == id;
  @override
  int get hashCode => id.hashCode;
}

enum ConversationType {
  direct('DIRECT'),
  group('GROUP'),
  unit('UNIT');

  const ConversationType(this.api);
  final String api;
  static ConversationType parse(Object? v) =>
      ConversationType.values.firstWhere((t) => t.api == v, orElse: () => ConversationType.group);
}

/// Người gửi tin (null với tin hệ thống).
class ChatSender {
  const ChatSender({required this.id, required this.fullName, this.avatarUrl});
  final int id;
  final String fullName;
  final String? avatarUrl;

  static ChatSender? tryParse(Object? v) {
    if (v is! Map) return null;
    final j = v.cast<String, dynamic>();
    return ChatSender(id: _int(j['id']), fullName: _str(j['fullName']), avatarUrl: _strOrNull(j['avatarUrl']));
  }
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.isSystem,
    required this.body,
    required this.createdAt,
    this.sender,
    this.deletedAt,
  });

  final int id;
  final int conversationId;

  /// Tin hệ thống (`kind = SYSTEM`): "A đã thêm B vào nhóm"...
  final bool isSystem;

  /// Rỗng khi tin đã thu hồi.
  final String body;
  final ChatSender? sender;
  final DateTime createdAt;
  final DateTime? deletedAt;

  bool get isDeleted => deletedAt != null;

  factory ChatMessage.fromJson(Json j) => ChatMessage(
    id: _int(j['id']),
    conversationId: _int(j['conversationId']),
    isSystem: j['kind'] == 'SYSTEM',
    body: _str(j['body']),
    sender: ChatSender.tryParse(j['sender']),
    createdAt: _date(j['createdAt']) ?? DateTime.now(),
    deletedAt: _date(j['deletedAt']),
  );

  /// Bản đã thu hồi (nội dung bỏ trống).
  ChatMessage recalled([DateTime? at]) => ChatMessage(
    id: id,
    conversationId: conversationId,
    isSystem: isSystem,
    body: '',
    sender: sender,
    createdAt: createdAt,
    deletedAt: at ?? DateTime.now(),
  );
}

/// Một dòng trong danh sách trò chuyện (`ConversationItem`).
class Conversation {
  const Conversation({
    required this.id,
    required this.type,
    required this.name,
    this.unitId,
    this.includeSubunits = false,
    this.memberCount = 0,
    this.peer,
    this.lastMessage,
    this.unread = 0,
    this.muted = false,
    this.lastMessageAt,
    this.createdAt,
  });

  final int id;
  final ConversationType type;

  /// Với nhắn riêng: họ tên người kia.
  final String name;
  final int? unitId;
  final bool includeSubunits;
  final int memberCount;
  final UserBrief? peer;
  final ChatMessage? lastMessage;
  final int unread;
  final bool muted;
  final DateTime? lastMessageAt;
  final DateTime? createdAt;

  bool get isDirect => type == ConversationType.direct;

  factory Conversation.fromJson(Json j) {
    final last = j['lastMessage'];
    final peer = j['peer'];
    return Conversation(
      id: _int(j['id']),
      type: ConversationType.parse(j['type']),
      name: _str(j['name']),
      unitId: _intOrNull(j['unitId']),
      includeSubunits: _bool(j['includeSubunits']),
      memberCount: _int(j['memberCount']),
      peer: peer is Map ? UserBrief.fromJson(peer.cast()) : null,
      lastMessage: last is Map ? ChatMessage.fromJson(last.cast()) : null,
      unread: _int(j['unread']),
      muted: _bool(j['muted']),
      lastMessageAt: _date(j['lastMessageAt']),
      createdAt: _date(j['createdAt']),
    );
  }

  static List<Conversation> listFrom(Object? data) => _list(data).map(Conversation.fromJson).toList();

  Conversation copyWith({String? name, bool? muted, bool? includeSubunits, int? unread}) => Conversation(
    id: id,
    type: type,
    name: name ?? this.name,
    unitId: unitId,
    includeSubunits: includeSubunits ?? this.includeSubunits,
    memberCount: memberCount,
    peer: peer,
    lastMessage: lastMessage,
    unread: unread ?? this.unread,
    muted: muted ?? this.muted,
    lastMessageAt: lastMessageAt,
    createdAt: createdAt,
  );
}

class ChatMember {
  const ChatMember({required this.user, required this.isOwner, required this.lastReadMessageId});
  final UserBrief user;
  final bool isOwner;
  final int lastReadMessageId;

  int get id => user.id;

  factory ChatMember.fromJson(Json j) => ChatMember(
    user: UserBrief.fromJson(j),
    isOwner: j['role'] == 'OWNER',
    lastReadMessageId: _int(j['lastReadMessageId']),
  );

  ChatMember withLastRead(int messageId) => ChatMember(user: user, isOwner: isOwner, lastReadMessageId: messageId);
}

/// GET /chat/conversations/:id: thông tin, thành viên, quyền.
class ConversationDetail {
  const ConversationDetail({
    required this.conversation,
    required this.members,
    this.canManage = false,
    this.canAddMembers = false,
    this.canLeave = false,
  });

  final Conversation conversation;
  final List<ChatMember> members;
  final bool canManage;
  final bool canAddMembers;
  final bool canLeave;

  factory ConversationDetail.fromJson(Json j) => ConversationDetail(
    conversation: Conversation.fromJson(j),
    members: _list(j['members']).map(ChatMember.fromJson).toList(),
    canManage: _bool(j['canManage']),
    canAddMembers: _bool(j['canAddMembers']),
    canLeave: _bool(j['canLeave']),
  );

  ConversationDetail copyWith({Conversation? conversation, List<ChatMember>? members}) => ConversationDetail(
    conversation: conversation ?? this.conversation,
    members: members ?? this.members,
    canManage: canManage,
    canAddMembers: canAddMembers,
    canLeave: canLeave,
  );
}

/// GET /chat/conversations/:id/messages: mới nhất trước.
class MessagePage {
  const MessagePage(this.items, this.hasMore);
  final List<ChatMessage> items;
  final bool hasMore;

  factory MessagePage.fromJson(Json j) =>
      MessagePage(_list(j['items']).map(ChatMessage.fromJson).toList(), _bool(j['hasMore']));
}
