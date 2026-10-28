import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../constants.dart';
import '../models/models.dart';
import '../services/app_services.dart';
import '../util/activity.dart';
import '../util/due.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import 'pickers.dart';
import 'task_manage.dart';
import 'task_sheets.dart';
import 'tasks_screen.dart' show openTask;

/// Chi tiết nhiệm vụ (GET /tasks/:id) và các thao tác một chạm theo quyền.
class TaskDetailScreen extends StatefulWidget {
  const TaskDetailScreen({super.key, required this.taskId});
  final int taskId;

  @override
  State<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends State<TaskDetailScreen> {
  TaskDetail? _task;
  ApiException? _error;
  bool _busy = false;
  final _comment = TextEditingController();
  late AppServices _app;
  bool _init = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    _app = AppScope.of(context);
    _load();
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await _app.api.get('/tasks/${widget.taskId}');
      if (mounted) {
        setState(() {
          _task = TaskDetail.fromJson((data as Map).cast());
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  /// Chạy một thao tác: báo kết quả, tải lại chi tiết và các danh sách. Trả về true nếu thành công.
  Future<bool> _run(Future<void> Function() action, String success) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted && success.isNotEmpty) showMessage(context, success);
      _app.events.changed();
      await _load();
      return true;
    } catch (e) {
      if (mounted) showError(context, e);
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String get _base => '/tasks/${widget.taskId}';

  // ---------- Thao tác ----------

  Future<void> _acknowledge() => _run(() => _app.api.post('$_base/acknowledge'), 'Đã xác nhận nhận nhiệm vụ');

  Future<void> _progress(TaskDetail t) => showActionSheet(
        context,
        title: 'Cập nhật tiến độ',
        child: ProgressForm(
          initial: t.row.progress,
          onSubmit: (p, note) =>
              _run(() => _app.api.post('$_base/progress', {'progress': p, 'note': ?note}), 'Đã cập nhật tiến độ'),
        ),
      );

  Future<void> _submit() => showActionSheet(
        context,
        title: 'Nộp báo cáo kết quả',
        child: SubmissionForm(
          taskId: widget.taskId,
          onSubmit: (content, ids) => _run(
            () => _app.api.post('$_base/submissions', {'content': content, if (ids.isNotEmpty) 'attachmentIds': ids}),
            'Đã nộp báo cáo',
          ),
        ),
      );

  Future<void> _extension(TaskDetail t) => showActionSheet(
        context,
        title: 'Xin gia hạn',
        child: ExtensionForm(
          dueDate: t.row.dueDate,
          onSubmit: (date, reason) => _run(
            () => _app.api.post('$_base/extensions', {'newDueDate': date.toUtc().toIso8601String(), 'reason': reason}),
            'Đã gửi đề nghị gia hạn',
          ),
        ),
      );

  Future<void> _nudge() async {
    final ok = await askNote(
      context,
      title: 'Nhắc người thực hiện khẩn trương?',
      message: 'Người thực hiện nhận thông báo ngay (tối đa 3 lần mỗi ngày).',
      confirm: 'Đôn đốc',
      withNote: false,
    );
    if (ok == null) return;
    int? remaining;
    await _run(() async {
      final r = await _app.api.post('$_base/nudge');
      if (r is Map && r['remaining'] is num) remaining = (r['remaining'] as num).toInt();
    }, '');
    if (mounted && remaining != null) showMessage(context, 'Đã đôn đốc. Hôm nay còn đôn đốc được $remaining lần');
  }

  Future<void> _toggleFollow(TaskDetail t) => _run(
        () => _app.api.post('$_base/${t.following ? 'unfollow' : 'follow'}'),
        t.following ? 'Đã bỏ theo dõi' : 'Đã theo dõi nhiệm vụ',
      );

  Future<void> _review(Submission s, bool approve) async {
    final note = await askNote(
      context,
      title: approve ? 'Duyệt báo cáo: Đạt?' : 'Trả lại báo cáo?',
      confirm: approve ? 'Duyệt' : 'Trả lại',
      hint: approve ? 'Nhận xét (không bắt buộc)' : 'Lý do trả lại',
      destructive: !approve,
    );
    if (note == null) return;
    await _run(
      () => _app.api.post('/submissions/${s.id}/review', {
        'decision': approve ? 'APPROVED' : 'RETURNED',
        if (note.isNotEmpty) 'note': note,
      }),
      approve ? 'Đã duyệt báo cáo' : 'Đã trả lại báo cáo',
    );
  }

  Future<void> _decide(ExtensionRequest r, bool approve) async {
    final note = await askNote(
      context,
      title: approve ? 'Chấp thuận gia hạn đến ${formatDate(r.newDueDate)}?' : 'Không chấp thuận gia hạn?',
      confirm: approve ? 'Chấp thuận' : 'Không chấp thuận',
      destructive: !approve,
    );
    if (note == null) return;
    await _run(
      () => _app.api.post('/tasks/extensions/${r.id}/decide', {
        'decision': approve ? 'APPROVED' : 'REJECTED',
        if (note.isNotEmpty) 'note': note,
      }),
      approve ? 'Đã chấp thuận gia hạn' : 'Đã trả lời đề nghị',
    );
  }

  Future<void> _sendComment() async {
    final text = _comment.text.trim();
    if (text.isEmpty) return;
    final ok = await _run(() => _app.api.post('$_base/comments', {'content': text}), '');
    if (ok) _comment.clear();
  }

  // ---------- Quản lý (người giao) ----------

  Future<void> _edit(TaskDetail t) async {
    final saved = await showEditTask(context, t);
    if (saved == true && mounted) {
      showMessage(context, 'Đã lưu thay đổi');
      await _load();
    }
  }

  Future<void> _cancelTask() async {
    final ok = await askNote(
      context,
      title: 'Hủy nhiệm vụ?',
      message: 'Người thực hiện, người theo dõi sẽ nhận thông báo. Nhiệm vụ đã hủy không sửa được nữa.',
      confirm: 'Hủy nhiệm vụ',
      destructive: true,
      withNote: false,
    );
    if (ok == null) return;
    await _run(() => _app.api.patch(_base, {'status': 'CANCELLED'}), 'Đã hủy nhiệm vụ');
  }

  Future<void> _addFollowers(TaskDetail t) async {
    final me = _app.auth.me;
    final picked = await pickUsers(
      context,
      title: 'Thêm người theo dõi',
      exclude: {...t.followers.map((f) => f.id), if (me != null) me.id},
    );
    if (picked == null || picked.isEmpty || !mounted) return;
    await _run(
      () => _app.api.post('$_base/followers', {'userIds': picked.map((u) => u.id).toList()}),
      'Đã thêm ${picked.length} người theo dõi',
    );
  }

  Future<void> _subTask(TaskDetail t) async {
    final id = await showQuickAssign(context, parentId: t.id, parentDue: t.row.dueDate, parentTitle: t.row.title);
    if (id == null || !mounted) return;
    showMessage(context, 'Đã giao việc con');
    await _load();
  }

  Future<void> _openFile(FileRef f) async {
    showMessage(context, 'Đang tải ${f.originalName}...');
    try {
      final err = await _app.files.open(f);
      if (!mounted) return;
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      if (err != null) showError(context, err);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  // ---------- Giao diện ----------

  @override
  Widget build(BuildContext context) {
    final t = _task;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chi tiết nhiệm vụ'),
        actions: [
          if (t != null && t.permissions.manage && !t.status.isClosed)
            PopupMenuButton<String>(
              tooltip: 'Quản lý nhiệm vụ',
              enabled: !_busy,
              onSelected: (v) => switch (v) {
                'edit' => _edit(t),
                'followers' => _addFollowers(t),
                'cancel' => _cancelTask(),
                _ => null,
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', child: ListTile(leading: Icon(Icons.edit_outlined), title: Text('Sửa nhiệm vụ'))),
                PopupMenuItem(
                    value: 'followers',
                    child: ListTile(leading: Icon(Icons.person_add_alt), title: Text('Thêm người theo dõi'))),
                PopupMenuItem(
                    value: 'cancel',
                    child: ListTile(leading: Icon(Icons.cancel_outlined), title: Text('Hủy nhiệm vụ'))),
              ],
            ),
        ],
      ),
      body: t == null
          ? (_error == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: CenterMessage(
                    icon: Icons.error_outline,
                    text: _error!.message,
                    action: OutlinedButton(onPressed: _load, child: const Text('Thử lại')),
                  ),
                ))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.only(bottom: 32),
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  if (_busy) const LinearProgressIndicator(minHeight: 2) else const SizedBox(height: 2),
                  _header(t),
                  _actions(t),
                  _info(t),
                  if (t.attachments.isNotEmpty) SectionCard(title: 'Tệp đính kèm', child: _fileList(t.attachments)),
                  _submissions(t),
                  if (t.extensionRequests.isNotEmpty) _extensions(t),
                  _activities(t),
                  _comments(t),
                ],
              ),
            ),
    );
  }

  Widget _header(TaskDetail t) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SelectableText(t.row.title, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Wrap(spacing: 6, runSpacing: 6, children: [
          StatusPill(t.status),
          PriorityPill(t.row.priority),
          DueChip(t.row.dueDate, t.status),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(value: t.row.progress / 100, minHeight: 6),
            ),
          ),
          const SizedBox(width: 10),
          Text('${t.row.progress}%', style: const TextStyle(fontWeight: FontWeight.w600)),
        ]),
      ]),
    );
  }

  Widget _actions(TaskDetail t) {
    final p = t.permissions;
    final open = t.status.isOpen;
    final buttons = <Widget>[
      if (p.acknowledge)
        FilledButton.icon(
          onPressed: _busy ? null : _acknowledge,
          icon: const Icon(Icons.check_circle_outline),
          label: const Text('Đã nhận nhiệm vụ'),
        ),
      if (p.work && open) ...[
        FilledButton.tonalIcon(
          onPressed: _busy ? null : () => _progress(t),
          icon: const Icon(Icons.trending_up),
          label: const Text('Cập nhật tiến độ'),
        ),
        FilledButton.tonalIcon(
          onPressed: _busy ? null : _submit,
          icon: const Icon(Icons.assignment_turned_in_outlined),
          label: const Text('Nộp báo cáo'),
        ),
        if (t.pendingExtension == null)
          OutlinedButton.icon(
            onPressed: _busy ? null : () => _extension(t),
            icon: const Icon(Icons.event_repeat),
            label: const Text('Xin gia hạn'),
          ),
      ],
      if (p.work && open && (_app.auth.me?.role.canAssign ?? false))
        OutlinedButton.icon(
          onPressed: _busy ? null : () => _subTask(t),
          icon: const Icon(Icons.account_tree_outlined),
          label: const Text('Chia việc con'),
        ),
      if (p.manage && open)
        OutlinedButton.icon(
          onPressed: _busy ? null : _nudge,
          icon: const Icon(Icons.campaign_outlined),
          label: const Text('Đôn đốc'),
        ),
      if (!p.manage && !p.work)
        OutlinedButton.icon(
          onPressed: _busy ? null : () => _toggleFollow(t),
          icon: Icon(t.following ? Icons.notifications_off_outlined : Icons.notifications_active_outlined),
          label: Text(t.following ? 'Bỏ theo dõi' : 'Theo dõi'),
        ),
    ];
    if (buttons.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Wrap(spacing: 8, runSpacing: 8, children: buttons),
    );
  }

  Widget _info(TaskDetail t) {
    final leads = t.row.assignees.where((a) => a.isLead).toList();
    final supports = t.row.assignees.where((a) => !a.isLead).toList();
    final due = dueInfo(t.row.dueDate, t.status);
    return SectionCard(
      title: 'Thông tin nhiệm vụ',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _InfoRow('Người giao', Text(t.row.createdBy.fullName)),
        _InfoRow('Hạn', Text('${formatDateTime(t.row.dueDate)}${due.tone != null ? ' (${due.label})' : ''}')),
        if (t.createdAt != null) _InfoRow('Ngày giao', Text(formatDateTime(t.createdAt))),
        _InfoRow('Chủ trì', _assignees(leads)),
        _InfoRow('Phối hợp', supports.isEmpty ? const Text('—') : _assignees(supports)),
        _InfoRow('Người theo dõi',
            Text(t.followers.isEmpty ? '—' : t.followers.map((f) => f.fullName).join(', '))),
        if (t.source != null) _InfoRow('Căn cứ', SelectableText(t.source!)),
        if (t.parent != null)
          _InfoRow(
            'Thuộc việc',
            InkWell(
              onTap: () => openTask(context, t.parent!.id),
              child: Text(t.parent!.title, style: TextStyle(color: Theme.of(context).colorScheme.primary)),
            ),
          ),
        if (t.description != null) ...[
          const SizedBox(height: 6),
          Text('Nội dung', style: _labelStyle(context)),
          const SizedBox(height: 4),
          SelectableText(t.description!),
        ],
        if (t.children.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text('Việc con', style: _labelStyle(context)),
          for (final c in t.children)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text(c.title),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Wrap(spacing: 6, runSpacing: 4, children: [StatusPill(c.status), DueChip(c.dueDate, c.status)]),
              ),
              trailing: Text('${c.progress}%'),
              onTap: () => openTask(context, c.id),
            ),
        ],
      ]),
    );
  }

  Widget _assignees(List<Assignee> list) {
    if (list.isEmpty) return const Text('—');
    final ok = Theme.of(context).colorScheme.tertiary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final a in list)
          Padding(
            padding: const EdgeInsets.only(bottom: 2),
            child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 6, children: [
              Text(a.label),
              if (a.acknowledgedAt != null)
                Text.rich(
                  TextSpan(children: [
                    WidgetSpan(child: Icon(Icons.check_circle, size: 13, color: ok), alignment: PlaceholderAlignment.middle),
                    TextSpan(
                      text: ' đã nhận ${formatShort(a.acknowledgedAt)}'
                          '${a.acknowledgedBy != null && a.unitName != null ? ' (${a.acknowledgedBy!.fullName})' : ''}',
                    ),
                  ]),
                  style: TextStyle(color: ok, fontSize: 12),
                )
              else
                Text('chưa nhận', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 12)),
            ]),
          ),
      ],
    );
  }

  Widget _fileList(List<FileRef> files) {
    return Column(children: [
      for (final f in files)
        ListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          leading: Icon(_fileIcon(f.originalName)),
          title: Text(f.originalName, maxLines: 2, overflow: TextOverflow.ellipsis),
          subtitle: Text(formatSize(f.size)),
          trailing: const Icon(Icons.open_in_new, size: 18),
          onTap: () => _openFile(f),
        ),
    ]);
  }

  IconData _fileIcon(String name) {
    final ext = name.split('.').last.toLowerCase();
    return switch (ext) {
      'png' || 'jpg' || 'jpeg' => Icons.image_outlined,
      'pdf' => Icons.picture_as_pdf_outlined,
      'xls' || 'xlsx' => Icons.table_chart_outlined,
      'ppt' || 'pptx' => Icons.slideshow_outlined,
      _ => Icons.description_outlined,
    };
  }

  Widget _submissions(TaskDetail t) {
    final manage = t.permissions.manage;
    return SectionCard(
      title: 'Báo cáo kết quả',
      child: t.submissions.isEmpty
          ? Text('Chưa có báo cáo', style: _mutedStyle(context))
          : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final s in t.submissions) ...[
                Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text(s.submittedBy.fullName, style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(formatDateTime(s.createdAt), style: _mutedStyle(context)),
                  Pill.tone(reviewTone[s.status]!),
                ]),
                const SizedBox(height: 4),
                SelectableText(s.content),
                if (s.attachments.isNotEmpty) _fileList(s.attachments),
                if (s.reviewNote != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('Nhận xét${s.reviewer != null ? ' của ${s.reviewer!.fullName}' : ''}: ${s.reviewNote}',
                        style: const TextStyle(color: Color(0xFFB45309))),
                  ),
                if (manage && s.status == ReviewStatus.pending)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Wrap(spacing: 8, children: [
                      FilledButton.icon(
                        onPressed: _busy ? null : () => _review(s, true),
                        icon: const Icon(Icons.verified_outlined),
                        label: const Text('Duyệt'),
                      ),
                      OutlinedButton.icon(
                        onPressed: _busy ? null : () => _review(s, false),
                        icon: const Icon(Icons.undo),
                        label: const Text('Trả lại'),
                      ),
                    ]),
                  ),
                if (s != t.submissions.last) const Divider(height: 24),
              ],
            ]),
    );
  }

  Widget _extensions(TaskDetail t) {
    final manage = t.permissions.manage;
    return SectionCard(
      title: 'Gia hạn',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (final r in t.extensionRequests) ...[
          Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
            Text('${r.requestedBy.fullName} đề nghị gia hạn đến ${formatDate(r.newDueDate)}',
                style: const TextStyle(fontWeight: FontWeight.w600)),
            Pill.tone(extensionTone[r.status]!),
          ]),
          const SizedBox(height: 2),
          Text('Lý do: ${r.reason}'),
          Text(
            [
              if (r.oldDueDate != null) 'Hạn cũ ${formatDate(r.oldDueDate)}',
              if (r.createdAt != null) 'Gửi ${formatDateTime(r.createdAt)}',
            ].join(' · '),
            style: _mutedStyle(context),
          ),
          if (r.decisionNote != null || r.decidedBy != null)
            Text(
              '${r.decidedBy?.fullName ?? 'Người giao'}${r.decisionNote != null ? ': ${r.decisionNote}' : ''}',
              style: _mutedStyle(context),
            ),
          if (manage && r.status == ExtensionStatus.pending && !t.status.isClosed)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(spacing: 8, children: [
                FilledButton(onPressed: _busy ? null : () => _decide(r, true), child: const Text('Chấp thuận')),
                OutlinedButton(onPressed: _busy ? null : () => _decide(r, false), child: const Text('Không chấp thuận')),
              ]),
            ),
          if (r != t.extensionRequests.last) const Divider(height: 20),
        ],
      ]),
    );
  }

  Widget _activities(TaskDetail t) {
    final scheme = Theme.of(context).colorScheme;
    Color colorOf(String type) => switch (activityTone(type)) {
          ActivityTone.good => const Color(0xFF047857),
          ActivityTone.bad => const Color(0xFFBE123C),
          ActivityTone.warn => const Color(0xFFB45309),
          ActivityTone.muted => scheme.outline,
          ActivityTone.normal => scheme.primary,
        };
    final items = t.activities.reversed.toList();
    return SectionCard(
      title: 'Hoạt động',
      child: items.isEmpty
          ? Text('Chưa có hoạt động', style: _mutedStyle(context))
          : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final a in items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 5),
                      child: Icon(Icons.circle, size: 10, color: colorOf(a.type)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text.rich(TextSpan(children: [
                          TextSpan(text: a.user.fullName, style: const TextStyle(fontWeight: FontWeight.w600)),
                          TextSpan(text: ' ${describeActivity(a)}'),
                        ])),
                        Text(formatDateTime(a.createdAt), style: _mutedStyle(context)),
                        if (progressNoteFor(a, t.updates) case final note?) Text(note),
                      ]),
                    ),
                  ]),
                ),
            ]),
    );
  }

  Widget _comments(TaskDetail t) {
    return SectionCard(
      title: 'Trao đổi',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (t.comments.isEmpty) Text('Chưa có trao đổi', style: _mutedStyle(context)),
        for (final c in t.comments)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 8, children: [
                Text(c.user.fullName, style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(formatDateTime(c.createdAt), style: _mutedStyle(context)),
              ]),
              SelectableText(c.content),
            ]),
          ),
        const SizedBox(height: 4),
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(
            child: TextField(
              controller: _comment,
              minLines: 1,
              maxLines: 4,
              maxLength: 5000,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'Nhập ý kiến trao đổi',
                border: OutlineInputBorder(),
                isDense: true,
                counterText: '',
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            tooltip: 'Gửi',
            onPressed: _busy ? null : _sendComment,
            icon: const Icon(Icons.send),
          ),
        ]),
      ]),
    );
  }

  TextStyle _labelStyle(BuildContext context) =>
      TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13, fontWeight: FontWeight.w600);

  TextStyle _mutedStyle(BuildContext context) =>
      TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 12);
}

class _InfoRow extends StatelessWidget {
  const _InfoRow(this.label, this.value);
  final String label;
  final Widget value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
          width: 110,
          child: Text(label,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
        ),
        Expanded(child: value),
      ]),
    );
  }
}
