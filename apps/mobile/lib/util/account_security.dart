import 'dart:convert';
import 'dart:typed_data';

/// Độ dài tối thiểu của mật khẩu (giống máy chủ, apps/api/src/common/password.ts).
const minPasswordLength = 10;
const maxPasswordLength = 128;

/// Kiểm tra mật khẩu mới như máy chủ: ít nhất 10 ký tự, có cả chữ và số, khác mật khẩu cũ.
/// Trả về câu báo lỗi, hoặc null nếu hợp lệ.
String? validateNewPassword(String next, {String? current}) {
  if (next.isEmpty) return 'Nhập mật khẩu mới';
  if (next.length < minPasswordLength || !RegExp('[a-zA-Z]').hasMatch(next) || !RegExp(r'\d').hasMatch(next)) {
    return 'Mật khẩu phải có ít nhất $minPasswordLength ký tự, gồm cả chữ và số';
  }
  if (next.length > maxPasswordLength) return 'Mật khẩu không quá $maxPasswordLength ký tự';
  if (current != null && current.isNotEmpty && current == next) return 'Mật khẩu mới phải khác mật khẩu cũ';
  return null;
}

String? validateConfirmPassword(String confirm, String next) {
  if (confirm.isEmpty) return 'Nhập lại mật khẩu mới';
  return confirm == next ? null : 'Mật khẩu nhập lại không khớp';
}

/// Mã xác thực gồm đúng 6 chữ số.
String? validateOtpCode(String code) => RegExp(r'^\d{6}$').hasMatch(code) ? null : 'Mã xác thực gồm 6 chữ số';

/// Lấy khóa bí mật (tham số `secret`) từ `otpauth://totp/...?secret=...`. Không hợp lệ: null.
String? otpSecretFromUrl(String otpauthUrl) {
  final uri = Uri.tryParse(otpauthUrl);
  if (uri == null || uri.scheme != 'otpauth') return null;
  final secret = uri.queryParameters['secret']?.replaceAll(RegExp(r'\s'), '').toUpperCase();
  return (secret == null || secret.isEmpty) ? null : secret;
}

/// Chia khóa thành từng nhóm 4 ký tự cho dễ đọc, dễ gõ: "ABCD EFGH IJKL ...".
String formatSecret(String secret) {
  final clean = secret.replaceAll(RegExp(r'\s'), '');
  final groups = <String>[];
  for (var i = 0; i < clean.length; i += 4) {
    groups.add(clean.substring(i, i + 4 > clean.length ? clean.length : i + 4));
  }
  return groups.join(' ');
}

/// Giải mã ảnh `data:image/png;base64,...` (mã QR của máy chủ). Sai định dạng: null.
Uint8List? decodeImageDataUrl(String dataUrl) {
  final m = RegExp(r'^data:image/[a-zA-Z+.-]+;base64,(.+)$', dotAll: true).firstMatch(dataUrl.trim());
  if (m == null) return null;
  try {
    return base64Decode(m.group(1)!.replaceAll(RegExp(r'\s'), ''));
  } on FormatException {
    return null;
  }
}
