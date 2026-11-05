# Hướng dẫn chạy thử ứng dụng trên máy tính cá nhân

Chạy toàn bộ hệ thống (CSDL, API, web, ứng dụng điện thoại trên máy ảo) trên máy Mac của cán bộ phát triển để
trình diễn, kiểm tra trước khi đưa lên máy chủ. Dữ liệu chỉ nằm trên máy này.

> Không nhập thông tin thuộc bí mật nhà nước kể cả khi chạy thử. Chỉ dùng dữ liệu giả định.

## 1. Chuẩn bị (cài một lần)

| Phần mềm | Dùng để | Kiểm tra |
|---|---|---|
| Docker (Docker Desktop hoặc Colima) | Chạy CSDL PostgreSQL, hộp thư giả Mailpit | `docker info` |
| Node.js **24** | Chạy API, web | `node -v` → `v24.x` |
| Flutter, Xcode (chỉ khi chạy ứng dụng điện thoại) | Máy ảo iPhone | `flutter doctor` |

Máy có nhiều bản Node (Homebrew): thêm Node 24 vào đầu PATH trước khi chạy lệnh:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
```

## 2. Cài đặt lần đầu

Bỏ qua mục này nếu máy đã chạy được trước đó (đã có `apps/api/.env`).

```bash
cd task-manager
cd apps/api && npm install && cd ../web && npm install && cd ../..
cp apps/api/.env.example apps/api/.env
```

Mở `apps/api/.env`, điền:

| Biến | Giá trị |
|---|---|
| `APP_SECRET` | Chạy `openssl rand -hex 32`, dán kết quả |
| `ADMIN_PASSWORD` | Mật khẩu tạm của tài khoản `admin` (≥ 10 ký tự, có chữ và số) |
| `DEMO_PASSWORD` | Mật khẩu chung của các tài khoản mẫu |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Chạy `npx web-push generate-vapid-keys` (thông báo trên trình duyệt) |
| `DATABASE_URL` | Giữ mặc định; cổng 5432 đã bận thì đổi sang `55432` |
| `COOKIE_SECURE` | `false` (chạy bằng http trên máy cá nhân) |

Tạo CSDL, tài khoản mẫu:

```bash
docker compose -f infra/docker-compose.dev.yml up -d     # cổng 55432: thêm DEV_DB_PORT=55432 ở đầu lệnh
cd apps/api
npx prisma migrate deploy
npm run seed:demo        # admin, 14 đầu mối của trường, tài khoản chỉ huy từng đơn vị, nhiệm vụ, trò chuyện mẫu
```

## 3. Chạy hằng ngày: một lệnh

```bash
infra/scripts/dev-local.sh
```

Lệnh này khởi động Docker (Colima) nếu chưa chạy, bật CSDL và hộp thư giả, cập nhật cấu trúc CSDL, rồi chạy
**API ở cổng 3100** và **web ở cổng 5173**. Bấm **Ctrl+C** để dừng.

| Địa chỉ | Là gì |
|---|---|
| http://localhost:5173 | Bản web |
| http://localhost:8025 | Hộp thư giả: xem thư nhắc việc hệ thống gửi |
| http://localhost:3100/api/health | Kiểm tra API |

Cổng đang bị chương trình khác dùng (ví dụ dự án khác chiếm 5173):

```bash
API_PORT=3200 WEB_PORT=5180 infra/scripts/dev-local.sh
```

<details>
<summary>Chạy từng phần bằng tay (3 cửa sổ Terminal)</summary>

```bash
# Cửa sổ 1: CSDL, hộp thư giả
DEV_DB_PORT=55432 docker compose -f infra/docker-compose.dev.yml up -d

# Cửa sổ 2: API
cd apps/api && PORT=3100 LOGIN_RATE_LIMIT=100 npm run dev

