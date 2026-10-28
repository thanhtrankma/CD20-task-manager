import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/app_services.dart';
import '../services/attachments.dart';
import '../util/format.dart';
import '../widgets/common.dart';

/// Khung bảng trượt từ dưới lên, tự đẩy lên khi bàn phím mở.
Future<T?> showActionSheet<T>(BuildContext context, {required String title, required Widget child}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    ),
  );
}

/// Hộp xác nhận có ô ghi chú tùy chọn. Trả về null khi hủy, chuỗi (có thể rỗng) khi đồng ý.
Future<String?> askNote(
  BuildContext context, {
  required String title,
  required String confirm,
  String? message,
  String hint = 'Ghi chú (không bắt buộc)',
  bool destructive = false,
  bool withNote = true,
}) {
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (message != null) Text(message),
          if (withNote) ...[
            if (message != null) const SizedBox(height: 12),
            TextField(
              controller: controller,
              maxLines: 3,
              minLines: 2,
              maxLength: 2000,
              decoration: InputDecoration(hintText: hint, border: const OutlineInputBorder()),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
        FilledButton(
          style: destructive ? FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error) : null,
          onPressed: () => Navigator.pop(ctx, controller.text.trim()),
          child: Text(confirm),
        ),
      ],
    ),
  ).whenComplete(controller.dispose);
}

/// Cập nhật tiến độ: thanh kéo 0–100 (bước 5) và ghi chú.
class ProgressForm extends StatefulWidget {
  const ProgressForm({super.key, required this.initial, required this.onSubmit});
  final int initial;
  final Future<bool> Function(int progress, String? note) onSubmit;

  @override
  State<ProgressForm> createState() => _ProgressFormState();
}

class _ProgressFormState extends State<ProgressForm> {
  late double _value = widget.initial.clamp(0, 100).toDouble();
  final _note = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        const Text('Tiến độ'),
        const Spacer(),
        Text('${_value.round()}%', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
      ]),
      Slider(
        value: _value,
        max: 100,
        divisions: 20,
        label: '${_value.round()}%',
        onChanged: _busy ? null : (v) => setState(() => _value = v),
      ),
      Wrap(spacing: 8, children: [
        for (final p in [25, 50, 75, 100])
          ChoiceChip(
            label: Text('$p%'),
            selected: _value.round() == p,
            onSelected: _busy ? null : (_) => setState(() => _value = p.toDouble()),
          ),
      ]),
      const SizedBox(height: 12),
      TextField(
        controller: _note,
        maxLines: 3,
        minLines: 2,
        maxLength: 5000,
        decoration: const InputDecoration(labelText: 'Ghi chú (không bắt buộc)', border: OutlineInputBorder()),
      ),
      const SizedBox(height: 8),
      FilledButton(
        onPressed: _busy
            ? null
            : () async {
                setState(() => _busy = true);
                final note = _note.text.trim();
                final ok = await widget.onSubmit(_value.round(), note.isEmpty ? null : note);
                if (!context.mounted) return;
                if (ok) {
                  Navigator.pop(context);
                } else {
                  setState(() => _busy = false);
                }
              },
        child: const Text('Cập nhật'),
      ),
    ]);
  }
}

/// Nộp báo cáo kết quả: nội dung và tệp đính kèm (chụp ảnh, ảnh có sẵn, tệp văn bản).
/// Tệp được tải lên ngay khi chọn (POST /files?taskId=), báo cáo gửi kèm mã các tệp.
class SubmissionForm extends StatefulWidget {
  const SubmissionForm({super.key, required this.taskId, required this.onSubmit});
  final int taskId;
  final Future<bool> Function(String content, List<int> attachmentIds) onSubmit;

  @override
  State<SubmissionForm> createState() => _SubmissionFormState();
}

class _SubmissionFormState extends State<SubmissionForm> {
  final _content = TextEditingController();
  final _files = <FileRef>[];
  int _uploading = 0;
  bool _busy = false;

  @override
  void dispose() {
    _content.dispose();
    super.dispose();
  }

