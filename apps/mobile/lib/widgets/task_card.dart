import 'package:flutter/material.dart';

import '../constants.dart';
import '../models/models.dart';
import '../theme.dart';
import '../util/due.dart';
import 'common.dart';

/// Thẻ nhiệm vụ trong danh sách: tên, hạn tương đối có màu, mức ưu tiên, trạng thái.
class TaskCard extends StatelessWidget {
  const TaskCard({super.key, required this.task, required this.onTap, this.quickAction});

  final TaskRow task;
  final VoidCallback onTap;

  /// Nút thao tác một chạm (ví dụ "Đã nhận") hiện ở cuối thẻ.
  final Widget? quickAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final subtitle = task.reason == TodoReason.review
        ? 'Báo cáo của ${task.leads.isEmpty ? '—' : task.leads}'
        : 'Giao bởi ${task.createdBy.fullName}';
    // Vạch màu cạnh trái theo độ gấp: lý do trong "Cần xử lý", hoặc theo hạn; việc đã kết thúc màu xám.
    final stripe = task.status.isClosed
        ? Palette.border
        : task.reason != null
        ? todoReasonColor[task.reason]!
        : dueTone[dueInfo(task.dueDate, task.status).tone ?? DueTone.normal]!.$2;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 4, color: stripe),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        task.title,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          height: 1.3,
                          color: Palette.ink,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(Icons.person_outline, size: 14, color: muted),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              '$subtitle${task.progress > 0 ? ' · ${task.progress}%' : ''}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodySmall?.copyWith(color: muted),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(
                            child: Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                DueChip(task.dueDate, task.status),
                                PriorityPill(task.priority),
                                StatusPill(task.status),
                              ],
                            ),
                          ),
                          if (quickAction != null) ...[const SizedBox(width: 8), quickAction!],
                        ],
                      ),
                      if (task.progress > 0 && !task.status.isClosed) ...[
                        const SizedBox(height: 10),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: task.progress / 100,
                            minHeight: 5,
                            color: Palette.olive,
                            backgroundColor: Palette.oliveLight,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