# Cửa sổ 3: web
cd apps/web && API_PORT=3100 npm run dev
```
</details>

## 4. Tài khoản chạy thử

Mật khẩu các tài khoản mẫu là `DEMO_PASSWORD` trong `apps/api/.env`.

| Tài khoản | Vai trò | Đơn vị | Ghi chú |
|---|---|---|---|
| `lanhdao` | Lãnh đạo (Hiệu trưởng) | Ban Giám hiệu | Bắt buộc xác thực hai lớp (cần ứng dụng Google/Microsoft Authenticator) |
| `phohieutruong` | Lãnh đạo (Phó Hiệu trưởng) | Ban Giám hiệu | Bắt buộc xác thực hai lớp |
| `truongkhoa` | Chỉ huy đơn vị | Khoa Công nghệ thông tin và Công nghệ may | |
| `canbo`, `canbo2` | Cán bộ | Bộ môn Mạng máy tính (thuộc Khoa), Khoa CNTT và CN may | |
| `truongphongdt`, `truongphongct`, `truongphonghc` | Chỉ huy đơn vị | Phòng Đào tạo, Phòng Chính trị và CTSV, Phòng Hậu cần - Kỹ thuật | |
| `truongbankt`, `truongbanhc`, `truongbantc` | Chỉ huy đơn vị | Ban Khảo thí và BĐCL, Ban Hành chính, Ban Tài chính | |
| `truongkhoakt`, `truongkhoadien`, `truongkhoack` | Chỉ huy đơn vị | Khoa KT-KT tổng hợp, Khoa Điện - Điện tử - Điện lạnh, Khoa Cơ khí động lực | |
| `giamdoctt1`, `giamdoctt2`, `giamdoctt3` | Chỉ huy đơn vị | Trung tâm Đào tạo và Sát hạch lái xe số 1, 2, 3 | |
| `canbodt` | Cán bộ | Phòng Đào tạo | |
| `canbonhansu` | Cán bộ, phụ trách nhân sự – chấm công | Phòng Chính trị và CTSV | Menu **Nhân sự**: nhập dữ liệu chấm công, quỹ phép, cấu hình |
| `admin` | Quản trị | Nhà trường | Đổi mật khẩu lần đầu, bắt buộc xác thực hai lớp |

Muốn thử nhanh không cần điện thoại xác thực: thêm dòng `REQUIRE_2FA_ROLES=` (để trống) vào `apps/api/.env`,
chạy lại. Chỉ dùng khi chạy thử; máy chủ thật luôn bắt buộc.

**Quên mật khẩu, mất mã xác thực hai lớp** (kể cả tài khoản `admin`):

```bash
cd apps/api
npm run reset-password -- admin              # in mật khẩu tạm, phải đổi khi đăng nhập
npm run reset-password -- lanhdao --reset-2fa   # đồng thời tắt xác thực hai lớp để bật lại
```

Lệnh ghi vào nhật ký hệ thống và đăng xuất tài khoản đó khỏi mọi nơi.

## 5. Kịch bản chạy thử gợi ý (khoảng 20 phút)

Dùng hai trình duyệt khác nhau (hoặc một cửa sổ thường, một cửa sổ ẩn danh) để đăng nhập hai người cùng lúc.

1. **Giao việc** (cửa sổ 1, `truongkhoa`): bấm **Giao việc mới** → nhập tên, căn cứ, hạn, chọn chủ trì `Lê Thị Hà`
   → Giao.
2. **Nhận việc** (cửa sổ 2, `canbo`): chuông thông báo có số mới; mục **Cần xử lý** có việc vừa giao → **Đã nhận**
   → cập nhật tiến độ 50% → **Nộp báo cáo** kèm một tệp PDF hoặc ảnh.
3. **Duyệt** (cửa sổ 1): mục **Chờ duyệt** → mở việc → **Duyệt** hoặc **Trả lại** kèm lý do.
4. **Gia hạn, đôn đốc**: cán bộ bấm **Xin gia hạn**; chỉ huy chấp thuận; chỉ huy bấm **Đôn đốc**.
5. **Tìm kiếm, bộ lọc, Excel**: **Việc của tôi** → ô tìm kiếm, nút **Bộ lọc**, **Xuất Excel**.
6. **Thống kê**: mục **Thống kê** (chỉ huy, lãnh đạo), chọn kỳ, xuất Excel.
7. **Trò chuyện**: mục **Trò chuyện** → **Mới** → **Nhắn riêng** cho người ở cửa sổ kia; tin hiện ngay không cần tải
   lại. Thử **Tạo nhóm**, **Nhóm theo đơn vị** (chỉ huy), thu hồi tin.
8. **Tài khoản**: **Tài khoản & nhắc việc** → đổi ảnh đại diện, bật thông báo trên trình duyệt, **Gửi thông báo thử**.
   Nhập địa chỉ thư bất kỳ rồi gửi thử: thư hiện ở http://localhost:8025.
9. **Nghỉ phép, chấm công**: `canbo2` → **Nghỉ phép** → **Đăng ký nghỉ** 2 ngày; `truongkhoa` → **Nghỉ phép** →
   **Chờ tôi duyệt** → Duyệt. Đơn quá 3 ngày chuyển tiếp `lanhdao`. **Chấm công**: lịch tháng của mình;
   `truongkhoa` → **Bảng công** → Xuất Excel; `canbonhansu` → **Dữ liệu chấm công** → nhập tệp (xem `docs/cham-cong.md`).
10. **Quản trị** (`admin`): **Tài khoản** (thêm, nhập từ Excel, khóa, đặt lại mật khẩu), **Đơn vị**, **Nhật ký hệ thống**
   (xem lại các thao tác vừa làm).
11. **Phân quyền**: đăng nhập `canbo` → không thấy mục Thống kê, chỉ thấy việc của mình; `admin` không thấy nhiệm vụ,
    trò chuyện.

## 6. Chạy ứng dụng điện thoại trên máy ảo iPhone

API phải đang chạy ở cổng 3100 (mục 3).

```bash
export PATH="$HOME/flutter/bin:$PATH"
open -a Simulator                      # mở máy ảo iPhone
cd apps/mobile
flutter run -d "iPhone 16"             # mặc định kết nối http://localhost:3100
```

API chạy ở cổng khác: `flutter run -d "iPhone 16" --dart-define=API_BASE=http://localhost:3200`.

