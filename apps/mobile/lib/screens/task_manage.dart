import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../constants.dart';
import '../models/models.dart';
import '../services/app_services.dart';
import '../util/format.dart';
import '../util/task_forms.dart';
import 'pickers.dart';
import 'task_sheets.dart' show showActionSheet;

const _sourceHelp = 'Số, ký hiệu, ngày văn bản hoặc kết luận giao ban. Không ghi nội dung thuộc bí mật nhà nước.';

/// Giao nhanh (lãnh đạo, chỉ huy đơn vị) hoặc chia việc con ([parentId]). Trả về mã nhiệm vụ vừa tạo.
Future<int?> showQuickAssign(BuildContext context, {int? parentId, DateTime? parentDue, String? parentTitle}) {
  return showActionSheet<int>(
    context,
    title: parentId == null ? 'Giao nhanh nhiệm vụ' : 'Chia việc con',
    child: QuickAssignForm(parentId: parentId, parentDue: parentDue, parentTitle: parentTitle),
  );
}

class _PriorityChips extends StatelessWidget {
  const _PriorityChips({required this.value, required this.onChanged});
  final Priority value;
  final ValueChanged<Priority>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(spacing: 8, runSpacing: 4, children: [
      for (final p in Priority.values)
        ChoiceChip(
          label: Text(priorityTone[p]!.label),
          selected: value == p,
          onSelected: onChanged == null ? null : (_) => onChanged!(p),
        ),
    ]);
  }
}

class _DueButton extends StatelessWidget {
  const _DueButton({required this.value, required this.onChanged, this.firstDate});
  final DateTime value;
  final ValueChanged<DateTime>? onChanged;
  final DateTime? firstDate;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      icon: const Icon(Icons.event),
      label: Text('Hạn hoàn thành: ${formatDate(value)}'),
      onPressed: onChanged == null
          ? null
          : () async {
              final now = DateTime.now();
              final first = firstDate ?? DateTime(now.year, now.month, now.day);
              final initial = value.isBefore(first) ? first : value;
              final d = await showDatePicker(
                context: context,
                initialDate: initial,
                firstDate: first,
                lastDate: DateTime(now.year + 3, 12, 31),
                helpText: 'Hạn hoàn thành',
              );
              if (d != null) onChanged!(endOfDay(d));
            },
    );
  }
}

class QuickAssignForm extends StatefulWidget {
  const QuickAssignForm({super.key, this.parentId, this.parentDue, this.parentTitle});
  final int? parentId;
  final DateTime? parentDue;
  final String? parentTitle;

  @override
  State<QuickAssignForm> createState() => _QuickAssignFormState();
}

class _QuickAssignFormState extends State<QuickAssignForm> {
  late final _draft = QuickAssignDraft(parentId: widget.parentId, parentDue: widget.parentDue);
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _source = TextEditingController();
  bool _busy = false;
  bool _more = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _source.dispose();
    super.dispose();
  }

  Future<void> _pickAssignees() async {
    final r = await pickUsers(context, title: 'Chọn người chủ trì', selected: _draft.assignees);
    if (r != null && mounted) {
      setState(() => _draft.assignees
        ..clear()
        ..addAll(r));
    }
  }

  Future<void> _pickUnits() async {
    final r = await pickUnits(context, selected: _draft.units);
    if (r != null && mounted) {
      setState(() => _draft.units
        ..clear()
        ..addAll(r));
    }
  }

  Future<void> _pickFollowers() async {
    final me = AppScope.of(context).auth.me;
    final r = await pickUsers(context,
        title: 'Chọn người theo dõi', selected: _draft.followers, exclude: {if (me != null) me.id});
    if (r != null && mounted) {
      setState(() => _draft.followers
        ..clear()
        ..addAll(r));
    }
  }

  Future<void> _submit() async {
    _draft
      ..title = _title.text
      ..description = _description.text
      ..source = _source.text;
    final err = _draft.validate();
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final app = AppScope.of(context);
    try {
      final r = await app.api.post('/tasks', _draft.toJson());
      app.events.changed();
      if (!mounted) return;
      final id = r is Map && r['id'] is num ? (r['id'] as num).toInt() : null;
      Navigator.pop(context, id ?? 0);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          // 403 ngoài phạm vi: máy chủ trả câu "Chỉ được giao việc trong phạm vi đơn vị mình".
          _error = e.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final recipients = [
      for (final u in _draft.units)
        InputChip(
          avatar: const Icon(Icons.apartment, size: 18),
          label: Text(u.name),
          onDeleted: _busy ? null : () => setState(() => _draft.units.remove(u)),
        ),
      for (final u in _draft.assignees)
        InputChip(
          avatar: const Icon(Icons.person, size: 18),
          label: Text(u.fullName),
          onDeleted: _busy ? null : () => setState(() => _draft.assignees.remove(u)),
        ),
    ];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (widget.parentTitle != null) ...[
        Text('Thuộc việc: ${widget.parentTitle}', style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 8),
      ],
      TextField(
        key: const Key('qa-title'),
        controller: _title,
        enabled: !_busy,
        maxLength: maxTitle,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(labelText: 'Tên nhiệm vụ', border: OutlineInputBorder()),
      ),
      Text('Chủ trì', style: theme.textTheme.labelLarge),
      const SizedBox(height: 4),
      if (recipients.isNotEmpty) Wrap(spacing: 6, runSpacing: 4, children: recipients),
      Wrap(spacing: 8, children: [
        TextButton.icon(
          onPressed: _busy ? null : _pickAssignees,
          icon: const Icon(Icons.person_add_alt),
          label: const Text('Chọn người'),
        ),
        TextButton.icon(
          onPressed: _busy ? null : _pickUnits,
          icon: const Icon(Icons.apartment),
          label: const Text('Chọn đơn vị'),
        ),
      ]),
      const SizedBox(height: 8),
      _DueButton(value: _draft.dueDate, onChanged: _busy ? null : (d) => setState(() => _draft.dueDate = d)),
      const SizedBox(height: 12),
      Text('Mức độ ưu tiên', style: theme.textTheme.labelLarge),
      const SizedBox(height: 4),
      _PriorityChips(value: _draft.priority, onChanged: _busy ? null : (p) => setState(() => _draft.priority = p)),
      const SizedBox(height: 8),
      if (!_more)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => _more = true),
            icon: const Icon(Icons.expand_more),
            label: const Text('Thêm nội dung, căn cứ, người theo dõi'),
          ),
        )
      else ...[
        const SizedBox(height: 4),
        TextField(
          controller: _description,
          enabled: !_busy,
          minLines: 2,
          maxLines: 5,
          maxLength: maxDescription,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
              labelText: 'Nội dung, yêu cầu (không bắt buộc)', alignLabelWithHint: true, border: OutlineInputBorder()),
        ),
        TextField(
          key: const Key('qa-source'),
          controller: _source,
          enabled: !_busy,
          maxLength: maxSource,
          decoration: const InputDecoration(
            labelText: 'Căn cứ giao nhiệm vụ (không bắt buộc)',
            helperText: _sourceHelp,
            helperMaxLines: 3,
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        Text('Người theo dõi', style: theme.textTheme.labelLarge),
        if (_draft.followers.isNotEmpty)
          Wrap(spacing: 6, runSpacing: 4, children: [
            for (final u in _draft.followers)
              InputChip(
                label: Text(u.fullName),
                onDeleted: _busy ? null : () => setState(() => _draft.followers.remove(u)),
              ),
          ]),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: _busy ? null : _pickFollowers,
            icon: const Icon(Icons.visibility_outlined),
            label: const Text('Chọn người theo dõi'),
          ),
        ),
      ],
      if (_error != null) ...[
        const SizedBox(height: 8),
        Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
      ],
      const SizedBox(height: 12),
      FilledButton.icon(
        onPressed: _busy ? null : _submit,
        icon: _busy
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.send),
        label: Text(widget.parentId == null ? 'Giao nhiệm vụ' : 'Giao việc con'),
      ),
      const SizedBox(height: 8),
      const Text(securityNotice, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Color(0xFF9A3412))),
    ]);
  }
}

