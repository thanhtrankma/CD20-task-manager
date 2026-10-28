import 'dart:async';

import 'package:giaoviec/push/messaging.dart';
import 'package:giaoviec/push/push_config.dart';
import 'package:giaoviec/security/app_lock.dart';

class FakeDeviceAuth implements DeviceAuth {
  FakeDeviceAuth({this.supported = true, this.result = DeviceAuthResult.success});
  bool supported;
  DeviceAuthResult result;
  int prompts = 0;

  @override
  Future<bool> isSupported() async => supported;

  @override
  Future<DeviceAuthResult> authenticate(String reason) async {
    prompts++;
    return result;
  }
}

class FakeMessaging implements MessagingLayer {
  FakeMessaging({this.token = 'fcm-token-abcdefghijklmnopqrstuvwxyz', this.permission = PushPermission.granted});
  String? token;
  PushPermission permission;
  int inits = 0;
  int permissionRequests = 0;
  PushMessage? initial;
  bool failInit = false;
  final refresh = StreamController<String>.broadcast();
  final foreground = StreamController<PushMessage>.broadcast();
  final opened = StreamController<PushMessage>.broadcast();

  @override
  Future<void> init(PushConfig config, {required bool android}) async {
    inits++;
    if (failInit) throw StateError('không khởi tạo được');
  }

  @override
  Future<PushPermission> requestPermission() async {
    permissionRequests++;
    return permission;
  }

  @override
  Future<String?> getToken() async => token;

  @override
  Stream<String> get onTokenRefresh => refresh.stream;

  @override
  Stream<PushMessage> get onForegroundMessage => foreground.stream;

  @override
  Stream<PushMessage> get onMessageOpened => opened.stream;

  @override
  Future<PushMessage?> initialMessage() async => initial;
}

const fullPushConfig = PushConfig(
  apiKey: 'test-api-key',
  senderId: '1234567890',
  projectId: 'giaoviec-test',
  appIdAndroid: '1:1234567890:android:abc',
  appIdIos: '1:1234567890:ios:def',
);

const emptyPushConfig = PushConfig(apiKey: '', senderId: '', projectId: '', appIdAndroid: '', appIdIos: '');
