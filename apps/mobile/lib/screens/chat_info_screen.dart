import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../services/app_services.dart';
import '../theme.dart';
import '../widgets/avatar.dart';
import '../widgets/chat_notice.dart';
import '../widgets/common.dart';
import 'chat_create.dart';

/// Thông tin cuộc trò chuyện: thành viên, đổi tên, thêm / bớt người, rời nhóm, tắt thông báo, gồm đơn vị trực thuộc.
/// Các nút hiện theo quyền máy chủ trả về (`canManage`, `canAddMembers`, `canLeave`); máy chủ vẫn kiểm tra.
/// Rời nhóm thì đóng màn hình với kết quả `'left'`.
class ChatInfoScreen extends StatefulWidget {
  const ChatInfoScreen({super.key, required this.conversationId});
  final int conversationId;

  @override
  State<ChatInfoScreen> createState() => _ChatInfoScreenState();
}

class _ChatInfoScreenState extends State<ChatInfoScreen> {
  late AppServices _app;
  ConversationDetail? _detail;
  ApiException? _error;
  bool _busy = false;
  bool _init = false;

  int get _id => widget.conversationId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _app = AppScope.of(context);
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await _app.api.get('/chat/conversations/$_id');
      if (!mounted) return;
      setState(() {
        _detail = ConversationDetail.fromJson((data as Map).cast());
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  /// Chạy một thao tác, báo lỗi máy chủ, tải lại.
  Future<bool> _run(Future<void> Function() action, {String? done}) async {
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return true;
      if (done != null) showMessage(context, done);
      await _load();
      return true;
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _rename() async {
    final c = _detail!.conversation;
    final name = await showDialog<String>(
      context: context,
      builder: (_) => _RenameDialog(initial: c.name),
    );
    if (name == null || name == c.name || !mounted) return;
    await _run(() => _app.api.patch('/chat/conversations/$_id', {'name': name}), done: 'Đã đổi tên nhóm');
  }

  Future<void> _setMuted(bool muted) => _run(
    () => _app.api.post('/chat/conversations/$_id/mute', {'muted': muted}),
    done: muted ? 'Đã tắt thông báo cuộc trò chuyện này' : 'Đã bật thông báo',
  );

  Future<void> _setSubunits(bool v) => _run(() => _app.api.patch('/chat/conversations/$_id', {'includeSubunits': v}));

  Future<void> _addMembers() async {
    final d = _detail!;
    final picked = await pickChatPeople(context, title: 'Thêm thành viên', exclude: {for (final m in d.members) m.id});
    if (picked == null || picked.isEmpty || !mounted) return;
    await _run(
      () => _app.api.post('/chat/conversations/$_id/members', {
        'userIds': [for (final u in picked) u.id],
      }),
      done: 'Đã thêm ${picked.length} thành viên',
    );
  }

  Future<void> _remove(ChatMember m) async {
    final ok = await _confirm('Bớt ${m.user.fullName} khỏi nhóm?', 'Bớt khỏi nhóm');
    if (!ok || !mounted) return;
    await _run(() => _app.api.delete('/chat/conversations/$_id/members/${m.id}'), done: 'Đã bớt khỏi nhóm');
  }

  Future<void> _leave() async {
    final me = _app.chat.meId;
    if (me == null) return;
    final ok = await _confirm('Rời nhóm?', 'Rời nhóm', text: 'Đồng chí sẽ không nhận tin nhắn của nhóm này nữa.');
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await _app.api.delete('/chat/conversations/$_id/members/$me');
      unawaited(_app.chat.refreshUnread());
      if (mounted) Navigator.of(context).pop('left');
    } on ApiException catch (e) {
      if (mounted) {
        showError(context, e);
        setState(() => _busy = false);
      }
    }
  }

  Future<bool> _confirm(String title, String action, {String? text}) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: text == null ? null : Text(text),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(action)),
        ],
      ),
    );
    return ok == true;
  }

  @override
  Widget build(BuildContext context) {
    final d = _detail;
    return Scaffold(
      appBar: AppBar(title: Text(d?.conversation.isDirect == true ? 'Thông tin' : 'Thông tin nhóm')),
      body: Column(
        children: [
          const ChatNotice(),
          if (_busy) const LinearProgressIndicator(minHeight: 2),
          Expanded(
            child: d == null
                ? (_error == null
                      ? const Center(child: CircularProgressIndicator())
                      : CenterMessage(
                          icon: Icons.cloud_off,
                          text: _error!.message,
                          action: OutlinedButton(onPressed: _load, child: const Text('Thử lại')),
                        ))
                : RefreshIndicator(onRefresh: _load, child: _content(d)),
          ),
        ],
      ),
    );
  }

  Widget _content(ConversationDetail d) {
    final c = d.conversation;
    final me = _app.chat.meId;
    final typeLabel = switch (c.type) {
      ConversationType.direct => 'Nhắn riêng',
      ConversationType.group => 'Nhóm',
      ConversationType.unit => c.includeSubunits ? 'Nhóm đơn vị (gồm đơn vị trực thuộc)' : 'Nhóm đơn vị',
    };
    final members = [...d.members]
      ..sort((a, b) {
        if (a.isOwner != b.isOwner) return a.isOwner ? -1 : 1;
        return a.user.fullName.compareTo(b.user.fullName);
      });
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        const SizedBox(height: 16),
        Center(child: ConversationAvatar(conversation: c, size: 72)),
        const SizedBox(height: 10),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(
            c.name,
            key: const Key('info-name'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
          ),
        ),
        Text(
          '$typeLabel · ${d.members.length} thành viên',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Palette.muted),
        ),
        const SizedBox(height: 8),
        if (d.canManage && !c.isDirect)
          ListTile(
            key: const Key('info-rename'),
            leading: const Icon(Icons.edit_outlined),
            title: const Text('Đổi tên nhóm'),
            onTap: _busy ? null : _rename,
          ),
        SwitchListTile(
          key: const Key('info-mute'),
          secondary: const Icon(Icons.notifications_off_outlined),
          title: const Text('Tắt thông báo'),
          subtitle: const Text('Không nhận thông báo đẩy của cuộc trò chuyện này'),
          value: c.muted,
          onChanged: _busy ? null : _setMuted,
        ),
        if (c.type == ConversationType.unit)
          SwitchListTile(
            key: const Key('info-subunits'),
            secondary: const Icon(Icons.account_tree_outlined),
            title: const Text('Gồm cả đơn vị trực thuộc'),
            value: c.includeSubunits,
            onChanged: d.canManage && !_busy ? _setSubunits : null,
          ),
        const Divider(),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Thành viên (${d.members.length})',
                  style: const TextStyle(fontWeight: FontWeight.w800, color: Palette.red800),
                ),
              ),
              if (d.canAddMembers && !c.isDirect)
                TextButton.icon(
                  key: const Key('info-add'),
                  onPressed: _busy ? null : _addMembers,
                  icon: const Icon(Icons.person_add_alt),
                  label: const Text('Thêm'),
                ),
            ],
          ),
        ),
        for (final m in members)
          ListTile(
            key: Key('member-${m.id}'),
            leading: UserAvatar(name: m.user.fullName, url: m.user.avatarUrl, size: 40),
            title: Text(m.id == me ? '${m.user.rankName} (tôi)' : m.user.rankName),
            subtitle: m.user.subtitle.isEmpty ? null : Text(m.user.subtitle),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (m.isOwner && !c.isDirect)
                  const Pill('Trưởng nhóm', bg: Palette.red50, fg: Palette.red800, icon: Icons.star_outline),
                if (d.canManage && c.type == ConversationType.group && m.id != me)
                  IconButton(
                    key: Key('remove-${m.id}'),
                    tooltip: 'Bớt khỏi nhóm',
                    icon: const Icon(Icons.person_remove_outlined),
                    onPressed: _busy ? null : () => _remove(m),
                  ),
              ],
            ),
          ),
        if (d.canLeave && !c.isDirect) ...[
          const Divider(),
          ListTile(
            key: const Key('info-leave'),
            leading: Icon(Icons.logout, color: Theme.of(context).colorScheme.error),
            title: Text('Rời nhóm', style: TextStyle(color: Theme.of(context).colorScheme.error)),
            onTap: _busy ? null : _leave,
          ),
        ],
      ],
    );
  }
}

class _RenameDialog extends StatefulWidget {
  const _RenameDialog({required this.initial});
  final String initial;

  @override
  State<_RenameDialog> createState() => _RenameDialogState();
}

class _RenameDialogState extends State<_RenameDialog> {
  late final _name = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Đổi tên nhóm'),
      content: TextField(
        key: const Key('rename-field'),
        controller: _name,
        autofocus: true,
        maxLength: 100,
        decoration: const InputDecoration(labelText: 'Tên nhóm'),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Hủy')),
        ListenableBuilder(
          listenable: _name,
          builder: (context, _) => FilledButton(
            onPressed: _name.text.trim().isEmpty ? null : () => Navigator.pop(context, _name.text.trim()),
            child: const Text('Lưu'),
          ),
        ),
      ],
    );
  }
}
