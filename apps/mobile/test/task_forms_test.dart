import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/models/models.dart';
import 'package:giaoviec/screens/pickers.dart';
import 'package:giaoviec/util/task_forms.dart';

void main() {
  final now = DateTime(2026, 10, 28, 9, 30);
  const user = UserOption(id: 5, fullName: 'Nguyễn Văn Cán');
  const unit = UnitOption(id: 3, name: 'Khoa CNTT');

  group('Giao nhanh', () {
    test('hạn mặc định: cuối ngày mai', () {
      final d = QuickAssignDraft(now: now);
      expect(d.dueDate, DateTime(2026, 10, 29, 23, 59, 59, 999));
    });

    test('việc con: hạn mặc định không trễ hơn việc cha', () {
      final parentDue = DateTime(2026, 10, 28, 17);
      final d = QuickAssignDraft(now: now, parentId: 9, parentDue: parentDue);
      expect(d.dueDate, parentDue);
    });

    test('kiểm tra dữ liệu', () {
      final d = QuickAssignDraft(now: now);
      expect(d.validate(now: now), 'Tên nhiệm vụ cần từ 3 đến 255 ký tự');
      d.title = '  ab ';
      expect(d.validate(now: now), 'Tên nhiệm vụ cần từ 3 đến 255 ký tự');
      d.title = 'x' * 256;
      expect(d.validate(now: now), 'Tên nhiệm vụ cần từ 3 đến 255 ký tự');
      d.title = 'Rà soát hồ sơ';
      expect(d.validate(now: now), 'Đồng chí chọn ít nhất một người hoặc đơn vị nhận việc');
      d.assignees.add(user);
      expect(d.validate(now: now), isNull);
      d.source = 'x' * 501;
      expect(d.validate(now: now), 'Căn cứ tối đa 500 ký tự');
      d.source = 'Kết luận giao ban tuần 43';
      d.dueDate = DateTime(2026, 10, 28, 9);
      expect(d.validate(now: now), 'Hạn hoàn thành phải sau thời điểm hiện tại');
      d.dueDate = QuickAssignDraft.defaultDue(now);
      d.followers.addAll([for (var i = 0; i < 51; i++) UserOption(id: 100 + i, fullName: 'N$i')]);
      expect(d.validate(now: now), 'Tối đa 50 người theo dõi');
    });

    test('thân yêu cầu: người, đơn vị là chủ trì; bỏ trường rỗng', () {
      final d = QuickAssignDraft(now: now)
        ..title = '  Rà soát hồ sơ  '
        ..priority = Priority.high;
      d.assignees.add(user);
      d.units.add(unit);
      expect(d.toJson(), {
        'title': 'Rà soát hồ sơ',
        'dueDate': DateTime(2026, 10, 29, 23, 59, 59, 999).toUtc().toIso8601String(),
        'priority': 'HIGH',
        'assignees': [
          {'unitId': 3, 'role': 'LEAD'},
          {'userId': 5, 'role': 'LEAD'},
        ],
      });
    });

    test('thân yêu cầu đầy đủ: nội dung, căn cứ, người theo dõi, việc cha', () {
      final d = QuickAssignDraft(now: now, parentId: 12)
        ..title = 'Việc con'
        ..description = ' Chi tiết '
        ..source = ' KH 30/KH-CĐN20 ';
      d.assignees.add(user);
      d.followers.addAll(const [UserOption(id: 8, fullName: 'A'), UserOption(id: 8, fullName: 'A')]);
      final j = d.toJson();
      expect(j['description'], 'Chi tiết');
      expect(j['source'], 'KH 30/KH-CĐN20');
      expect(j['followerIds'], [8]);
      expect(j['parentId'], 12);
    });
  });

  group('Sửa nhiệm vụ', () {
    TaskEditDraft draft() => TaskEditDraft(
          originalTitle: 'Báo cáo tổng kết',
          originalDescription: 'Nội dung cũ',
          originalSource: null,
          originalDue: DateTime(2026, 11, 5, 17, 0),
          originalPriority: Priority.normal,
        );

    test('không đổi gì: không gửi trường nào', () {
      expect(draft().changes(), isEmpty);
    });

    test('chỉ gửi trường đã đổi', () {
      final d = draft()
        ..title = 'Báo cáo tổng kết năm'
        ..priority = Priority.urgent;
      expect(d.changes(), {'title': 'Báo cáo tổng kết năm', 'priority': 'URGENT'});
    });

    test('giữ nguyên ngày hạn thì không gửi (giữ giờ cũ); đổi ngày thì gửi cuối ngày mới', () {
      final d = draft()..dueDate = DateTime(2026, 11, 5, 23, 59);
      expect(d.changes(), isEmpty);
      d.dueDate = DateTime(2026, 11, 7);
      expect(d.changes(), {'dueDate': DateTime(2026, 11, 7, 23, 59, 59, 999).toUtc().toIso8601String()});
    });

    test('xóa nội dung, thêm căn cứ', () {
      final d = draft()
        ..description = '  '
        ..source = 'Kết luận giao ban';
      expect(d.changes(), {'description': '', 'source': 'Kết luận giao ban'});
    });

    test('kiểm tra tên', () {
      final d = draft()..title = 'ab';
      expect(d.validate(), isNotNull);
    });
  });

  test('đơn vị trong phạm vi chỉ huy: đơn vị mình và trực thuộc mọi cấp', () {
    const all = [
      UnitOption(id: 1, name: 'Trường'),
      UnitOption(id: 2, name: 'Khoa CNTT', parentId: 1),
      UnitOption(id: 3, name: 'Bộ môn Mạng', parentId: 2),
      UnitOption(id: 4, name: 'Phòng Đào tạo', parentId: 1),
    ];
    expect(unitsInScope(all, 2).map((u) => u.id), [2, 3]);
  });

  test('danh sách người: bỏ quản trị và tài khoản khóa', () {
    final list = UserOption.listFrom([
      {'id': 1, 'fullName': 'A', 'role': 'STAFF', 'isActive': true, 'unit': {'name': 'K'}},
      {'id': 2, 'fullName': 'B', 'role': 'ADMIN', 'isActive': true},
      {'id': 3, 'fullName': 'C', 'role': 'STAFF', 'isActive': false},
    ]);
    expect(list.map((u) => u.id), [1]);
    expect(list.first.subtitle, 'K');
  });
}
