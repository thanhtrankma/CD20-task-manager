# Ứng dụng di động "Giao nhiệm vụ" (Android, iOS)

Ứng dụng Flutter cho cán bộ, chỉ huy đơn vị, lãnh đạo nhận và xử lý nhiệm vụ trên điện thoại. Ứng dụng là máy khách
của API NestJS (`apps/api`, tiền tố `/api`), không có máy chủ riêng.

- Mã ứng dụng: `vn.cdn20.giaoviec`; tên hiển thị: **Giao nhiệm vụ**; biểu tượng: logo Nhà trường
  (`apps/web/public/icon-512.png`, tạo lại bằng `dart run flutter_launcher_icons`).
- Flutter 3.47.7 (Dart 3.13), Material 3, màu chủ đạo `#2563eb`, giao diện tiếng Việt, ngày dạng `dd/MM/yyyy`.

> Không soạn thảo, lưu trữ thông tin thuộc bí mật nhà nước trên hệ thống.

## Mốc 1: các màn hình

| Màn hình | Nội dung | API |
|---|---|---|
| Đăng nhập | Tên đăng nhập, mật khẩu; bước 2 nhập mã xác thực 6 số khi máy chủ báo `OTP_REQUIRED` | `POST /auth/login`, `GET /auth/me` |
| Chặn | Tài khoản phải đổi mật khẩu / bật xác thực hai lớp (làm trên web trước); tài khoản quản trị; mất kết nối | `GET /auth/me`, mã 403 `PASSWORD_CHANGE_REQUIRED`, `TWO_FACTOR_REQUIRED` |
| **Việc của tôi** (mặc định) | Mục **Cần xử lý** nhóm theo lý do (Quá hạn, Đến hạn hôm nay, Chờ đồng chí duyệt...) theo thứ tự máy chủ, nút **Đã nhận** một chạm trên thẻ việc mới; mục Được giao, Đã giao, Chờ duyệt (chỉ lãnh đạo, chỉ huy đơn vị), Theo dõi; số việc trên từng mục; kéo xuống để tải lại; cuộn để tải trang tiếp | `GET /tasks/todo`, `GET /tasks?view=&page=`, `GET /tasks/counts` |
| Chi tiết nhiệm vụ | Thông tin, chủ trì / phối hợp (đã nhận hay chưa), người theo dõi, căn cứ, việc cha / con, tệp đính kèm (tải về, mở bằng ứng dụng của máy), báo cáo, gia hạn, hoạt động, trao đổi | `GET /tasks/:id`, `GET /files/:id/download` |
| Thao tác một chạm | Đã nhận nhiệm vụ; Cập nhật tiến độ (0–100%, ghi chú); Nộp báo cáo (**chụp ảnh**, ảnh có sẵn, chọn tệp PDF/Word/Excel/PowerPoint/ảnh); Xin gia hạn; Đôn đốc (báo số lần còn lại, 429 khi quá 3 lần/ngày); Duyệt / Trả lại báo cáo; Chấp thuận / Không chấp thuận gia hạn; Theo dõi / Bỏ theo dõi; gửi ý kiến | `POST /tasks/:id/acknowledge`, `/progress`, `/submissions`, `/extensions`, `/nudge`, `/follow`, `/unfollow`, `/comments`; `POST /files?taskId=`; `POST /submissions/:id/review`; `POST /tasks/extensions/:id/decide` |
| Thông báo | Danh sách, chưa đọc tô đậm, bấm để mở nhiệm vụ (`/tasks/123`), "Đọc hết"; huy hiệu số chưa đọc trên thanh dưới (làm mới mỗi phút và khi quay lại ứng dụng) | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET /notifications/unread-count` |
| Tài khoản | Họ tên, tên đăng nhập, đơn vị, vai trò, đăng xuất | `POST /auth/logout` |

Lỗi từ API (`message` dạng chuỗi hoặc mảng) hiện trên thanh thông báo dưới màn hình.
Các thao tác hiện theo `permissions` (`manage`, `work`, `acknowledge`) và trạng thái nhiệm vụ, giống bản web.

## Mốc 2: các màn hình, chức năng mới

| Màn hình / chức năng | Nội dung | API |
|---|---|---|
| Màn hình khởi động | Nền trắng, logo Nhà trường (Android: `launch_background.xml`, Android 12+: `values-v31/styles.xml`; iOS: `LaunchScreen.storyboard` + `LaunchImage`) | — |
| **Khóa ứng dụng** | Logo, nút **Mở khóa** (vân tay / khuôn mặt **hoặc** mã khóa màn hình), nút **Đăng xuất** (bấm hai lần). Xem mục "Khóa ứng dụng" dưới đây | — |
| **Giao nhanh** (nút nổi trên "Việc của tôi", chỉ lãnh đạo, chỉ huy đơn vị) | Tên nhiệm vụ; **chủ trì**: chọn người (tìm theo tên) và/hoặc đơn vị; hạn (mặc định cuối ngày mai); mức ưu tiên; thêm nếu cần: nội dung, **căn cứ** (tối đa 500 ký tự, nhắc không ghi nội dung mật), người theo dõi. Mọi người / đơn vị được chọn là chủ trì (`LEAD`). Chỉ huy đơn vị chỉ thấy đơn vị mình và trực thuộc; ngoài phạm vi máy chủ trả 403, ứng dụng hiện câu báo của máy chủ | `GET /users?q=`, `GET /units`, `POST /tasks` |
| Quản lý nhiệm vụ (menu ⋮ ở Chi tiết, khi `permissions.manage` và việc chưa kết thúc) | **Sửa** (tên, nội dung, căn cứ, hạn, ưu tiên; chỉ gửi trường đã đổi, giữ giờ hạn cũ nếu không đổi ngày); **Thêm người theo dõi**; **Hủy nhiệm vụ** (có hỏi lại) | `PATCH /tasks/:id`, `POST /tasks/:id/followers`, `PATCH /tasks/:id {status:'CANCELLED'}` |
| **Chia việc con** (nút ở Chi tiết, khi đồng chí là người thực hiện và có quyền giao việc) | Bảng Giao nhanh có `parentId`; hạn mặc định không trễ hơn việc cha | `POST /tasks` |
| Thông báo đẩy | Xin quyền sau khi đăng nhập; đang mở ứng dụng thì hiện thanh báo câu chung + nút **Xem**; bấm thông báo khi ứng dụng ở nền / đã tắt thì mở nhiệm vụ sau khi mở khóa và đăng nhập xong. Tài khoản: trạng thái thông báo trên máy này và thông tin `mobile` của máy chủ | `POST /devices`, `POST /devices/unregister`, `GET /notifications/settings` |
| Số trên biểu tượng (iOS) | Đặt bằng số thông báo chưa đọc mỗi lần làm mới; máy chủ gửi `aps.badge` trong thông báo đẩy | — |

## Đăng nhập và bảo mật

- Máy chủ cấp cookie `tm_session` (httpOnly) khi đăng nhập. Ứng dụng lấy giá trị cookie từ `Set-Cookie`, lưu trong
  **Keychain (iOS, `first_unlock_this_device`, không đồng bộ iCloud) / Keystore (Android)** qua
  `flutter_secure_storage`, và gửi lại `Cookie: tm_session=...` trên mọi yêu cầu. Không cần sửa API.
- Không gửi tiêu đề `Origin` (máy chủ từ chối thao tác ghi có Origin lạ; không có Origin thì cho qua).
- Mọi mã 401 sau khi đăng nhập: xóa phiên, về màn hình đăng nhập với thông báo "Phiên đăng nhập đã hết hạn".
  Đăng xuất: `POST /auth/logout` (máy chủ thu hồi phiên) rồi xóa kho bảo mật.
- Dữ liệu nhiệm vụ chỉ giữ trong bộ nhớ, không ghi bộ nhớ đệm, không ghi nhật ký. Ngoại lệ duy nhất: tệp đính kèm
  khi mở phải ghi tạm vào `cache/tm_files/` để ứng dụng xem tệp của hệ điều hành đọc được; thư mục này bị xóa khi
  mở ứng dụng, khi đăng xuất và khi phiên hết hạn. Ảnh chụp / tệp chọn được đọc vào bộ nhớ, bản sao tạm do trình
  chọn tạo ra bị xóa ngay.
- Android: `allowBackup=false`, quy tắc `data_extraction_rules.xml` chặn sao lưu đám mây và chuyển máy; bỏ các quyền
  đọc thư viện ảnh/nhạc/video mà gói `open_filex` khai báo (máy ảnh dùng ứng dụng chụp ảnh của hệ thống nên không
  cần quyền `CAMERA`). Quyền ứng dụng khai báo: `INTERNET`, `POST_NOTIFICATIONS`, `USE_BIOMETRIC`; gói FCM tự thêm
  quyền nhận thông báo (`c2dm RECEIVE`, `WAKE_LOCK`, `ACCESS_NETWORK_STATE`), gói biometric thêm `USE_FINGERPRINT`.

### Khóa ứng dụng (`local_auth`)

- Khóa khi **mở ứng dụng** (khởi động lạnh, có phiên đăng nhập) và khi **quay lại sau hơn 5 phút** ở chế độ nền.
  Xác thực bằng sinh trắc **hoặc** mã khóa màn hình của máy (`biometricOnly: false`).
- **Mặc định bật** nếu máy có khóa màn hình. Tắt ở Tài khoản → **Khóa ứng dụng** (phải xác thực trước khi tắt).
- Máy chưa đặt khóa màn hình: không chặn, báo **một lần** khuyên đặt khóa màn hình (bật lại tự động khi đã đặt).
- Đang khóa: các màn hình bên dưới vẫn giữ trạng thái nhưng bị ẩn, nút Quay lại của Android không có tác dụng.
- Cài đặt bật/tắt lưu trong Keychain / Keystore (cùng chỗ mã phiên), không dùng thêm gói lưu trữ.
- Android: `MainActivity` là `FlutterFragmentActivity`, theme `Theme.AppCompat.Light.NoActionBar` (yêu cầu của
  `local_auth`), quyền `USE_BIOMETRIC`. iOS: `NSFaceIDUsageDescription`.

### Chặn chụp màn hình, che nội dung

- Android: `FLAG_SECURE` trong `MainActivity` — chặn chụp / quay màn hình, màn hình ứng dụng gần đây chỉ hiện ô trống.
- iOS: khi ứng dụng không còn hoạt động (`UIScene.willDeactivateNotification`: trình chuyển ứng dụng, Trung tâm
  điều khiển, hộp xác thực) phủ màn hình trắng có logo lên cửa sổ, bỏ khi hoạt động lại (`AppDelegate.swift`,
  lớp `PrivacyCover`). iOS không cho chặn chụp màn hình.

### Kết nối http / https

| Nơi | Bản debug | Bản phát hành (release/profile) |
|---|---|---|
| Dart (`lib/config.dart`) | Cho phép `http://` | **Từ chối** địa chỉ không phải `https://` và bắt buộc có `API_BASE` (ứng dụng hiện màn hình lỗi cấu hình, không chạy tiếp) |
| Android `network_security_config.xml` | `src/debug/...`: chỉ cho http tới `10.0.2.2`, `localhost`, `127.0.0.1` | `src/main/...`: cấm http, chỉ tin chứng chỉ gốc của hệ thống; `usesCleartextTraffic=false` |
| iOS ATS (`Info.plist`) | Không thêm ngoại lệ | Không thêm ngoại lệ (ATS mặc định chỉ cho https) |

