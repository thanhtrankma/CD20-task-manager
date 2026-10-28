import 'package:intl/intl.dart';

final _date = DateFormat('dd/MM/yyyy');
final _dateTime = DateFormat('dd/MM/yyyy HH:mm');
final _time = DateFormat('HH:mm');
final _short = DateFormat('dd/MM HH:mm');

String formatDate(DateTime? d) => d == null ? '' : _date.format(d.toLocal());
String formatDateTime(DateTime? d) => d == null ? '' : _dateTime.format(d.toLocal());
String formatTime(DateTime? d) => d == null ? '' : _time.format(d.toLocal());
String formatShort(DateTime? d) => d == null ? '' : _short.format(d.toLocal());

/// Thời gian tương đối cho thông báo: "Vừa xong", "5 phút trước", "3 giờ trước", sau đó là ngày giờ.
String formatAgo(DateTime? d, {DateTime? now}) {
  if (d == null) return '';
  final diff = (now ?? DateTime.now()).difference(d);
  if (diff.inMinutes < 1) return 'Vừa xong';
  if (diff.inMinutes < 60) return '${diff.inMinutes} phút trước';
  if (diff.inHours < 24) return '${diff.inHours} giờ trước';
  return formatDateTime(d);
}

String formatSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
  return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
}
