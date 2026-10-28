import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/config.dart';

void main() {
  test('debug: mặc định theo nền tảng giả lập', () {
    expect(resolveApiBase(define: '', isRelease: false, isAndroid: true), 'http://10.0.2.2:3100');
    expect(resolveApiBase(define: '', isRelease: false, isAndroid: false), 'http://localhost:3100');
  });

  test('bỏ dấu / cuối', () {
    expect(resolveApiBase(define: 'https://gv.example.vn/', isRelease: true), 'https://gv.example.vn');
  });

  test('bản phát hành từ chối http và thiếu địa chỉ', () {
    expect(() => resolveApiBase(define: 'http://gv.example.vn', isRelease: true), throwsA(isA<ConfigError>()));
    expect(() => resolveApiBase(define: '', isRelease: true), throwsA(isA<ConfigError>()));
  });

  test('debug cho phép http do người dùng truyền', () {
    expect(resolveApiBase(define: 'http://192.168.1.5:3100', isRelease: false), 'http://192.168.1.5:3100');
  });

  test('địa chỉ sai', () {
    expect(() => resolveApiBase(define: 'gv.example.vn', isRelease: false), throwsA(isA<ConfigError>()));
  });

  test('appVersion khớp pubspec.yaml', () {
    final m = RegExp(r'^version:\s*([0-9.]+)', multiLine: true).firstMatch(File('pubspec.yaml').readAsStringSync());
    expect(appVersion, m!.group(1));
  });
}
