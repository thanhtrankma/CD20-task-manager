import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../services/app_services.dart';
import '../widgets/avatar.dart';
import '../widgets/chat_notice.dart';
import '../widgets/common.dart';
import 'pickers.dart' show unitsInScope;

/// Chọn một người (nhắn riêng) từ danh bạ trò chuyện. Trả về null khi hủy.
Future<UserBrief?> pickChatPerson(BuildContext context) => Navigator.of(context).push<UserBrief>(
  MaterialPageRoute(fullscreenDialog: true, builder: (_) => const DirectoryPickerScreen(title: 'Nhắn riêng')),
);

/// Chọn nhiều người (tạo nhóm, thêm thành viên). Trả về null khi hủy.
Future<List<UserBrief>?> pickChatPeople(
  BuildContext context, {
  required String title,
  List<UserBrief> selected = const [],
  Set<int> exclude = const {},
}) {
  return Navigator.of(context).push<List<UserBrief>>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => DirectoryPickerScreen(title: title, multiple: true, initial: selected, exclude: exclude),
    ),
  );
}

/// Danh bạ trò chuyện: GET /chat/directory?q= (tài khoản đang hoạt động, trừ quản trị và chính mình, tối đa 50).
class DirectoryPickerScreen extends StatefulWidget {
  const DirectoryPickerScreen({
    super.key,
    required this.title,
    this.multiple = false,
    this.initial = const [],
    this.exclude = const {},
  });

  final String title;
  final bool multiple;
  final List<UserBrief> initial;
  final Set<int> exclude;

  @override
  State<DirectoryPickerScreen> createState() => _DirectoryPickerScreenState();
}

class _DirectoryPickerScreenState extends State<DirectoryPickerScreen> {
  late final _selected = <int, UserBrief>{for (final u in widget.initial) u.id: u};
  final _query = TextEditingController();
  List<UserBrief>? _items;
  ApiException? _error;
  Timer? _debounce;
  int _generation = 0;
  bool _init = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final gen = ++_generation;
    try {
      final data = await AppScope.of(context).api.get('/chat/directory', query: {'q': _query.text.trim()});
      if (!mounted || gen != _generation) return;
      setState(() {
        _items = UserBrief.listFrom(data).where((u) => !widget.exclude.contains(u.id)).toList();
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted && gen == _generation) setState(() => _error = e);
    }
  }

