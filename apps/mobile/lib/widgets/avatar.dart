import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/app_services.dart';
import '../theme.dart';

/// Chữ cái đầu của tên (tiếng Việt gọi theo tên, là từ cuối): "Nguyễn Văn An" → "A".
String initialsOf(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  return parts.last.characters.first.toUpperCase();
}

/// Ảnh đại diện tròn: ảnh của máy chủ (tải kèm cookie phiên, giữ trong bộ nhớ) hoặc vòng tròn chữ cái đầu.
class UserAvatar extends StatefulWidget {
  const UserAvatar({super.key, required this.name, this.url, this.size = 40, this.borderColor, this.borderWidth = 0});

  final String name;

  /// `avatarUrl` của máy chủ (`/api/users/12/avatar?v=...`) hoặc null.
  final String? url;
  final double size;
  final Color? borderColor;
  final double borderWidth;

  @override
  State<UserAvatar> createState() => _UserAvatarState();
}

class _UserAvatarState extends State<UserAvatar> {
  Uint8List? _bytes;
  String? _loadedUrl;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolve();
  }

  @override
  void didUpdateWidget(UserAvatar old) {
    super.didUpdateWidget(old);
    if (old.url != widget.url) _resolve();
  }

  void _resolve() {
    final url = widget.url;
    if (url == _loadedUrl && (_bytes != null || url == null)) return;
    _loadedUrl = url;
    if (url == null) {
      _bytes = null;
      return;
    }
    final cache = AppScope.of(context).avatars;
    _bytes = cache.peek(url);
    if (_bytes != null || cache.contains(url)) return;
    cache.load(url).then((b) {
      if (mounted && _loadedUrl == url && b != null) setState(() => _bytes = b);
    });
  }

  @override
  Widget build(BuildContext context) {
    final size = widget.size;
    final bytes = _bytes;
    final Widget inner = bytes != null
        ? Image.memory(
            bytes,
            width: size,
            height: size,
            fit: BoxFit.cover,
            gaplessPlayback: true,
            filterQuality: FilterQuality.medium,
            errorBuilder: (_, _, _) => _Initials(name: widget.name, size: size),
          )
        : _Initials(name: widget.name, size: size);
    return Semantics(
      label: 'Ảnh đại diện ${widget.name}',
      image: true,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: widget.borderColor == null || widget.borderWidth <= 0
              ? null
              : Border.all(color: widget.borderColor!, width: widget.borderWidth),
        ),
        child: ClipOval(child: inner),
      ),
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.name, required this.size});
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      color: Palette.red900,
      child: Text(
        initialsOf(name),
        style: TextStyle(fontSize: size * 0.4, color: Palette.goldLight, fontWeight: FontWeight.w800),
      ),
    );
  }
}

/// Biểu tượng cuộc trò chuyện: ảnh người kia (nhắn riêng), biểu tượng nhóm, ngôi sao (nhóm đơn vị).
class ConversationAvatar extends StatelessWidget {
  const ConversationAvatar({super.key, required this.conversation, this.size = 48});
  final Conversation conversation;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = conversation;
    return switch (c.type) {
      ConversationType.direct => UserAvatar(
        key: const Key('avatar-direct'),
        name: c.peer?.fullName ?? c.name,
        url: c.peer?.avatarUrl,
        size: size,
      ),
      ConversationType.group => Container(
        key: const Key('avatar-group'),
        width: size,
        height: size,
        decoration: const BoxDecoration(color: Palette.oliveLight, shape: BoxShape.circle),
        child: Icon(Icons.groups, color: Palette.olive, size: size * 0.56),
      ),
      ConversationType.unit => Container(
        key: const Key('avatar-unit'),
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          gradient: headerGradient,
          shape: BoxShape.circle,
          border: Border.all(color: Palette.gold, width: 1.5),
        ),
        child: Star(size: size * 0.5, color: Palette.goldLight),
      ),
    };
  }
}
