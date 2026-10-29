# Phần mềm quản lý giao việc, nộp báo cáo, theo dõi tiến độ

Phần mềm nội bộ của Nhà trường. Lộ trình phát triển: xem [roadmap.md](roadmap.md).
Hướng dẫn sử dụng theo vai trò: [docs/huong-dan-su-dung.md](docs/huong-dan-su-dung.md).
Vận hành (triển khai, sao lưu, khôi phục, giám sát, sự cố): [docs/van-hanh.md](docs/van-hanh.md).
Dự thảo hồ sơ cấp độ: [docs/ho-so-cap-do-du-thao.md](docs/ho-so-cap-do-du-thao.md).

> **Không soạn thảo, lưu trữ, truyền đưa thông tin thuộc bí mật nhà nước trên hệ thống này.**

## Cấu trúc

```
task-manager/
├── apps/
│   ├── api/          NestJS 12 + Prisma 7 (PostgreSQL)
│   │   ├── prisma/   schema.prisma, migrations
│   │   └── src/
│   │       ├── common/    decorator, mã hóa, mật khẩu, ghi nhật ký
│   │       ├── modules/   auth, users, units, tasks, submissions, files,
│   │       │              notifications, dashboard, audit
│   │       └── cli/seed.ts
│   ├── web/          React 19 + Vite 8 + Ant Design 6
│   │   └── src/      api/, auth/, layouts/, pages/
│   └── mobile/       Ứng dụng Flutter (Android, iOS), xem apps/mobile/README.md
├── infra/            docker-compose, Caddyfile, scripts sao lưu/khôi phục
└── docs/             tài liệu
```

## Chạy trên máy phát triển

Yêu cầu: **Node.js 24 LTS** (xem `.nvmrc`; NestJS 12 và Prisma 7 không chạy trên Node 23), Docker.

```bash
# 1. CSDL + hộp thư giả Mailpit (xem thư nhắc việc tại http://localhost:8025)
docker compose -f infra/docker-compose.dev.yml up -d

# 2. API (cổng 3000)
cd apps/api
cp .env.example .env          # điền APP_SECRET (openssl rand -hex 32), ADMIN_PASSWORD, DEMO_PASSWORD,
                              # VAPID_* (npx web-push generate-vapid-keys)
npm install
npx prisma migrate dev        # tạo bảng (client Prisma sinh vào src/generated, tự chạy lại khi build)
npm run seed:demo             # tài khoản admin + dữ liệu mẫu (lanhdao, truongkhoa, canbo)
npm run dev

# 3. Web (cổng 5173, tự chuyển /api sang cổng 3000)
cd apps/web
npm install
npm run dev                   # cổng 3000 bị dự án khác dùng: PORT=3100 cho API, API_PORT=3100 npm run dev
```

Mở http://localhost:5173. Tài khoản mẫu dùng mật khẩu `DEMO_PASSWORD` trong `apps/api/.env`.

Thay đổi CSDL: sửa `apps/api/prisma/schema.prisma` → `npx prisma migrate dev --name <ten-thay-doi>` → `npx prisma generate`.

Tài khoản Lãnh đạo, Quản trị bắt buộc bật xác thực hai lớp ở lần đăng nhập đầu (cần ứng dụng xác thực trên điện thoại).
Khi phát triển có thể tắt bằng `REQUIRE_2FA_ROLES=` (để trống) trong `apps/api/.env`.

### Kiểm thử tự động

```bash
cd apps/api
npm test        # build, rồi chạy toàn bộ bài kiểm thử (~15 giây)
```

- Dùng CSDL riêng `<tên CSDL trong DATABASE_URL>_test` (hoặc `TEST_DATABASE_URL`), **xóa trắng mỗi lần chạy**;
  không đụng dữ liệu phát triển. Chỉ chạy với CSDL có tên kết thúc bằng `_test`.
- Tự khởi động API trên cổng ngẫu nhiên, dịch vụ đẩy và máy chủ thư giả lập; không cần Mailpit.
- Bài kiểm thử nằm trong `apps/api/test/*.test.mts`: đăng nhập, phân quyền, quy trình giao việc, tệp, nhắc việc, nhật ký.
- GitHub Actions (`.github/workflows/ci.yml`) chạy lại mỗi lần đẩy mã lên `main`.

Ghi chú Prisma 7: chuỗi kết nối khai báo trong `apps/api/prisma.config.ts` (không còn trong schema); ứng dụng kết nối qua driver adapter `@prisma/adapter-pg` (`src/prisma/prisma.service.ts`).

