import 'dart:async';
import 'dart:convert';

/// Một sự kiện Server-Sent Events.
class SseEvent {
  const SseEvent(this.event, this.data, {this.id});

  /// Tên sự kiện (`event:`), mặc định `message`.
  final String event;

  /// Các dòng `data:` nối bằng `\n`.
  final String data;
  final String? id;

  @override
  String toString() => 'SseEvent($event)';
}

/// Đọc luồng byte `text/event-stream` thành các sự kiện (theo đặc tả HTML "server-sent events"):
/// - mỗi sự kiện kết thúc bằng một dòng trống; dòng kết thúc bằng `\n`, `\r\n` hoặc `\r`;
/// - dòng bắt đầu bằng `:` là chú thích (máy chủ gửi `: ping` giữ kết nối), bỏ qua;
/// - `trường: giá trị` (bỏ một dấu cách sau dấu hai chấm); nhiều dòng `data:` nối bằng `\n`;
/// - sự kiện không có `data` thì bỏ; phần dở dang khi luồng đóng cũng bỏ.
/// Gói byte có thể bị cắt ở bất kỳ đâu (kể cả giữa một ký tự UTF-8 nhiều byte).
///
/// [onChunk] được gọi mỗi khi nhận được dữ liệu (kể cả chú thích), để biết kết nối còn sống.
Stream<SseEvent> parseSse(Stream<List<int>> bytes, {void Function()? onChunk}) {
  final source = onChunk == null
      ? bytes
      : bytes.map((b) {
          onChunk();
          return b;
        });
  return source.transform(utf8.decoder).transform(const LineSplitter()).transform(_SseLines());
}

class _SseLines extends StreamTransformerBase<String, SseEvent> {
  // Dùng EventSink (không dùng async*): hủy đăng ký là hủy ngay luồng nguồn, ngắt kết nối không chờ sự kiện kế tiếp.
  @override
  Stream<SseEvent> bind(Stream<String> lines) => Stream.eventTransformed(lines, _SseSink.new);
}

class _SseSink implements EventSink<String> {
  _SseSink(this._out);
  final EventSink<SseEvent> _out;
  String? _event;
  String? _id;
  final _data = <String>[];
  var _hasData = false;
  var _first = true;

  @override
  void add(String line) {
    // Bỏ dấu BOM ở đầu luồng.
    if (_first) {
      _first = false;
      if (line.startsWith('\uFEFF')) line = line.substring(1);
    }
    if (line.isEmpty) {
      final event = _event;
      if (_hasData) _out.add(SseEvent(event == null || event.isEmpty ? 'message' : event, _data.join('\n'), id: _id));
      _event = null;
      _data.clear();
      _hasData = false;
      return;
    }
    if (line.startsWith(':')) return;
    final colon = line.indexOf(':');
    final field = colon < 0 ? line : line.substring(0, colon);
    var value = colon < 0 ? '' : line.substring(colon + 1);
    if (value.startsWith(' ')) value = value.substring(1);
    switch (field) {
      case 'event':
        _event = value;
      case 'data':
        _data.add(value);
        _hasData = true;
      case 'id':
        if (!value.contains('\u0000')) _id = value;
      default:
        // `retry` và trường lạ: bỏ qua (ứng dụng tự quyết định thời gian kết nối lại).
        break;
    }
  }

  @override
  void addError(Object error, [StackTrace? stackTrace]) => _out.addError(error, stackTrace);

  /// Phần dở dang (chưa có dòng trống kết thúc) bị bỏ.
  @override
  void close() => _out.close();
}
