# Những thay đổi API ứng dụng di động cần (chưa làm)

Mốc 1 của ứng dụng chỉ dùng API hiện có. Các mục dưới đây cần sửa `apps/api` nên **chưa làm**, ghi lại để
đưa vào lộ trình (Giai đoạn E: E3, E4, E5, E6 – E8).

## 1. Thông báo đẩy (FCM cho Android, APNs cho iOS)

### 1.1. Bảng thiết bị (Prisma)

```prisma
enum DevicePlatform {
  ANDROID
  IOS
}

/// Thiết bị di động nhận thông báo đẩy. Một người có thể có nhiều thiết bị.
model Device {
  id         Int            @id @default(autoincrement())
  userId     Int
  user       User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// Phiên đăng nhập đã đăng ký thiết bị: đăng xuất / thu hồi phiên thì xóa luôn thiết bị.
  sessionId  String?
  platform   DevicePlatform
  /// Mã FCM (Android) hoặc mã APNs dạng hex (iOS). Duy nhất toàn hệ thống.
  token      String         @unique @db.VarChar(512)
  appVersion String?        @db.VarChar(32)
  createdAt  DateTime       @default(now())
  lastSeenAt DateTime       @default(now())

  @@index([userId])
}
```

### 1.2. Điểm cuối

| Phương thức | Đường dẫn | Nội dung | Ghi chú |
|---|---|---|---|
| POST | `/api/devices` | `{ platform: 'ANDROID' \| 'IOS', token: string, appVersion?: string }` → 204 | Gọi sau khi đăng nhập và mỗi lần mở ứng dụng (mã có thể đổi). Cùng `token` đã có thì gán lại cho người dùng, phiên hiện tại và cập nhật `lastSeenAt` (máy dùng chung, đổi người đăng nhập). |
| POST | `/api/devices/unregister` | `{ token: string }` → 204 | Gọi trước `POST /api/auth/logout`. Chỉ xóa thiết bị của chính người dùng. |
| (nội bộ) | — | — | `POST /api/auth/logout` và thu hồi phiên (quản trị khóa tài khoản, đổi mật khẩu) xóa luôn thiết bị gắn với phiên đó. |

- Phân quyền: mọi vai trò trừ ADMIN; giới hạn tần suất như các điểm cuối ghi khác.
- `GET /api/notifications/settings` thêm `mobile: { devices: number }` để trang Bảo mật tài khoản trên web hiển thị.
- Xóa thiết bị khi FCM trả `UNREGISTERED` / APNs trả 410 `Unregistered`; không quá 10 thiết bị mỗi người
  (thêm thiết bị thứ 11 thì xóa thiết bị cũ nhất theo `lastSeenAt`).

### 1.3. Nội dung gửi đi: chỉ câu chung, không có nội dung nhiệm vụ

Thông báo đẩy đi qua máy chủ Google/Apple nên **chỉ chứa câu chung** (giống tiêu đề thông báo hiện nay)
và đường dẫn tới nhiệm vụ. **Không** gửi tên nhiệm vụ, nội dung, tên người, hạn, ý kiến.

```json
// FCM HTTP v1 (Android)
{
  "message": {
    "token": "<mã thiết bị>",
    "notification": { "title": "Giao nhiệm vụ", "body": "Đồng chí được giao nhiệm vụ mới" },
    "data": { "link": "/tasks/123", "notificationId": "456" },
    "android": { "priority": "HIGH", "notification": { "channel_id": "nhac_viec", "tag": "task-123" } }
  }
}
```

```json
// APNs (iOS)
{
  "aps": {
    "alert": { "title": "Giao nhiệm vụ", "body": "Đồng chí được giao nhiệm vụ mới" },
    "badge": 3,
    "sound": "default",
    "thread-id": "task-123"
  },
  "link": "/tasks/123",
  "notificationId": 456
}
```

- `body` lấy từ `title` của bản ghi thông báo (các câu đã có: "Đồng chí được giao nhiệm vụ mới",
  "Đồng chí được nhắc khẩn trương thực hiện nhiệm vụ", "Có đề nghị gia hạn nhiệm vụ chờ đồng chí xem xét"...).
  Trường `body` của bản ghi thông báo (đang là tên nhiệm vụ) **không** được đưa vào thông báo đẩy.
