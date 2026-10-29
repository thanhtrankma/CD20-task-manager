import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import '../models/models.dart' show chatIdFromLink;
import 'push_config.dart';

/// Thông báo đẩy rút gọn: chỉ câu chung và đường dẫn (máy chủ không gửi nội dung nhiệm vụ).
class PushMessage {
  const PushMessage({this.title, this.body, this.link, this.notificationId});
  final String? title;
  final String? body;

  /// Dạng `/tasks/123` (nhiệm vụ) hoặc `/chat/5` (cuộc trò chuyện).
  final String? link;
  final int? notificationId;

  factory PushMessage.fromData({String? title, String? body, Map<String, dynamic> data = const {}}) {
    final link = data['link'];
    final nid = data['notificationId'];
    return PushMessage(
      title: title,
      body: body,
      link: link is String && link.isNotEmpty ? link : null,
      notificationId: nid is num ? nid.toInt() : int.tryParse('${nid ?? ''}'),
    );
  }

  /// Mã nhiệm vụ trong [link].
  int? get taskId {
    final m = RegExp(r'^/tasks/(\d+)$').firstMatch(link ?? '');
    return m == null ? null : int.tryParse(m.group(1)!);
  }

  /// Mã cuộc trò chuyện trong [link].
  int? get chatId => chatIdFromLink(link);
}

enum PushPermission { granted, denied }

/// Lớp gửi nhận thông báo đẩy (Firebase Cloud Messaging), tách riêng để kiểm thử.
abstract class MessagingLayer {
  Future<void> init(PushConfig config, {required bool android});
  Future<PushPermission> requestPermission();

  /// Mã thiết bị FCM; null nếu chưa lấy được (ví dụ iOS chưa có mã APNs).
  Future<String?> getToken();
  Stream<String> get onTokenRefresh;

  /// Thông báo tới khi ứng dụng đang mở.
  Stream<PushMessage> get onForegroundMessage;

  /// Người dùng bấm thông báo khi ứng dụng ở chế độ nền.
  Stream<PushMessage> get onMessageOpened;

  /// Ứng dụng được mở (từ trạng thái tắt hẳn) do bấm thông báo.
  Future<PushMessage?> initialMessage();
}

PushMessage _fromRemote(RemoteMessage m) =>
    PushMessage.fromData(title: m.notification?.title, body: m.notification?.body, data: m.data);

class FirebaseMessagingLayer implements MessagingLayer {
  FirebaseMessaging get _fm => FirebaseMessaging.instance;
  bool _android = true;

  @override
  Future<void> init(PushConfig config, {required bool android}) async {
    _android = android;
    final options = FirebaseOptions(
      apiKey: config.apiKey.trim(),
      appId: config.appIdFor(android: android),
      messagingSenderId: config.senderId.trim(),
      projectId: config.projectId.trim(),
      iosBundleId: android ? null : 'vn.cdn20.giaoviec',
    );
    if (Firebase.apps.isEmpty) {
      try {
        await Firebase.initializeApp(options: options);
      } on FirebaseException catch (e) {
        // Android: Firebase đã tự khởi tạo từ tài nguyên sinh lúc build (cùng giá trị) thì dùng luôn.
        if (e.code != 'duplicate-app') rethrow;
      }
    }
    // iOS: ứng dụng tự hiện thanh báo trong ứng dụng khi đang mở, không để hệ thống hiện thêm.
    await _fm.setForegroundNotificationPresentationOptions(alert: false, badge: true, sound: false);
  }

  @override
  Future<PushPermission> requestPermission() async {
    final s = await _fm.requestPermission(alert: true, badge: true, sound: true);
    return switch (s.authorizationStatus) {
      AuthorizationStatus.authorized || AuthorizationStatus.provisional => PushPermission.granted,
      _ => PushPermission.denied,
    };
  }

  @override
  Future<String?> getToken() async {
    if (!_android) {
      // iOS: mã FCM cần mã APNs; mã APNs có thể tới chậm vài giây sau khi cấp quyền.
      for (var i = 0; i < 10; i++) {
        if (await _fm.getAPNSToken() != null) break;
        await Future<void>.delayed(const Duration(seconds: 1));
      }
      if (await _fm.getAPNSToken() == null) return null;
    }
    return _fm.getToken();
  }

  @override
  Stream<String> get onTokenRefresh => _fm.onTokenRefresh;

  @override
  Stream<PushMessage> get onForegroundMessage => FirebaseMessaging.onMessage.map(_fromRemote);

  @override
  Stream<PushMessage> get onMessageOpened => FirebaseMessaging.onMessageOpenedApp.map(_fromRemote);

  @override
  Future<PushMessage?> initialMessage() async {
    final m = await _fm.getInitialMessage();
    return m == null ? null : _fromRemote(m);
  }
}
