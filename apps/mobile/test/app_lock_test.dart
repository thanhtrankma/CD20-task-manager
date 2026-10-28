import 'package:flutter_test/flutter_test.dart';
import 'package:giaoviec/security/app_lock.dart';
import 'package:giaoviec/services/prefs.dart';

import 'fakes.dart';

void main() {
  late DateTime now;
  late FakeDeviceAuth deviceAuth;
  late MemoryPrefsStore prefs;
  var signedIn = true;

  AppLock make() => AppLock(deviceAuth: deviceAuth, prefs: prefs, isSignedIn: () => signedIn, clock: () => now);

  setUp(() {
    now = DateTime(2026, 10, 28, 8);
    deviceAuth = FakeDeviceAuth();
    prefs = MemoryPrefsStore();
    signedIn = true;
  });

  test('ngưỡng khóa lại: quá 5 phút mới khóa', () {
    final t = DateTime(2026, 1, 1, 8);
    expect(AppLock.shouldRelock(t, t.add(const Duration(minutes: 5))), isFalse);
    expect(AppLock.shouldRelock(t, t.add(const Duration(minutes: 5, seconds: 1))), isTrue);
    expect(AppLock.shouldRelock(t, t.add(const Duration(seconds: 30))), isFalse);
  });

  test('khởi động lạnh có phiên: khóa ngay (mặc định bật)', () async {
    final lock = make();
    await lock.init();
    expect(lock.enabled, isTrue);
    expect(lock.locked, isTrue);
    expect(await lock.unlock(), isTrue);
    expect(lock.locked, isFalse);
  });

  test('chưa đăng nhập: không khóa', () async {
    signedIn = false;
    final lock = make();
    await lock.init();
    expect(lock.locked, isFalse);
  });

  test('quay lại sau 4 phút không khóa, sau 6 phút khóa', () async {
    final lock = make();
    await lock.init();
    await lock.unlock();

    lock.onBackground();
    now = now.add(const Duration(minutes: 4));
    await lock.onForeground();
    expect(lock.locked, isFalse);

    lock.onBackground();
    now = now.add(const Duration(minutes: 6));
    await lock.onForeground();
    expect(lock.locked, isTrue);
  });

  test('thời gian tính từ lần xuống nền đầu tiên (hidden rồi paused)', () async {
    final lock = make();
    await lock.init();
    await lock.unlock();
    lock.onBackground();
    now = now.add(const Duration(minutes: 3));
    lock.onBackground(); // paused sau hidden: không đặt lại mốc
    now = now.add(const Duration(minutes: 3));
    await lock.onForeground();
    expect(lock.locked, isTrue);
  });

  test('xác thực thất bại: vẫn khóa, có thông báo lỗi', () async {
    deviceAuth.result = DeviceAuthResult.failed;
    final lock = make();
    await lock.init();
    expect(await lock.unlock(), isFalse);
    expect(lock.locked, isTrue);
    expect(lock.error, isNotNull);
  });

  test('tắt khóa phải xác thực; đã tắt thì không khóa khi mở lại', () async {
    final lock = make();
    await lock.init();
    await lock.unlock();

    deviceAuth.result = DeviceAuthResult.failed;
    expect(await lock.setEnabled(false), isFalse);
    expect(lock.enabled, isTrue);

    deviceAuth.result = DeviceAuthResult.success;
    expect(await lock.setEnabled(false), isTrue);
    expect(prefs.values['app_lock_enabled'], 'false');

    final again = make();
    await again.init();
    expect(again.enabled, isFalse);
    expect(again.locked, isFalse);
  });

  test('máy chưa đặt khóa màn hình: không khóa, báo một lần', () async {
    deviceAuth.supported = false;
    final lock = make();
    await lock.init();
    expect(lock.locked, isFalse);
    expect(lock.noticePending, isTrue);
    await lock.markNoticeShown();

    final again = make();
    await again.init();
    expect(again.noticePending, isFalse);
  });

  test('đặt lại khi đăng xuất; nút Quay lại bị chặn khi khóa', () async {
    final lock = make();
    await lock.init();
    expect(await lock.didPopRoute(), isTrue);
    lock.reset();
    expect(lock.locked, isFalse);
    expect(await lock.didPopRoute(), isFalse);
  });
}