- `badge` (iOS) = số thông báo chưa đọc sau khi tạo thông báo này (xem mục 3).
- Bấm thông báo: ứng dụng mở `/tasks/:id` (đã có màn hình), đánh dấu `notificationId` đã đọc.
- Gửi trong `NotificationsService.deliver()` cùng chỗ với Web Push hiện nay, không chặn yêu cầu gốc
  (hàng đợi hoặc `void` có bắt lỗi), ghi nhật ký lỗi gửi nhưng không ghi nội dung.
- Cấu hình máy chủ mới (biến môi trường, không đưa vào mã nguồn): tệp khóa tài khoản dịch vụ Firebase,
  khóa APNs (.p8) + Key ID + Team ID + bundle id `vn.cdn20.giaoviec`, chọn môi trường sandbox/production.

### 1.4. Thông báo im lặng khi đọc trên thiết bị khác (không bắt buộc)

Khi người dùng đánh dấu đã đọc (`/notifications/:id/read`, `/read-all`), gửi bản tin im lặng
(`content-available: 1` trên iOS, `data`-only trên Android) chứa `{ "unread": N }` để cập nhật số trên biểu tượng.

## 2. Phiên đăng nhập trên ứng dụng

Hiện ứng dụng lấy giá trị cookie `tm_session` từ `Set-Cookie` khi đăng nhập, lưu trong Keychain/Keystore và gửi lại
qua tiêu đề `Cookie` — chạy được, không cần sửa API. Lộ trình (E2) dự kiến dùng tiêu đề `Authorization: Bearer`;
nếu làm thì cần:

- `AuthGuard` đọc thêm `Authorization: Bearer <mã phiên>` (cùng bảng phiên, cùng cơ chế thu hồi).
- `POST /api/auth/login` nhận thêm `{ client: 'mobile' }` → trả mã phiên trong thân phản hồi, không đặt cookie.
- Phiên ứng dụng có thời hạn riêng (ví dụ 30 ngày, gia hạn khi dùng) và hiện tên thiết bị trong danh sách phiên.

## 3. Số chưa đọc trên biểu tượng ứng dụng

- Đã có `GET /api/notifications/unread-count` (ứng dụng đang dùng cho huy hiệu trong ứng dụng).
- Cần thêm: gửi `badge` trong thông báo đẩy iOS (mục 1.3); Android tự hiện chấm theo thông báo chưa xóa.

## 4. Việc của mốc 2 (không cần sửa API, ghi để làm tiếp)

- **Khóa ứng dụng** bằng vân tay / khuôn mặt / mã PIN khi mở lại sau một khoảng thời gian (gói `local_auth`).
- **Chặn chụp màn hình** trên Android (`WindowManager.LayoutParams.FLAG_SECURE` trong `MainActivity`);
  **làm mờ nội dung** trong màn hình chuyển ứng dụng trên iOS (lớp che khi `sceneWillResignActive`).
- **Khóa tên miền / ghim chứng chỉ**: chỉ kết nối tới tên miền của Nhà trường; ghim khóa công khai của chứng chỉ
  (Android: `<pin-set>` trong `network_security_config.xml` bản release; Dart: `SecurityContext` riêng hoặc kiểm tra
  `badCertificateCallback` không được dùng, so khớp SPKI). Cần quy trình thay chứng chỉ có khóa dự phòng.
- **Số chưa đọc trên biểu tượng ứng dụng** (sau khi có thông báo đẩy).
- **Giao nhanh** (tên + người nhận + hạn) cho lãnh đạo, chỉ huy đơn vị: dùng `POST /api/tasks` hiện có,
  cần thêm danh sách người có thể giao (đã có `GET /api/users` theo phạm vi).
- Màn hình khởi động có logo trường (Android 12+ đang dùng biểu tượng ứng dụng; iOS đang để trống).
- Sửa / hủy nhiệm vụ, thêm người theo dõi, chia việc con trên điện thoại (bản web đã có).
