import '../models/models.dart';
import 'format.dart';

enum DueTone { overdue, today, soon, normal }

/// Số ngày coi là "sắp đến hạn" (cùng mốc với nhắc hạn của máy chủ).
const soonDays = 3;

class DueInfo {
  const DueInfo(this.label, this.tone, this.date);
  final String label;

  /// null: việc đã xong hoặc đã hủy, không tô màu.
  final DueTone? tone;

  /// Ngày hạn dạng dd/MM/yyyy.
  final String date;
}

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// Hạn hiển thị tương đối ("Trễ 3 ngày", "Hôm nay 17:00", "Ngày mai", "Còn 2 ngày") kèm mức màu.
/// Cùng quy tắc với apps/web/src/utils/due.ts. [now] để kiểm thử.
DueInfo dueInfo(DateTime dueDate, TaskStatus status, {DateTime? now}) {
  final due = dueDate.toLocal();
  final date = formatDate(due);
  if (status.isClosed) return DueInfo(date, null, date);

  final current = (now ?? DateTime.now()).toLocal();
  // Đếm theo ngày lịch (không theo 24 giờ), tránh lệch khi đổi giờ.
  final days = (_day(due).difference(_day(current)).inHours / 24).round();
  if (due.isBefore(current)) {
    return DueInfo(days < 0 ? 'Trễ ${-days} ngày' : 'Quá hạn', DueTone.overdue, date);
  }
  if (days == 0) return DueInfo('Hôm nay ${formatTime(due)}', DueTone.today, date);
  if (days == 1) return DueInfo('Ngày mai', DueTone.soon, date);
  return DueInfo('Còn $days ngày', days <= soonDays ? DueTone.soon : DueTone.normal, date);
}
