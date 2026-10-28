import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/models/models.dart';
import 'package:giaoviec/util/due.dart';

void main() {
  // 10:00 ngày 15/05/2026 (giờ máy).
  final now = DateTime(2026, 5, 15, 10, 0);
  DueInfo at(DateTime due, [TaskStatus status = TaskStatus.inProgress]) => dueInfo(due, status, now: now);

  group('dueInfo', () {
    test('trễ nhiều ngày', () {
      final d = at(DateTime(2026, 5, 12, 17, 0));
      expect(d.label, 'Trễ 3 ngày');
      expect(d.tone, DueTone.overdue);
      expect(d.date, '12/05/2026');
    });

    test('trễ trong ngày hôm nay', () {
      final d = at(DateTime(2026, 5, 15, 8, 0));
      expect(d.label, 'Quá hạn');
      expect(d.tone, DueTone.overdue);
    });

    test('hôm qua 23:59 là trễ 1 ngày', () {
      expect(at(DateTime(2026, 5, 14, 23, 59)).label, 'Trễ 1 ngày');
    });

    test('đến hạn hôm nay kèm giờ', () {
      final d = at(DateTime(2026, 5, 15, 17, 0));
      expect(d.label, 'Hôm nay 17:00');
      expect(d.tone, DueTone.today);
    });

    test('ngày mai (kể cả sáng sớm, chưa đủ 24 giờ)', () {
      final d = at(DateTime(2026, 5, 16, 7, 0));
      expect(d.label, 'Ngày mai');
      expect(d.tone, DueTone.soon);
    });

    test('còn 2, 3 ngày: sắp đến hạn; còn 4 ngày: bình thường', () {
      expect(at(DateTime(2026, 5, 17, 9, 0)).label, 'Còn 2 ngày');
      expect(at(DateTime(2026, 5, 17, 9, 0)).tone, DueTone.soon);
      expect(at(DateTime(2026, 5, 18, 9, 0)).tone, DueTone.soon);
      final d = at(DateTime(2026, 5, 19, 9, 0));
      expect(d.label, 'Còn 4 ngày');
      expect(d.tone, DueTone.normal);
    });

    test('qua tháng', () {
      expect(at(DateTime(2026, 6, 1, 9, 0)).label, 'Còn 17 ngày');
    });

    test('việc đã xong, đã hủy chỉ hiện ngày, không màu', () {
      for (final s in [TaskStatus.done, TaskStatus.cancelled]) {
        final d = at(DateTime(2026, 5, 1, 17, 0), s);
        expect(d.label, '01/05/2026');
        expect(d.tone, isNull);
      }
    });

    test('nhận giờ UTC từ máy chủ, quy về giờ máy', () {
      final utc = DateTime.utc(2026, 5, 20, 3, 0);
      final d = at(utc);
      final local = utc.toLocal();
      expect(d.date, '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/2026');
    });
  });
}
