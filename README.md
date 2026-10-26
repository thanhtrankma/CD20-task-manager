# Phần mềm quản lý giao việc, nộp báo cáo, theo dõi tiến độ

Phần mềm nội bộ của Nhà trường. Lộ trình phát triển: xem [roadmap.md](roadmap.md).

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
│   └── web/          React 19 + Vite 8 + Ant Design 6
│       └── src/      api/, auth/, layouts/, pages/
├── infra/            docker-compose, Caddyfile, scripts sao lưu/khôi phục
└── docs/             tài liệu
```

## Chạy trên máy phát triển

Yêu cầu: **Node.js 24 LTS** (xem `.nvmrc`; NestJS 12 và Prisma 7 không chạy trên Node 23), Docker.

```bash
# 1. CSDL
docker compose -f infra/docker-compose.dev.yml up -d

# 2. API (cổng 3000)
cd apps/api
cp .env.example .env          # điền APP_SECRET (openssl rand -hex 32), ADMIN_PASSWORD, DEMO_PASSWORD
npm install
npx prisma migrate dev        # tạo bảng (client Prisma sinh vào src/generated, tự chạy lại khi build)
npm run seed:demo             # tài khoản admin + dữ liệu mẫu (lanhdao, truongkhoa, canbo)
npm run dev

# 3. Web (cổng 5173, tự chuyển /api sang cổng 3000)
cd apps/web
npm install
npm run dev
```

Mở http://localhost:5173. Tài khoản mẫu dùng mật khẩu `DEMO_PASSWORD` trong `apps/api/.env`.

Thay đổi CSDL: sửa `apps/api/prisma/schema.prisma` → `npx prisma migrate dev --name <ten-thay-doi>` → `npx prisma generate`.

Ghi chú Prisma 7: chuỗi kết nối khai báo trong `apps/api/prisma.config.ts` (không còn trong schema); ứng dụng kết nối qua driver adapter `@prisma/adapter-pg` (`src/prisma/prisma.service.ts`).

## Triển khai lên VPS

1. Chuẩn bị máy chủ: cập nhật hệ điều hành, tạo user riêng, cài Docker, WireGuard.
   Tường lửa chỉ mở 80, 443 (và cổng WireGuard). SSH chỉ cho phép qua VPN, đăng nhập bằng khóa.
2. Đưa mã nguồn lên máy chủ (git clone từ kho nội bộ), ví dụ `/opt/task-manager`.
3. Cấu hình và chạy:
   ```bash
   cd /opt/task-manager/infra
   cp .env.example .env && chmod 600 .env   # điền giá trị
   docker compose up -d --build
   docker compose exec api node dist/cli/seed.js   # tạo tài khoản quản trị lần đầu
   ```
4. Cài lịch sao lưu theo hướng dẫn trong `infra/scripts/backup.sh`, **thử khôi phục** bằng `restore.sh` trên máy thử.
5. Cập nhật phiên bản mới: `git pull && docker compose up -d --build` (migration chạy tự động khi API khởi động).

## Bảo mật đã có trong khung

| Hạng mục | Cách làm |
|---|---|
| Mật khẩu | argon2id; tối thiểu 10 ký tự gồm chữ và số; bắt buộc đổi ở lần đăng nhập đầu |
| Đăng nhập | Khóa 15 phút sau 5 lần sai; giới hạn 5 lần thử mỗi phút mỗi IP |
| 2FA | TOTP (Google/Microsoft Authenticator); khóa bí mật mã hóa AES-256-GCM trong CSDL |
| Phiên | Token ngẫu nhiên trong cookie httpOnly, Secure, SameSite=Strict; CSDL chỉ lưu SHA-256 |
| CSRF | SameSite=Strict + kiểm tra header Origin cho request ghi dữ liệu |
| Phân quyền | Guard toàn cục: mặc định phải đăng nhập; quyền theo vai trò và phạm vi đơn vị kiểm tra ở backend |
| Tệp tải lên | Danh sách loại cho phép + kiểm tra chữ ký đầu tệp; tên lưu ngẫu nhiên; tải về qua kiểm tra quyền |
| Nhật ký | Mọi request ghi dữ liệu và mọi lần đăng nhập (thành công/thất bại) |
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
| GET/PATCH | `/api/tasks/:id` | Chi tiết, sửa/hủy |
| POST | `/api/tasks/:id/progress` · `/comments` · `/submissions` | Tiến độ, trao đổi, nộp báo cáo |
| POST | `/api/submissions/:id/review` | Duyệt / trả lại báo cáo |
| POST/GET | `/api/files?taskId=` · `/api/files/:id/download` | Tải tệp lên / xuống |
| GET | `/api/notifications`, `/api/dashboard/summary`, `/api/audit-logs` | Thông báo, thống kê, nhật ký |
| GET | `/api/health` | Kiểm tra hoạt động |