/// Sửa nhiệm vụ (người giao). Trả về true nếu đã lưu.
Future<bool?> showEditTask(BuildContext context, TaskDetail task) {
  return showActionSheet<bool>(context, title: 'Sửa nhiệm vụ', child: TaskEditForm(task: task));
}

class TaskEditForm extends StatefulWidget {
  const TaskEditForm({super.key, required this.task});
  final TaskDetail task;

  @override
  State<TaskEditForm> createState() => _TaskEditFormState();
}

class _TaskEditFormState extends State<TaskEditForm> {
  late final _draft = TaskEditDraft.fromTask(widget.task);
  late final _title = TextEditingController(text: _draft.title);
  late final _description = TextEditingController(text: _draft.description);
  late final _source = TextEditingController(text: _draft.source);
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _source.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    _draft
      ..title = _title.text
      ..description = _description.text
      ..source = _source.text;
    final err = _draft.validate();
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    final changes = _draft.changes();
    if (changes.isEmpty) {
      Navigator.pop(context, false);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final app = AppScope.of(context);
    try {
      await app.api.patch('/tasks/${widget.task.id}', changes);
      app.events.changed();
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final today = DateTime.now();
    final originalDay = _draft.originalDue.toLocal();
    final first = DateTime(today.year, today.month, today.day);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      TextField(
        key: const Key('edit-title'),
        controller: _title,
        enabled: !_busy,
        maxLength: maxTitle,
        decoration: const InputDecoration(labelText: 'Tên nhiệm vụ', border: OutlineInputBorder()),
      ),
      TextField(
        controller: _description,
        enabled: !_busy,
        minLines: 2,
        maxLines: 6,
        maxLength: maxDescription,
        decoration: const InputDecoration(labelText: 'Nội dung, yêu cầu', alignLabelWithHint: true, border: OutlineInputBorder()),
      ),
      TextField(
        controller: _source,
        enabled: !_busy,
        maxLength: maxSource,
        decoration: const InputDecoration(
          labelText: 'Căn cứ giao nhiệm vụ',
          helperText: _sourceHelp,
          helperMaxLines: 3,
          border: OutlineInputBorder(),
        ),
      ),
      const SizedBox(height: 8),
      _DueButton(
        value: _draft.dueDate,
        firstDate: originalDay.isBefore(first) ? DateTime(originalDay.year, originalDay.month, originalDay.day) : first,
        onChanged: _busy
            ? null
            : (d) => setState(() => _draft.dueDate = sameDay(d, _draft.originalDue) ? _draft.originalDue.toLocal() : d),
      ),
      if (!sameDay(_draft.dueDate, _draft.originalDue))
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text('Người thực hiện, người theo dõi sẽ nhận thông báo đổi hạn.',
              style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant)),
        ),
      const SizedBox(height: 12),
      Text('Mức độ ưu tiên', style: theme.textTheme.labelLarge),
      const SizedBox(height: 4),
      _PriorityChips(value: _draft.priority, onChanged: _busy ? null : (p) => setState(() => _draft.priority = p)),
      if (_error != null) ...[
        const SizedBox(height: 8),
        Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
      ],
      const SizedBox(height: 12),
      FilledButton(onPressed: _busy ? null : _save, child: const Text('Lưu')),
    ]);
  }
}
