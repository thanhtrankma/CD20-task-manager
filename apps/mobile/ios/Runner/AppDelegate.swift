import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private let privacyCover = PrivacyCover()
  private var appChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    privacyCover.start()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    // Kênh riêng của ứng dụng: đặt số trên biểu tượng ứng dụng (số thông báo chưa đọc).
    guard let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "GiaoViecApp") else { return }
    let channel = FlutterMethodChannel(name: "vn.cdn20.giaoviec/app", binaryMessenger: registrar.messenger())
    channel.setMethodCallHandler { call, result in
      switch call.method {
      case "setBadge":
        let count = max(0, (call.arguments as? Int) ?? 0)
        if #available(iOS 16.0, *) {
          UNUserNotificationCenter.current().setBadgeCount(count) { _ in }
        } else {
          UIApplication.shared.applicationIconBadgeNumber = count
        }
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
    appChannel = channel
  }
}

/// Che nội dung bằng màn hình logo khi ứng dụng không còn hoạt động (ảnh chụp trong trình chuyển ứng dụng,
/// Trung tâm điều khiển, hộp xác thực của hệ thống). Theo dõi thông báo của UIScene để không phải ghi đè
/// các phương thức của FlutterSceneDelegate (Flutter cần chúng để báo trạng thái vòng đời).
final class PrivacyCover {
  private var covers: [ObjectIdentifier: UIView] = [:]

  func start() {
    let center = NotificationCenter.default
    center.addObserver(
      forName: UIScene.willDeactivateNotification, object: nil, queue: .main
    ) { [weak self] note in
      guard let scene = note.object as? UIWindowScene else { return }
      self?.cover(scene)
    }
    center.addObserver(
      forName: UIScene.didActivateNotification, object: nil, queue: .main
    ) { [weak self] note in
      guard let scene = note.object as? UIWindowScene else { return }
      self?.uncover(scene)
    }
  }

  private func cover(_ scene: UIWindowScene) {
    let id = ObjectIdentifier(scene)
    guard covers[id] == nil,
      let window = scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first
    else { return }
    let view = UIView(frame: window.bounds)
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.backgroundColor = .white
    let logo = UIImageView(image: UIImage(named: "LaunchImage"))
    logo.contentMode = .scaleAspectFit
    logo.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(logo)
    NSLayoutConstraint.activate([
      logo.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      logo.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      logo.widthAnchor.constraint(equalToConstant: 128),
      logo.heightAnchor.constraint(equalToConstant: 128),
    ])
    window.addSubview(view)
    covers[id] = view
  }

  private func uncover(_ scene: UIWindowScene) {
    covers.removeValue(forKey: ObjectIdentifier(scene))?.removeFromSuperview()
  }
}