Ghi chú: từ Flutter 2.0, thư viện mạng `dart:io` không chịu ràng buộc của ATS (iOS) và network security config
(Android) — chính sách "chặn http mặc định" của Flutter 1.22 đã bị bỏ. Vì vậy chốt chặn thật sự là kiểm tra trong
`config.dart`; cấu hình Android/iOS ở trên là lớp phòng thủ thêm (áp dụng cho mạng của nền tảng). Không cần ngoại lệ
ATS cho bản debug trên giả lập iOS (đã thử: `HttpClient` gọi `http://localhost:3100/api/auth/me` từ giả lập iPhone SE
nhận 401 của máy chủ, không bị ATS chặn).

## Chạy ứng dụng

Chuẩn bị: API đang chạy ở cổng 3100 (`apps/api`), Flutter 3.47.7, Xcode 26 (iOS), Android SDK (Android).

```bash
cd apps/mobile
flutter pub get
```

### Giả lập Android

```bash
flutter emulators --launch <tên giả lập>     # hoặc mở từ Android Studio
flutter run                                  # mặc định API: http://10.0.2.2:3100 (máy tính chạy giả lập)
```

### Giả lập iOS

```bash
open -a Simulator
flutter run -d "iPhone 16"                   # mặc định API: http://localhost:3100
```

