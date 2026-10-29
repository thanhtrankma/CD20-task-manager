import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../api/api_client.dart';
import '../constants.dart';
import '../models/models.dart';

/// Tệp đã chọn, giữ trong bộ nhớ cho tới khi tải lên.
class PickedFile {
  PickedFile(this.name, this.bytes);
  final String name;
  final Uint8List bytes;
}

/// Giới hạn mặc định của máy chủ (MAX_UPLOAD_MB = 20).
const maxUploadBytes = 20 * 1024 * 1024;

/// Ảnh đại diện tối đa 2 MB.
const maxAvatarBytes = 2 * 1024 * 1024;

/// Loại ảnh theo chữ ký tệp: `image/jpeg`, `image/png` hoặc null (loại khác).
String? avatarContentType(List<int> b) {
  if (b.length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  if (b.length >= png.length && List.generate(png.length, (i) => b[i] == png[i]).every((x) => x)) {
    return 'image/png';
  }
  return null;
}

/// Đính kèm: chụp ảnh, chọn tệp, tải lên; tải tệp về để mở bằng ứng dụng của máy.
///
/// Không lưu dữ liệu nhiệm vụ lâu dài trên máy: tệp tải về chỉ ghi vào thư mục tạm `tm_files`
/// (cần để ứng dụng xem tệp của hệ điều hành mở được) và bị xóa khi mở ứng dụng, khi đăng xuất.
/// Ảnh chụp, tệp chọn được đọc vào bộ nhớ rồi xóa bản sao tạm mà trình chọn tạo ra.
class AttachmentService {
  AttachmentService(this.api);
  final ApiClient api;
  final _picker = ImagePicker();

  Future<Directory> _dir() async => Directory('${(await getTemporaryDirectory()).path}/tm_files');

  /// Xóa toàn bộ tệp đã tải về.
  Future<void> cleanup() async {
    try {
      final dir = await _dir();
      if (await dir.exists()) await dir.delete(recursive: true);
    } catch (_) {}
  }

  /// Chụp ảnh bằng máy ảnh (hoặc chọn từ thư viện ảnh khi [camera] = false).
  Future<PickedFile?> pickPhoto({bool camera = true}) async {
    final XFile? x;
    try {
      x = await _picker.pickImage(
        source: camera ? ImageSource.camera : ImageSource.gallery,
        imageQuality: 80,
        maxWidth: 2400,
        maxHeight: 2400,
        requestFullMetadata: false,
      );
    } on PlatformException catch (e) {
      throw ApiException(
        0,
        e.code.contains('denied')
            ? 'Ứng dụng chưa được cấp quyền ${camera ? 'dùng máy ảnh' : 'xem ảnh'}. Đồng chí cấp quyền trong Cài đặt.'
            : (camera ? 'Không mở được máy ảnh' : 'Không mở được thư viện ảnh'),
      );
    }
    if (x == null) return null;
    final bytes = await x.readAsBytes();
    await _deleteQuietly(x.path);
    final stamp = DateFormat('yyyyMMdd_HHmmss').format(DateTime.now());
    var ext = x.name.contains('.') ? x.name.split('.').last.toLowerCase() : 'jpg';
    if (!allowedExtensions.contains(ext)) ext = 'jpg';
    return _checked(PickedFile('anh_$stamp.$ext', bytes));
  }

  /// Chọn tệp (PDF, Word, Excel, PowerPoint, ảnh).
  Future<PickedFile?> pickDocument() async {
    final List<PlatformFile> files;
    try {
      files = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: allowedExtensions);
    } on PlatformException {
      throw ApiException(0, 'Không mở được trình chọn tệp');
    }
    if (files.isEmpty) return null;
    final f = files.first;
    final ext = (f.extension ?? '').toLowerCase();
    if (!allowedExtensions.contains(ext)) {
      throw ApiException(0, 'Loại tệp không được phép (chỉ PDF, Word, Excel, PowerPoint, ảnh)');
    }
    final size = f.lengthSync() ?? await f.length();
    if (size != null && size > maxUploadBytes) throw ApiException(0, 'Tệp quá lớn (tối đa 20 MB)');
    final bytes = await f.readAsBytes();
    final path = f.path;
    if (path != null && path.startsWith((await getTemporaryDirectory()).path)) await _deleteQuietly(path);
    return _checked(PickedFile(f.name, bytes));
  }

  /// Ảnh đại diện: chụp hoặc chọn từ thư viện, thu nhỏ còn tối đa 512 × 512, nén lại (bỏ phần lớn siêu dữ liệu;
  /// máy chủ xóa phần còn lại). Bản sao tạm của trình chọn bị xóa ngay.
  Future<PickedFile?> pickAvatar({required bool camera}) async {
    final XFile? x;
    try {
      x = await _picker.pickImage(
        source: camera ? ImageSource.camera : ImageSource.gallery,
        maxWidth: 512,
        maxHeight: 512,
        imageQuality: 85,
        requestFullMetadata: false,
        preferredCameraDevice: CameraDevice.front,
      );
    } on PlatformException catch (e) {
      throw ApiException(
        0,
        e.code.contains('denied')
            ? 'Ứng dụng chưa được cấp quyền ${camera ? 'dùng máy ảnh' : 'xem ảnh'}. Đồng chí cấp quyền trong Cài đặt.'
            : (camera ? 'Không mở được máy ảnh' : 'Không mở được thư viện ảnh'),
      );
    }
    if (x == null) return null;
    final bytes = await x.readAsBytes();
    await _deleteQuietly(x.path);
    return PickedFile(x.name, bytes);
  }

  /// POST /users/me/avatar (multipart `file`, JPEG hoặc PNG ≤ 2 MB). Trả về `avatarUrl` mới.
  /// Ném [ApiException] (kiểm tra ở máy hoặc câu báo 400 của máy chủ).
  Future<String?> uploadAvatar(PickedFile file) async {
    final type = avatarContentType(file.bytes);
    if (type == null) throw ApiException(0, 'Ảnh đại diện phải là JPEG hoặc PNG');
    if (file.bytes.length > maxAvatarBytes) throw ApiException(0, 'Ảnh quá lớn (tối đa 2 MB)');
    final data = await api.upload(
      '/users/me/avatar',
      bytes: file.bytes,
      filename: type == 'image/png' ? 'avatar.png' : 'avatar.jpg',
      contentType: type,
    );
    return data is Map && data['avatarUrl'] is String ? data['avatarUrl'] as String : null;
  }

  Future<void> deleteAvatar() => api.delete('/users/me/avatar');

  PickedFile _checked(PickedFile f) {
    if (f.bytes.length > maxUploadBytes) throw ApiException(0, 'Tệp quá lớn (tối đa 20 MB)');
    return f;
  }

  /// POST /files?taskId= (multipart). Trả về tệp đã lưu trên máy chủ (chưa gắn báo cáo).
  Future<FileRef> upload(int taskId, PickedFile file) async {
    final data = await api.upload('/files', bytes: file.bytes, filename: file.name, query: {'taskId': taskId});
    return FileRef.fromJson((data as Map).cast<String, dynamic>());
  }

  /// Tải tệp về thư mục tạm rồi mở bằng ứng dụng xem tệp của máy. Trả về thông báo lỗi nếu không mở được.
  Future<String?> open(FileRef file) async {
    final bytes = await api.download('/files/${file.id}/download');
    final dir = Directory('${(await _dir()).path}/${file.id}');
    await dir.create(recursive: true);
    final safeName = file.originalName.replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1f]'), '_');
    final out = File('${dir.path}/${safeName.isEmpty ? 'tep' : safeName}');
    await out.writeAsBytes(bytes, flush: true);
    final result = await OpenFilex.open(out.path);
    return switch (result.type) {
      ResultType.done => null,
      ResultType.noAppToOpen => 'Máy chưa có ứng dụng mở được loại tệp này',
      ResultType.permissionDenied => 'Không có quyền mở tệp',
      _ => 'Không mở được tệp',
    };
  }

  Future<void> _deleteQuietly(String path) async {
    try {
      final f = File(path);
      if (await f.exists()) await f.delete();
    } catch (_) {}
  }
}
