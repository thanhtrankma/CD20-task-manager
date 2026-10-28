import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../constants.dart';
import '../models/models.dart';
import '../util/due.dart';

/// Thẻ dạng viên thuốc.
class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, required this.bg, required this.fg, this.icon});
  Pill.tone(Tone tone, {super.key, this.icon})
      : label = tone.label,
        bg = tone.bg,
        fg = tone.fg;

  final String label;
  final Color bg;
  final Color fg;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 13, color: fg), const SizedBox(width: 3)],
          Text(label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});
  final TaskStatus status;
  @override
  Widget build(BuildContext context) => Pill.tone(statusTone[status]!);
}

class PriorityPill extends StatelessWidget {
  const PriorityPill(this.priority, {super.key});
  final Priority priority;
  @override
  Widget build(BuildContext context) => Pill.tone(priorityTone[priority]!, icon: Icons.flag_outlined);
}

/// Hạn tương đối có màu; việc đã kết thúc chỉ hiện ngày.
class DueChip extends StatelessWidget {
  const DueChip(this.dueDate, this.status, {super.key});
  final DateTime dueDate;
  final TaskStatus status;

  @override
  Widget build(BuildContext context) {
    final info = dueInfo(dueDate, status);
    final (bg, fg) = dueTone[info.tone ?? DueTone.normal]!;
    return Tooltip(
      message: 'Hạn ${info.date}',
      child: Pill(info.label, bg: bg, fg: fg, icon: Icons.schedule),
    );
  }
}

/// Hiện lỗi API (đã là câu tiếng Việt) trên thanh thông báo.
void showError(BuildContext context, Object error) {
  final msg = switch (error) {
    ApiException e => e.message,
    String s => s,
    _ => 'Có lỗi xảy ra, đồng chí thử lại',
  };
  final messenger = ScaffoldMessenger.maybeOf(context);
  messenger?.hideCurrentSnackBar();
  messenger?.showSnackBar(SnackBar(
    content: Text(msg),
    backgroundColor: Theme.of(context).colorScheme.error,
    behavior: SnackBarBehavior.floating,
  ));
}

void showMessage(BuildContext context, String msg) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  messenger?.hideCurrentSnackBar();
  messenger?.showSnackBar(SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));
}

/// Trạng thái rỗng / lỗi giữa màn hình, kéo xuống để tải lại được.
class CenterMessage extends StatelessWidget {
  const CenterMessage({super.key, required this.icon, required this.text, this.action});
  final IconData icon;
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return LayoutBuilder(
      builder: (context, c) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: c.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 48, color: muted),
                  const SizedBox(height: 12),
                  Text(text, textAlign: TextAlign.center, style: TextStyle(color: muted)),
                  if (action != null) ...[const SizedBox(height: 16), action!],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.title, required this.child, this.trailing});
  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Expanded(child: Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
              ?trailing,
            ]),
            const SizedBox(height: 8),
            child,
          ],
        ),
      ),
    );
  }
}