### Máy thật

- **Android, cắm cáp USB**: chuyển cổng máy tính sang điện thoại rồi dùng `localhost` (được phép http trong bản debug):
  ```bash
  adb reverse tcp:3100 tcp:3100
  flutter run --dart-define=API_BASE=http://localhost:3100
  ```
- **iPhone / Android qua mạng**: dùng máy chủ có https (ví dụ máy chủ thử nghiệm sau Caddy):
  ```bash
  flutter run --dart-define=API_BASE=https://<tên miền máy chủ>
  ```
  Bản debug Android chỉ cho http tới `10.0.2.2`/`localhost`/`127.0.0.1`; muốn dùng http tới IP máy tính trong
  mạng LAN thì phải thêm IP vào `android/app/src/debug/res/xml/network_security_config.xml` (chỉ ở máy mình,
  không đưa lên kho mã). iPhone thật cần tài khoản Apple Developer để ký (mở `ios/Runner.xcworkspace`,
  chọn Team trong Signing & Capabilities).

### `API_BASE`

| Trường hợp | Giá trị |
|---|---|
| Không truyền, bản debug, Android | `http://10.0.2.2:3100` |
| Không truyền, bản debug, iOS | `http://localhost:3100` |
| Bản phát hành | **Bắt buộc** truyền, phải là `https://...` |

