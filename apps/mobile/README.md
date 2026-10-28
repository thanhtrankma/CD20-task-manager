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
  đọc thư viện ảnh/nhạc/video mà gói `open_filex` khai báo (ứng dụng chỉ cần quyền `INTERNET`; máy ảnh dùng ứng
  dụng chụp ảnh của hệ thống nên không cần quyền `CAMERA`).

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

## Cấu trúc

```
lib/
  main.dart                 Khởi động: đọc API_BASE, tạo ApiClient, AuthController
  app.dart                  Giao diện chung (theme), định tuyến go_router, thanh điều hướng dưới
  config.dart               Chọn địa chỉ API, chặn http ở bản phát hành
  constants.dart            Nhãn, màu trạng thái / ưu tiên / hạn / nhóm "Cần xử lý" (giống bản web)
  api/api_client.dart       Gọi API: cookie phiên, lỗi 401/403, OTP, tải lên / tải về
  api/session_store.dart    Lưu mã phiên trong Keychain / Keystore
  auth/auth_controller.dart Trạng thái đăng nhập (đăng nhập, chặn, hết phiên, đăng xuất)
  models/models.dart        Kiểu dữ liệu API (đọc "dễ tính", thiếu trường không lỗi)
  services/app_services.dart  AppScope, sự kiện tải lại danh sách, số thông báo chưa đọc
  services/attachments.dart   Chụp ảnh, chọn tệp, tải lên, tải về và mở tệp, dọn tệp tạm
  screens/                  Đăng nhập, Việc của tôi, Chi tiết + bảng thao tác, Thông báo, Tài khoản, màn hình chặn
  util/                     Hạn tương đối, định dạng ngày, nhóm "Cần xử lý", mô tả dòng hoạt động
  widgets/                  Thẻ nhiệm vụ, viên thuốc trạng thái / hạn, thông báo lỗi
test/                       Kiểm thử đơn vị, giao diện; live_api_test.dart chạy với API thật
assets/                     Logo (màn hình đăng nhập) và ảnh nguồn của biểu tượng ứng dụng
API-NEEDS.md                Những thay đổi API cần cho thông báo đẩy và mốc 2
```

Gói dùng: `http`, `flutter_secure_storage`, `go_router`, `intl`, `flutter_localizations` (SDK), `image_picker`,
`file_picker`, `path_provider`, `open_filex`; khi phát triển: `flutter_launcher_icons`, `flutter_lints`.

## Chưa làm (mốc sau)

Thông báo đẩy, số chưa đọc trên biểu tượng ứng dụng, khóa ứng dụng bằng sinh trắc / mã PIN, chặn chụp màn hình,
che nội dung khi chuyển ứng dụng, ghim chứng chỉ / khóa tên miền, giao nhanh, sửa / hủy nhiệm vụ trên điện thoại,
màn hình khởi động có logo. Chi tiết trong [API-NEEDS.md](API-NEEDS.md).
