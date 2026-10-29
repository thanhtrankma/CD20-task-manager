import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/auth/auth_controller.dart';
import 'package:giaoviec/models/models.dart';
import 'package:giaoviec/screens/search_screen.dart';
import 'package:giaoviec/util/account_security.dart';

void main() {
  group('mật khẩu mới (giống máy chủ)', () {
    test('ít nhất 10 ký tự, có chữ và số', () {
      const rule = 'Mật khẩu phải có ít nhất 10 ký tự, gồm cả chữ và số';
      expect(validateNewPassword(''), 'Nhập mật khẩu mới');
      expect(validateNewPassword('abc12345'), rule); // 8 ký tự
      expect(validateNewPassword('abcdefghijk'), rule); // không có số
      expect(validateNewPassword('12345678901'), rule); // không có chữ
      expect(validateNewPassword('abcdefghi1'), isNull); // đúng 10 ký tự
      expect(validateNewPassword('Matkhau 2026 moi!'), isNull);
      expect(validateNewPassword('a1' * 65), 'Mật khẩu không quá 128 ký tự');
    });

    test('phải khác mật khẩu cũ', () {
      expect(validateNewPassword('abcdefghi1', current: 'abcdefghi1'), 'Mật khẩu mới phải khác mật khẩu cũ');
      expect(validateNewPassword('abcdefghi2', current: 'abcdefghi1'), isNull);
    });

    test('nhập lại phải khớp', () {
      expect(validateConfirmPassword('', 'abcdefghi1'), 'Nhập lại mật khẩu mới');
      expect(validateConfirmPassword('abcdefghi2', 'abcdefghi1'), 'Mật khẩu nhập lại không khớp');
      expect(validateConfirmPassword('abcdefghi1', 'abcdefghi1'), isNull);
    });

    test('mã xác thực 6 chữ số', () {
      expect(validateOtpCode('123456'), isNull);
      expect(validateOtpCode('12345'), isNotNull);
      expect(validateOtpCode('12345a'), isNotNull);
    });
  });

  group('khóa xác thực hai lớp', () {
    test('lấy khóa từ otpauth://', () {
      expect(
        otpSecretFromUrl('otpauth://totp/Giao%20viec:lanhdao?secret=JBSWY3DPEHPK3PXP&period=30&issuer=Giao%20viec'),
        'JBSWY3DPEHPK3PXP',
      );
      expect(otpSecretFromUrl('otpauth://totp/x?secret=jbsw%20y3dp'), 'JBSWY3DP');
      expect(otpSecretFromUrl('otpauth://totp/x?issuer=a'), isNull);
      expect(otpSecretFromUrl('https://example.com/?secret=ABC'), isNull);
      expect(otpSecretFromUrl(''), isNull);
    });

    test('chia nhóm 4 ký tự', () {
      expect(formatSecret('JBSWY3DPEHPK3PXP'), 'JBSW Y3DP EHPK 3PXP');
      expect(formatSecret('JBSWY3DPEHPK3PXPAB'), 'JBSW Y3DP EHPK 3PXP AB');
      expect(formatSecret('ABC'), 'ABC');
      expect(formatSecret(''), '');
    });

    test('giải mã ảnh QR data:image/png;base64', () {
      final bytes = [0x89, 0x50, 0x4E, 0x47, 1, 2, 3];
      expect(decodeImageDataUrl('data:image/png;base64,${base64Encode(bytes)}'), bytes);
      expect(decodeImageDataUrl('data:image/png;base64,***'), isNull);
      expect(decodeImageDataUrl('image/png;base64,AAAA'), isNull);
    });

    test('không in khóa khi ghi nhật ký đối tượng', () {
      const s = TwoFactorSetup(otpauthUrl: 'otpauth://totp/x?secret=SECRETKEY', qrDataUrl: 'data:...');
      expect('$s', isNot(contains('SECRETKEY')));
    });

    test('đọc totpEnabled, twoFactorMandatory trong /auth/me', () {
      final me = Me.fromJson({'role': 'LEADER', 'totpEnabled': true, 'twoFactorMandatory': true});
      expect(me.totpEnabled, isTrue);
      expect(me.twoFactorMandatory, isTrue);
      final old = Me.fromJson({'role': 'STAFF'});
      expect(old.totpEnabled, isFalse);
      expect(old.twoFactorMandatory, isFalse);
    });
  });

  test('tham số tìm kiếm: bỏ trường trống, overdue=1 khi bật', () {
    expect(searchQuery('báo cáo', page: 1), {'q': 'báo cáo', 'page': 1, 'pageSize': 20, 'status': null});
    expect(
      searchQuery('báo cáo', page: 2, status: TaskStatus.pendingReview, overdue: true),
      {'q': 'báo cáo', 'page': 2, 'pageSize': 20, 'status': 'PENDING_REVIEW', 'overdue': '1'},
    );
  });
}