  Future<void> _add(Future<PickedFile?> Function(AttachmentService s) pick) async {
    final service = AppScope.of(context).files;
    try {
      final picked = await pick(service);
      if (picked == null || !mounted) return;
      setState(() => _uploading++);
      final ref = await service.upload(widget.taskId, picked);
      if (mounted) setState(() => _files.add(ref));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted && _uploading > 0) setState(() => _uploading--);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSend = !_busy && _uploading == 0;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      TextField(
        controller: _content,
        maxLines: 6,
        minLines: 3,
        maxLength: 20000,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(
          labelText: 'Nội dung báo cáo',
          alignLabelWithHint: true,
          border: OutlineInputBorder(),
        ),
      ),
      Wrap(spacing: 8, runSpacing: 4, children: [
        OutlinedButton.icon(
          onPressed: _busy ? null : () => _add((s) => s.pickPhoto()),
          icon: const Icon(Icons.photo_camera_outlined),
          label: const Text('Chụp ảnh'),
        ),
        OutlinedButton.icon(
          onPressed: _busy ? null : () => _add((s) => s.pickPhoto(camera: false)),
          icon: const Icon(Icons.photo_library_outlined),
          label: const Text('Ảnh có sẵn'),
        ),
        OutlinedButton.icon(
          onPressed: _busy ? null : () => _add((s) => s.pickDocument()),
          icon: const Icon(Icons.attach_file),
          label: const Text('Chọn tệp'),
        ),
      ]),
      if (_uploading > 0)
        const Padding(
          padding: EdgeInsets.only(top: 8),
          child: Row(children: [
            SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 8),
            Text('Đang tải tệp lên...'),
          ]),
        ),
      for (final f in _files)
        ListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.insert_drive_file_outlined),
          title: Text(f.originalName, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text(formatSize(f.size)),
          trailing: IconButton(
            tooltip: 'Bỏ tệp',
            icon: const Icon(Icons.close),
            onPressed: _busy ? null : () => setState(() => _files.remove(f)),
          ),
        ),
      const SizedBox(height: 12),
      FilledButton.icon(
        onPressed: canSend
            ? () async {
                final content = _content.text.trim();
                if (content.isEmpty) {
                  showError(context, 'Đồng chí nhập nội dung báo cáo');
                  return;
                }
                setState(() => _busy = true);
                final ok = await widget.onSubmit(content, _files.map((f) => f.id).toList());
                if (!context.mounted) return;
                if (ok) {
                  Navigator.pop(context);
                } else {
                  setState(() => _busy = false);
                }
              }
            : null,
        icon: const Icon(Icons.send),
        label: const Text('Nộp báo cáo'),
      ),
    ]);
  }
}

/// Xin gia hạn: chọn hạn mới (sau hạn hiện tại) và lý do.
class ExtensionForm extends StatefulWidget {
  const ExtensionForm({super.key, required this.dueDate, required this.onSubmit});
  final DateTime dueDate;
  final Future<bool> Function(DateTime newDueDate, String reason) onSubmit;

  @override
  State<ExtensionForm> createState() => _ExtensionFormState();
}

class _ExtensionFormState extends State<ExtensionForm> {
  DateTime? _date;
  final _reason = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final due = widget.dueDate.toLocal();
    final first = DateTime(due.year, due.month, due.day + 1);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Hạn hiện tại: ${formatDateTime(due)}'),
      const SizedBox(height: 12),
      OutlinedButton.icon(
        icon: const Icon(Icons.event),
        label: Text(_date == null ? 'Chọn hạn mới' : 'Hạn mới: ${formatDate(_date)}'),
        onPressed: _busy
            ? null
            : () async {
                final d = await showDatePicker(
                  context: context,
                  initialDate: _date ?? first,
                  firstDate: first,
                  lastDate: DateTime(first.year + 2, first.month, first.day),
                  helpText: 'Đề nghị hạn mới',
                );
                if (d != null) setState(() => _date = d);
              },
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _reason,
        maxLines: 3,
        minLines: 2,
        maxLength: 2000,
        decoration: const InputDecoration(labelText: 'Lý do', border: OutlineInputBorder()),
      ),
      const SizedBox(height: 8),
      FilledButton(
        onPressed: _busy
            ? null
            : () async {
                final reason = _reason.text.trim();
                if (_date == null) {
                  showError(context, 'Đồng chí chọn hạn mới');
                  return;
                }
                if (reason.length < 3) {
                  showError(context, 'Lý do cần ít nhất 3 ký tự');
                  return;
                }
                setState(() => _busy = true);
                // Cuối ngày được chọn (như bản web).
                final d = _date!;
                final ok = await widget.onSubmit(DateTime(d.year, d.month, d.day, 23, 59, 59, 999), reason);
                if (!context.mounted) return;
                if (ok) {
                  Navigator.pop(context);
                } else {
                  setState(() => _busy = false);
                }
              },
        child: const Text('Gửi đề nghị'),
      ),
    ]);
  }
}