**Khóa ứng dụng trên máy ảo**: ứng dụng yêu cầu xác thực bằng khuôn mặt hoặc mật mã máy khi mở lại. Trên máy ảo,
bật khuôn mặt giả lập: menu Simulator **Features → Face ID → Enrolled**; khi ứng dụng hỏi, chọn
**Features → Face ID → Matching Face**. Hoặc tắt **Khóa ứng dụng** trong mục **Tài khoản** của ứng dụng.

Thông báo đẩy về điện thoại cần dự án Firebase, khóa Apple (chưa có khi chạy thử); các chức năng khác dùng bình thường.
Máy ảo Android: xem `apps/mobile/README.md`.

## 7. Dừng, làm lại từ đầu

```bash
# Dừng API, web: Ctrl+C ở cửa sổ đang chạy dev-local.sh
docker compose -f infra/docker-compose.dev.yml stop      # dừng CSDL, hộp thư giả (giữ dữ liệu)
colima stop                                              # nếu dùng Colima, tắt hẳn Docker
```

Xóa hết dữ liệu chạy thử, làm lại từ đầu (**không lấy lại được**):

```bash
docker compose -f infra/docker-compose.dev.yml down -v   # xóa CSDL
rm -rf apps/api/uploads                                  # xóa tệp đính kèm, ảnh đại diện
# rồi chạy lại các lệnh "Tạo CSDL, tài khoản mẫu" ở mục 2
```

## 8. Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `Cần Node.js 24` hoặc lỗi lạ khi chạy API | Dùng Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` |
| `Docker chưa chạy` / `Cannot connect to the Docker daemon` | `colima start` (hoặc mở Docker Desktop) |
| `Cổng ... đang bị chương trình khác dùng` | Chạy với `API_PORT=... WEB_PORT=...` khác |
| Đăng nhập báo **quá nhiều lần thử** (429) | Chờ 1 phút; `dev-local.sh` đã nới giới hạn cho máy cá nhân |
| Tài khoản bị khóa do nhập sai nhiều lần | `npm run reset-password -- <tên>` (mục 4) |
| Đăng nhập xong lại quay về trang đăng nhập | Kiểm tra `COOKIE_SECURE=false` trong `apps/api/.env`; mở đúng `http://localhost:5173` |
| Báo lỗi CSDL `P1001` / không kết nối được | CSDL chưa chạy hoặc sai cổng trong `DATABASE_URL` |
| Ứng dụng iPhone báo không kết nối được máy chủ | API phải chạy ở cổng 3100, hoặc chạy lại `flutter run` với `--dart-define=API_BASE=...` |

## 9. Kiểm thử tự động

```bash
cd apps/api && npm test               # 128 bài, dùng CSDL riêng ..._test, không đụng dữ liệu chạy thử
cd apps/mobile && flutter test        # 138 bài
```