## Triển khai lên VPS

Chi tiết từng bước: [docs/van-hanh.md](docs/van-hanh.md). Tóm tắt:

1. Chuẩn bị VPS Ubuntu 24.04: `infra/scripts/setup-server.sh` (tài khoản quản trị dùng khóa SSH, tường lửa, fail2ban,
   tự cập nhật bản vá, Docker, WireGuard); cấu hình WireGuard rồi đóng SSH ra Internet.
2. `git clone` vào `/opt/task-manager`; `cp infra/.env.example infra/.env && chmod 600 infra/.env`, điền giá trị.
3. `cd infra && docker compose up -d --build` (migration tự chạy); `docker compose exec api node dist/cli/seed.js`.
4. Sao lưu hằng ngày: `infra/scripts/backup.sh` (restic, kho ngoài VPS); khôi phục: `infra/scripts/restore.sh`.
5. Giám sát: Uptime Kuma (`infra/monitoring/`, chạy trên máy khác) + `infra/scripts/check-health.sh` (cron).
6. Cập nhật: `git pull && docker compose up -d --build --pull always`.

Máy chủ tại trường, chỉ mạng nội bộ: `SITE_ADDRESS=https://<IP>`, `CADDY_TLS=tls internal`.

## Nhắc việc (thông báo đẩy, thư điện tử)

Hệ thống nhắc khi được giao nhiệm vụ, có báo cáo cần duyệt, báo cáo được duyệt/trả lại; 7h sáng hằng ngày gửi
**một** lời nhắc gộp cho mỗi người về nhiệm vụ sắp đến hạn (3 ngày, 1 ngày) và vừa quá hạn.

| Kênh | Cấu hình | Ghi chú |
|---|---|---|
| Thông báo đẩy (Web Push) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Người dùng bật tại *Tài khoản & nhắc việc*. Android, máy tính: Chrome, Edge, Firefox. **iPhone (iOS 16.4+): phải Safari → Chia sẻ → Thêm vào MH chính**, mở từ biểu tượng rồi mới bật được |
| Thư điện tử | `SMTP_*` | Nên dùng máy chủ thư nội bộ. Người dùng tự nhập địa chỉ, hoặc quản trị nhập khi tạo tài khoản |

Nguyên tắc an toàn:
- Lời nhắc gửi ra ngoài **chỉ có câu chung** (vd. "Đồng chí được giao nhiệm vụ mới") và đường dẫn; tên, nội dung
  nhiệm vụ chỉ xem được sau khi đăng nhập. Nội dung đẩy còn được mã hóa đầu-cuối (RFC 8291) nên dịch vụ đẩy của
  Google/Apple/Mozilla không đọc được.
- Máy chủ chỉ gửi tới địa chỉ HTTPS của dịch vụ đẩy chính thức (`PUSH_ALLOWED_HOSTS`), chặn đăng ký địa chỉ tùy ý
  (chống SSRF). Thiết bị bị trình duyệt hủy (404/410) được tự xóa.
- Đăng xuất: máy chủ ngừng gửi tới thiết bị đó cho tài khoản vừa đăng xuất (máy dùng chung).
- Máy chủ API cần ra Internet tới `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`,
  `*.notify.windows.com` (cổng 443) và máy chủ thư.

## Bảo mật đã có trong khung

| Hạng mục | Cách làm |
|---|---|
| Mật khẩu | argon2id; tối thiểu 10 ký tự gồm chữ và số; bắt buộc đổi ở lần đăng nhập đầu |
| Đăng nhập | Khóa 15 phút sau 5 lần sai; giới hạn 5 lần thử mỗi phút mỗi IP |
| 2FA | TOTP (Google/Microsoft Authenticator); khóa bí mật mã hóa AES-256-GCM trong CSDL; **bắt buộc** với vai trò trong `REQUIRE_2FA_ROLES` (mặc định Quản trị, Lãnh đạo) |
| Phiên | Token ngẫu nhiên trong cookie httpOnly, Secure, SameSite=Strict; CSDL chỉ lưu SHA-256 |
| CSRF | SameSite=Strict + kiểm tra header Origin cho request ghi dữ liệu |
| Phân quyền | Guard toàn cục: mặc định phải đăng nhập; quyền theo vai trò và phạm vi đơn vị kiểm tra ở backend |
| Tệp tải lên | Danh sách loại cho phép + kiểm tra chữ ký đầu tệp; tên lưu ngẫu nhiên; tải về qua kiểm tra quyền |
| Nhật ký | Mọi request ghi dữ liệu và mọi lần đăng nhập (thành công/thất bại); không ghi nội dung; trigger CSDL chặn sửa, xóa |
| Đầu vào | ValidationPipe whitelist, từ chối trường lạ; Prisma chống SQL injection |
| HTTP | Helmet (API), HSTS, CSP, X-Frame-Options (Caddy) |
| Mạng | PostgreSQL ở mạng Docker nội bộ, không mở cổng ra ngoài |