Chỉ ghi gốc máy chủ, không có `/api` (ứng dụng tự thêm). Ví dụ: `--dart-define=API_BASE=https://giaoviec.cdn20.edu.vn`.

## Thông báo đẩy (Firebase Cloud Messaging cho cả Android và iOS)

Không truyền cấu hình Firebase thì thông báo đẩy **tắt**: ứng dụng vẫn build và chạy bình thường, màn hình Tài khoản
ghi "Thông báo trên điện thoại này chưa được cấu hình". Không dùng `google-services.json` /
`GoogleService-Info.plist` và không dùng plugin Gradle `google-services`; mọi giá trị truyền bằng `--dart-define`.

### Bật thông báo đẩy

1. **Tạo dự án Firebase** (console.firebase.google.com), tắt Google Analytics khi tạo.
2. **Thêm ứng dụng Android** mã `vn.cdn20.giaoviec` và **ứng dụng iOS** bundle id `vn.cdn20.giaoviec`. Không cần
   tải tệp cấu hình về; chỉ ghi lại các giá trị trong *Project settings → General*:
   `Web API Key` (hoặc `apiKey`), `Project ID`, `Project number` (= Sender ID), `App ID` của từng ứng dụng.
3. **iOS – tải khóa APNs lên Firebase**: trên developer.apple.com tạo *Key* có bật *Apple Push Notifications service
   (APNs)*, tải tệp `.p8`, ghi lại Key ID và Team ID; trong Firebase *Project settings → Cloud Messaging → Apple app
   configuration* tải tệp `.p8` lên (kèm Key ID, Team ID). Trong Xcode, App ID `vn.cdn20.giaoviec` phải bật
   *Push Notifications* (ứng dụng đã khai báo `Runner.entitlements` với `aps-environment`, chế độ nền
   `remote-notification`). Khi xuất bản TestFlight / App Store, Xcode tự dùng môi trường `production`.
4. **Máy chủ**: cấu hình tài khoản dịch vụ Firebase cho `apps/api` (xem tài liệu API). `GET /notifications/settings`
   trả `mobile.enabled = true` khi máy chủ đã sẵn sàng gửi.
