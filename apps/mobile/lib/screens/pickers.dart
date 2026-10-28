import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';

/// Chọn nhiều người (GET /users?q=, máy chủ đã giới hạn theo phạm vi được giao việc). Trả về null khi hủy.
Future<List<UserOption>?> pickUsers(
  BuildContext context, {
  required String title,
  List<UserOption> selected = const [],
  Set<int> exclude = const {},
}) {
  return Navigator.of(context).push<List<UserOption>>(MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => UserPickerScreen(title: title, initial: selected, exclude: exclude),
  ));
}

class UserPickerScreen extends StatefulWidget {
  const UserPickerScreen({super.key, required this.title, this.initial = const [], this.exclude = const {}});
  final String title;
  final List<UserOption> initial;
  final Set<int> exclude;

  @override
  State<UserPickerScreen> createState() => _UserPickerScreenState();
}

class _UserPickerScreenState extends State<UserPickerScreen> {
  late final _selected = <int, UserOption>{for (final u in widget.initial) u.id: u};
  final _query = TextEditingController();
  List<UserOption>? _items;
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
      final q = _query.text.trim();
      final data = await AppScope.of(context).api.get('/users', query: {'q': q});
      if (!mounted || gen != _generation) return;
      setState(() {
        _items = UserOption.listFrom(data).where((u) => !widget.exclude.contains(u.id)).toList();
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
          TextButton(
            onPressed: () => Navigator.pop(context, _selected.values.toList()),
            child: Text(_selected.isEmpty ? 'Xong' : 'Xong (${_selected.length})'),
          ),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: TextField(
            controller: _query,
            onChanged: _onQuery,
            autofocus: false,
            textInputAction: TextInputAction.search,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Tìm theo họ tên, tên đăng nhập',
              border: OutlineInputBorder(),
              isDense: true,
            ),
          ),
        ),
        if (_selected.isNotEmpty)
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
                        return CheckboxListTile(
                          value: _selected.containsKey(u.id),
                          title: Text(u.fullName),
                          subtitle: u.subtitle.isEmpty ? null : Text(u.subtitle),
                          onChanged: (v) => setState(() => v == true ? _selected[u.id] = u : _selected.remove(u.id)),
                        );
                      },
                    ),
        ),
      ]),
    );
  }
}

/// Chọn đơn vị nhận việc (GET /units). Chỉ huy đơn vị chỉ thấy đơn vị mình và đơn vị trực thuộc;
/// máy chủ vẫn kiểm tra phạm vi (403).
Future<List<UnitOption>?> pickUnits(BuildContext context, {List<UnitOption> selected = const []}) {
  return Navigator.of(context).push<List<UnitOption>>(MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => UnitPickerScreen(initial: selected),
  ));
}

/// Đơn vị [rootId] và các đơn vị trực thuộc (mọi cấp).
List<UnitOption> unitsInScope(List<UnitOption> all, int rootId) {
  final ids = <int>{rootId};
  var changed = true;
  while (changed) {
    changed = false;
    for (final u in all) {
      if (u.parentId != null && ids.contains(u.parentId) && ids.add(u.id)) changed = true;
    }
  }
  return all.where((u) => ids.contains(u.id)).toList();
}

class UnitPickerScreen extends StatefulWidget {
  const UnitPickerScreen({super.key, this.initial = const []});
  final List<UnitOption> initial;

  @override
  State<UnitPickerScreen> createState() => _UnitPickerScreenState();
}

class _UnitPickerScreenState extends State<UnitPickerScreen> {
  late final _selected = <int, UnitOption>{for (final u in widget.initial) u.id: u};
  List<UnitOption>? _items;
  ApiException? _error;
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
      if (mounted) setState(() => _items = units);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chọn đơn vị chủ trì'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, _selected.values.toList()),
            child: Text(_selected.isEmpty ? 'Xong' : 'Xong (${_selected.length})'),
          ),
        ],
      ),
      body: items == null
          ? (_error == null
              ? const Center(child: CircularProgressIndicator())
              : CenterMessage(icon: Icons.cloud_off, text: _error!.message))
          : ListView(children: [
              for (final u in items)
                CheckboxListTile(
                  value: _selected.containsKey(u.id),
                  title: Text(u.name),
                  onChanged: (v) => setState(() => v == true ? _selected[u.id] = u : _selected.remove(u.id)),
                ),
            ]),
    );
  }
}