## API chính

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | Đăng nhập (`otp` khi đã bật 2FA) |
| POST | `/api/auth/logout` · `/api/auth/change-password` | Đăng xuất, đổi mật khẩu |
| POST | `/api/auth/2fa/setup` · `enable` · `disable` | Quản lý 2FA |
| GET | `/api/auth/me` | Thông tin người đang đăng nhập |
| GET/POST/PATCH | `/api/units`, `/api/users` | Đơn vị, tài khoản (ADMIN) |
| GET/POST | `/api/tasks` | Danh sách (lọc, phân trang), giao việc |
| GET | `/api/tasks?view=assigned\|created\|review` | Mục Được giao, Đã giao, Chờ duyệt của "Việc của tôi" (bỏ trống: mọi việc trong phạm vi) |
| GET | `/api/tasks?q=&status=&priority=&unitId=&createdById=&dueFrom=&dueTo=&overdue=1&sort=due\|newest` | Lọc nâng cao: tìm theo tên, căn cứ; đơn vị nhận gồm cả đơn vị trực thuộc; luôn trong phạm vi được xem |
| GET | `/api/tasks/todo` · `/api/tasks/counts` | Mục Cần xử lý (kèm lý do: quá hạn, hôm nay, chờ duyệt...), số đếm cho menu |
| POST | `/api/tasks/:id/acknowledge` | Người được giao xác nhận đã nhận nhiệm vụ |
| POST | `/api/tasks/:id/follow` · `/unfollow` · `/followers` | Tự theo dõi, bỏ theo dõi; người giao thêm người theo dõi |
| POST | `/api/tasks/:id/nudge` | Người giao đôn đốc (tối đa 3 lần/ngày/nhiệm vụ) |
| POST | `/api/tasks/:id/extensions` · `/api/tasks/extensions/:id/decide` | Xin gia hạn; người giao chấp thuận hoặc không |
| GET | `/api/dashboard/report?from=&to=` | Thống kê 4 nhóm (đúng hạn, quá hạn...) theo đơn vị, cá nhân, tháng (lãnh đạo, chỉ huy) |
| POST | `/api/submissions/approve-batch` | Duyệt "Đạt" nhiều báo cáo một lần (báo cáo không có quyền thì báo lỗi riêng) |
| POST | `/api/devices` · `/api/devices/unregister` | Ứng dụng di động đăng ký/hủy nhận thông báo đẩy (FCM, APNs); thiết bị gắn với phiên đăng nhập |
| POST | `/api/users/import` | Quản trị nhập tài khoản từ Excel (giao diện đọc tệp; có lỗi thì không tạo tài khoản nào; trả mật khẩu tạm một lần) |
| POST | `/api/users/:id/unlock` · `/reset-2fa` | Mở khóa đăng nhập; đặt lại xác thực hai lớp khi mất điện thoại (thu hồi mọi phiên) |
| GET/PATCH | `/api/tasks/:id` | Chi tiết, sửa/hủy |
| POST | `/api/tasks/:id/progress` · `/comments` · `/submissions` | Tiến độ, trao đổi, nộp báo cáo |
| POST | `/api/submissions/:id/review` | Duyệt / trả lại báo cáo |
| POST/GET | `/api/files?taskId=` · `/api/files/:id/download` | Tải tệp lên / xuống |
| GET | `/api/notifications`, `/api/dashboard/summary`, `/api/audit-logs` | Thông báo, thống kê, nhật ký |
| GET/POST | `/api/notifications/settings` · `push/subscribe` · `push/unsubscribe` · `test` | Kênh nhắc việc, đăng ký thiết bị, gửi thử |
| PATCH | `/api/auth/profile` | Người dùng tự cập nhật thư nhận nhắc việc |
| GET | `/api/health` | Kiểm tra hoạt động |