5. **Build ứng dụng** với các giá trị trên (đặt trong tệp riêng, không đưa lên kho mã):

```bash
flutter build apk --release \
  --dart-define=API_BASE=https://<tên miền> \
  --dart-define=FCM_API_KEY=<apiKey> \
  --dart-define=FCM_SENDER_ID=<project number> \
  --dart-define=FCM_PROJECT_ID=<project id> \
  --dart-define=FCM_APP_ID_ANDROID=1:<số>:android:<mã> \
  --dart-define=FCM_APP_ID_IOS=1:<số>:ios:<mã>
# hoặc gom vào tệp: --dart-define-from-file=fcm.json (tệp này không đưa lên kho mã)
```

Android cần đủ `FCM_API_KEY`, `FCM_SENDER_ID`, `FCM_PROJECT_ID`, `FCM_APP_ID_ANDROID`; iOS cần ba giá trị đầu và
`FCM_APP_ID_IOS`. Gradle (`android/app/build.gradle.kts`) đọc các giá trị này để sinh tài nguyên chuỗi giống plugin
google-services, nhờ đó Firebase tự khởi tạo cả khi ứng dụng được mở do bấm thông báo lúc đã tắt hẳn.

### Hoạt động

- Sau khi đăng nhập và mỗi lần mở ứng dụng khi đã đăng nhập: xin quyền (Android 13+ `POST_NOTIFICATIONS`; iOS
  thông báo, số trên biểu tượng, âm thanh), lấy mã FCM, gọi `POST /api/devices`
  `{platform: 'ANDROID'|'IOS', provider: 'FCM', token, appVersion}`. Mã đổi (`onTokenRefresh`) thì đăng ký lại.
  Máy chủ trả 404 (bản API cũ) thì bỏ qua, Tài khoản ghi "Máy chủ chưa hỗ trợ".
- Đăng xuất: `POST /api/devices/unregister {token}` **trước** `POST /api/auth/logout`. Phiên hết hạn / bị thu hồi:
  máy chủ tự xóa thiết bị gắn với phiên.
- Android: kênh thông báo `nhac_viec` ("Nhắc việc", mức cao) tạo trong `MainActivity`; biểu tượng nhỏ
  `ic_stat_notify`, màu `#2563EB`.
- Nội dung thông báo chỉ là câu chung (máy chủ không gửi tên, nội dung nhiệm vụ) và `data.link = /tasks/:id`.
  Ứng dụng **không ghi** mã thiết bị và nội dung thông báo vào nhật ký (chỉ ghi trạng thái ở bản debug).

## Build

```bash
flutter analyze
flutter test                                              # kiểm thử đơn vị + giao diện (không cần máy chủ)
flutter build apk --debug                                 # build/app/outputs/flutter-apk/app-debug.apk
flutter build ios --simulator --debug                     # build/ios/iphonesimulator/Runner.app

# Phát hành (cần khóa ký Android, tài khoản Apple Developer):
flutter build apk --release --dart-define=API_BASE=https://<tên miền>
flutter build appbundle --release --dart-define=API_BASE=https://<tên miền>
flutter build ipa --release --dart-define=API_BASE=https://<tên miền>
```

Bản release Android hiện vẫn ký bằng khóa debug (mặc định của Flutter); cần tạo khóa ký của Nhà trường trước khi
phát hành (E9).

### Kiểm thử với API thật

```bash
LIVE_API=http://localhost:3100 flutter test test/live_api_test.dart
```

Đăng nhập `canbo` (cán bộ) và `truongkhoa` (chỉ huy đơn vị) bằng `DEMO_PASSWORD` đọc từ `apps/api/.env` (không in
ra), tạo **một** nhiệm vụ "[Thử app] Kiểm tra ứng dụng di động" rồi đi hết vòng đời: đã nhận → tiến độ → theo dõi /
bỏ theo dõi → ý kiến → xin gia hạn → đọc thông báo → đôn đốc → chấp thuận gia hạn → tải ảnh lên → nộp báo cáo →
tải tệp về → duyệt → Hoàn thành → đăng xuất. Không đặt `LIVE_API` thì kiểm thử này bị bỏ qua.