  void _onQuery(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), _load);
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          if (widget.multiple)
            TextButton(
              key: const Key('picker-done'),
              style: TextButton.styleFrom(foregroundColor: Colors.white),
              onPressed: () => Navigator.pop(context, _selected.values.toList()),
              child: Text(_selected.isEmpty ? 'Xong' : 'Xong (${_selected.length})'),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
            child: TextField(
              key: const Key('directory-search'),
              controller: _query,
              onChanged: _onQuery,
              autocorrect: false,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) {
                _debounce?.cancel();
                _load();
              },
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Tìm theo họ tên, đơn vị',
                isDense: true,
              ),
            ),
          ),
          if (widget.multiple && _selected.isNotEmpty)
            SizedBox(
              height: 48,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  for (final u in _selected.values)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: InputChip(
                        avatar: UserAvatar(name: u.fullName, url: u.avatarUrl, size: 24),
                        label: Text(u.fullName),
                        onDeleted: () => setState(() => _selected.remove(u.id)),
                      ),
                    ),
                ],
              ),
            ),
          Expanded(
            child: items == null
                ? (_error == null
                      ? const Center(child: CircularProgressIndicator())
                      : CenterMessage(
                          icon: Icons.cloud_off,
                          text: _error!.message,
                          action: OutlinedButton(onPressed: _load, child: const Text('Thử lại')),
                        ))
                : items.isEmpty
                ? const CenterMessage(icon: Icons.person_search, text: 'Không tìm thấy cán bộ phù hợp')
                : ListView.builder(
                    itemCount: items.length,
                    itemBuilder: (context, i) {
                      final u = items[i];
                      final avatar = UserAvatar(name: u.fullName, url: u.avatarUrl, size: 40);
                      final subtitle = u.subtitle.isEmpty ? null : Text(u.subtitle);
                      if (!widget.multiple) {
                        return ListTile(
                          leading: avatar,
                          title: Text(u.rankName),
                          subtitle: subtitle,
                          onTap: () => Navigator.pop(context, u),
                        );
                      }
                      return CheckboxListTile(
                        secondary: avatar,
                        value: _selected.containsKey(u.id),
                        title: Text(u.rankName),
                        subtitle: subtitle,
                        onChanged: (v) => setState(() => v == true ? _selected[u.id] = u : _selected.remove(u.id)),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

/// Tạo nhóm tự đặt tên: POST /chat/groups {name, memberIds}. Trả về cuộc trò chuyện mới (null khi hủy).
class CreateGroupScreen extends StatefulWidget {
  const CreateGroupScreen({super.key});

  @override
  State<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends State<CreateGroupScreen> {
  final _name = TextEditingController();
  var _members = <UserBrief>[];
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final picked = await pickChatPeople(context, title: 'Chọn thành viên', selected: _members);
    if (picked != null && mounted) setState(() => _members = picked);
  }

  Future<void> _create() async {
    final name = _name.text.trim();
    if (name.isEmpty) return setState(() => _error = 'Đồng chí nhập tên nhóm');
    if (_members.isEmpty) return setState(() => _error = 'Đồng chí chọn ít nhất một thành viên');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await AppScope.of(context).api.post('/chat/groups', {
        'name': name,
        'memberIds': [for (final m in _members) m.id],
      });
      if (!mounted) return;
      Navigator.pop(context, Conversation.fromJson((data as Map).cast()));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tạo nhóm')),
      body: Column(
        children: [
          const ChatNotice(),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                TextField(
                  key: const Key('group-name'),
                  controller: _name,
                  maxLength: 100,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(labelText: 'Tên nhóm', hintText: 'Ví dụ: Tổ soạn đề thi học kỳ'),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Thành viên (${_members.length})',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    TextButton.icon(
                      key: const Key('group-pick'),
                      onPressed: _busy ? null : _pick,
                      icon: const Icon(Icons.person_add_alt),
                      label: const Text('Chọn người'),
                    ),
                  ],
                ),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final u in _members)
                      InputChip(
                        avatar: UserAvatar(name: u.fullName, url: u.avatarUrl, size: 24),
                        label: Text(u.fullName),
                        onDeleted: _busy ? null : () => setState(() => _members.remove(u)),
                      ),
                  ],
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 20),
                FilledButton.icon(
                  key: const Key('group-create'),
                  onPressed: _busy ? null : _create,
                  icon: _busy
                      ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.group_add),
                  label: const Text('Tạo nhóm'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Câu báo khi đơn vị đã có nhóm (máy chủ trả 409).
const unitGroupExists = 'Đơn vị này đã có nhóm';

/// Nhóm theo đơn vị (lãnh đạo: mọi đơn vị; chỉ huy đơn vị: đơn vị mình và trực thuộc; máy chủ vẫn kiểm tra, 403):
/// POST /chat/unit-groups {unitId, includeSubunits}. Thành viên do máy chủ tự cập nhật theo đơn vị của tài khoản.
class UnitGroupScreen extends StatefulWidget {
  const UnitGroupScreen({super.key});

  @override
  State<UnitGroupScreen> createState() => _UnitGroupScreenState();
}

class _UnitGroupScreenState extends State<UnitGroupScreen> {
  List<UnitOption>? _units;
  ApiException? _loadError;
  UnitOption? _unit;
  bool _includeSubunits = false;
  bool _busy = false;
  String? _error;
  bool _init = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _load();
  }

  Future<void> _load() async {
    final app = AppScope.of(context);
    try {
      final data = await app.api.get('/units');
      var units = UnitOption.listFrom(data);
      final me = app.auth.me;
      if (me != null && me.role == Role.unitHead && me.unitId != null) units = unitsInScope(units, me.unitId!);
      if (mounted) {
        setState(() {
          _units = units;
          _loadError = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _loadError = e);
    }
  }

  Future<void> _create() async {
    final unit = _unit;
    if (unit == null) return setState(() => _error = 'Đồng chí chọn đơn vị');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await AppScope.of(context).api
          .post('/chat/unit-groups', {'unitId': unit.id, 'includeSubunits': _includeSubunits});
      if (!mounted) return;
      Navigator.pop(context, Conversation.fromJson((data as Map).cast()));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.status == 409 ? unitGroupExists : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final units = _units;
    return Scaffold(
      appBar: AppBar(title: const Text('Nhóm theo đơn vị')),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ChatNotice(),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Text(
              'Mọi cán bộ của đơn vị tự có trong nhóm; chuyển đơn vị, khóa tài khoản thì tự ra khỏi nhóm. '
              'Mỗi đơn vị chỉ có một nhóm.',
              style: TextStyle(fontSize: 13),
            ),
          ),
          SwitchListTile(
            key: const Key('include-subunits'),
            title: const Text('Gồm cả đơn vị trực thuộc'),
            value: _includeSubunits,
            onChanged: _busy ? null : (v) => setState(() => _includeSubunits = v),
          ),
          const Divider(),
          Expanded(
            child: units == null
                ? (_loadError == null
                      ? const Center(child: CircularProgressIndicator())
                      : CenterMessage(
                          icon: Icons.cloud_off,
                          text: _loadError!.message,
                          action: OutlinedButton(onPressed: _load, child: const Text('Thử lại')),
                        ))
                : RadioGroup<int>(
                    groupValue: _unit?.id,
                    onChanged: (id) => setState(() => _unit = units.firstWhere((u) => u.id == id)),
                    child: ListView(
                      children: [for (final u in units) RadioListTile<int>(value: u.id, title: Text(u.name))],
                    ),
                  ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(
                _error!,
                key: const Key('unit-group-error'),
                style: TextStyle(color: Theme.of(context).colorScheme.error, fontWeight: FontWeight.w600),
              ),
            ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: FilledButton.icon(
                key: const Key('unit-group-create'),
                onPressed: _busy || units == null ? null : _create,
                icon: const Icon(Icons.groups),
                label: const Text('Tạo nhóm đơn vị'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
