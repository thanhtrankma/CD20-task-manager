/// Cấu hình Firebase Cloud Messaging truyền khi build (không dùng google-services.json / GoogleService-Info.plist):
///
/// ```
/// --dart-define=FCM_API_KEY=... --dart-define=FCM_SENDER_ID=... --dart-define=FCM_PROJECT_ID=...
/// --dart-define=FCM_APP_ID_ANDROID=1:...:android:... --dart-define=FCM_APP_ID_IOS=1:...:ios:...
/// ```
///
/// Thiếu giá trị nào cần cho nền tảng đang chạy thì thông báo đẩy bị tắt, ứng dụng vẫn chạy bình thường.
class PushConfig {
  const PushConfig({
    required this.apiKey,
    required this.senderId,
    required this.projectId,
    required this.appIdAndroid,
    required this.appIdIos,
  });

  factory PushConfig.fromEnvironment() => const PushConfig(
        apiKey: String.fromEnvironment('FCM_API_KEY'),
        senderId: String.fromEnvironment('FCM_SENDER_ID'),
        projectId: String.fromEnvironment('FCM_PROJECT_ID'),
        appIdAndroid: String.fromEnvironment('FCM_APP_ID_ANDROID'),
        appIdIos: String.fromEnvironment('FCM_APP_ID_IOS'),
      );

  final String apiKey;
  final String senderId;
  final String projectId;
  final String appIdAndroid;
  final String appIdIos;

  /// Mã ứng dụng Firebase cho nền tảng; rỗng nếu chưa cấu hình.
  String appIdFor({required bool android}) => (android ? appIdAndroid : appIdIos).trim();

  bool isConfiguredFor({required bool android}) =>
      apiKey.trim().isNotEmpty &&
      senderId.trim().isNotEmpty &&
      projectId.trim().isNotEmpty &&
      appIdFor(android: android).isNotEmpty;
}