Mốc 2:

```bash
LIVE_API=http://localhost:3100 flutter test test/live_m2_test.dart
```

`truongkhoa` giao nhanh "[Thử app] ..." cho `canbo` → sửa (chỉ gửi trường đổi) → thêm người theo dõi → giao cho
đơn vị mình → chia việc con → thử giao ra ngoài phạm vi (403) → hủy cả ba nhiệm vụ đã tạo → đăng ký / hủy đăng ký
một mã thiết bị giả (máy chủ chưa có `/devices` thì bỏ qua phần này) → đăng xuất.

## Cấu trúc

```
lib/
  main.dart                 Khởi động: đọc API_BASE, tạo ApiClient, AuthController, AppLock, PushService
  app.dart                  Giao diện chung (theme), định tuyến go_router, thanh điều hướng dưới
  config.dart               Chọn địa chỉ API, chặn http ở bản phát hành
  constants.dart            Nhãn, màu trạng thái / ưu tiên / hạn / nhóm "Cần xử lý" (giống bản web)
  api/api_client.dart       Gọi API: cookie phiên, lỗi 401/403, OTP, tải lên / tải về
  api/session_store.dart    Lưu mã phiên trong Keychain / Keystore
  auth/auth_controller.dart Trạng thái đăng nhập (đăng nhập, chặn, hết phiên, đăng xuất)
  models/models.dart        Kiểu dữ liệu API (đọc "dễ tính", thiếu trường không lỗi)
  services/app_services.dart  AppScope, sự kiện tải lại danh sách, số thông báo chưa đọc
  services/attachments.dart   Chụp ảnh, chọn tệp, tải lên, tải về và mở tệp, dọn tệp tạm
  services/prefs.dart       Cài đặt nhỏ (khóa ứng dụng bật/tắt) trong Keychain / Keystore
  services/badge.dart       Số trên biểu tượng ứng dụng (iOS, kênh gốc vn.cdn20.giaoviec/app)
  security/                 Khóa ứng dụng (thời gian khóa lại, xác thực) và màn hình khóa
  push/                     Cấu hình FCM từ dart-define, lớp FCM (tách để kiểm thử), đăng ký thiết bị
  util/task_forms.dart      Dữ liệu Giao nhanh / Sửa nhiệm vụ: kiểm tra, thân yêu cầu, chỉ gửi trường đã đổi
  screens/                  Đăng nhập, Việc của tôi, Chi tiết + bảng thao tác, Giao nhanh / Sửa (task_manage.dart),
                            chọn người / đơn vị (pickers.dart), Thông báo, Tài khoản, màn hình chặn
  util/                     Hạn tương đối, định dạng ngày, nhóm "Cần xử lý", mô tả dòng hoạt động
  widgets/                  Thẻ nhiệm vụ, viên thuốc trạng thái / hạn, thông báo lỗi
test/                       Kiểm thử đơn vị, giao diện; live_api_test.dart, live_m2_test.dart chạy với API thật
assets/                     Logo (màn hình đăng nhập) và ảnh nguồn của biểu tượng ứng dụng
API-NEEDS.md                Những thay đổi API cần cho thông báo đẩy và mốc 2
```

Gói dùng: `http`, `flutter_secure_storage`, `go_router`, `intl`, `flutter_localizations` (SDK), `image_picker`,
`file_picker`, `path_provider`, `open_filex`; mốc 2 (ghim đúng phiên bản): `local_auth` 3.0.2 (kèm
`local_auth_android` 2.2.0, `local_auth_darwin` 2.0.4), `firebase_core` 4.15.0, `firebase_messaging` 16.7.0;
khi phát triển: `flutter_launcher_icons`, `flutter_lints`. Màn hình khởi động cấu hình thủ công, không dùng gói.

## Chưa làm (mốc sau)

Ghim chứng chỉ / khóa tên miền (SPKI pinning), số chưa đọc trên biểu tượng ứng dụng Android, tệp đính kèm khi giao
nhanh trên điện thoại. Chi tiết trong [API-NEEDS.md](API-NEEDS.md).
