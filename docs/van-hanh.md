# Tài liệu vận hành: Hệ thống giao nhiệm vụ

Dành cho cán bộ quản trị hệ thống. Gồm: kiến trúc, triển khai lần đầu, sao lưu, khôi phục, cập nhật, giám sát,
xử lý sự cố, việc định kỳ.

> Mọi lệnh `docker compose` chạy trong thư mục `/opt/task-manager/infra` trên máy chủ.

## 1. Kiến trúc

```
                     Internet (HTTPS 443)                    Cán bộ quản trị
                            │                                      │ WireGuard (51820/udp)
                ┌───────────▼────────────── VPS Ubuntu 24.04 ──────▼──────────────┐
                │  ufw: chỉ mở 80, 443, 51820/udp (SSH chỉ qua VPN)                 │
                │                                                                  │
                │  [web] Caddy: HTTPS, tiêu đề bảo mật, giao diện tĩnh              │
                │     │ mạng "frontend"                                             │
                │  [api] NestJS: chỉ đọc, không quyền hệ thống, chạy bằng user node │
                │     │ mạng "backend" (internal: không ra Internet, không mở cổng) │
                │  [db]  PostgreSQL 16                                              │
                │                                                                  │
                │  Ổ dữ liệu: db-data, uploads (tệp đính kèm), caddy-data (chứng chỉ)│
                └───────┬──────────────────────────────┬───────────────────────────┘
                        │ restic (mã hóa) 01:30 hằng ngày│ check-health.sh 15 phút/lần
                        ▼                              ▼
            Kho sao lưu ngoài VPS             Uptime Kuma (máy giám sát tại trường)
```

Kết nối ra ngoài của API: dịch vụ thông báo đẩy (Google, Mozilla, Apple, Microsoft; Firebase, APNs cho ứng dụng di động)
qua 443, máy chủ thư nội bộ (SMTP).
Lời nhắc gửi ra ngoài không chứa nội dung nhiệm vụ.

## 2. Triển khai lần đầu

**2.1. Chuẩn bị máy chủ** (VPS Ubuntu 24.04 LTS, tối thiểu 2 vCPU, 4 GB RAM, 60 GB SSD):

```bash
# Trên máy quản trị: tạo khóa SSH (nếu chưa có), gửi khóa công khai lên VPS
ssh-keygen -t ed25519 -C quantri-giaoviec
scp ~/.ssh/id_ed25519.pub root@<IP-VPS>:/root/quantri.pub
scp task-manager/infra/scripts/setup-server.sh root@<IP-VPS>:/root/

# Trên VPS (bằng root)
ADMIN_USER=quantri SSH_PUBKEY_FILE=/root/quantri.pub bash /root/setup-server.sh
```

Mở cửa sổ mới, thử `ssh quantri@<IP-VPS>` trước khi đóng phiên root.

**2.2. WireGuard** (đóng SSH ra Internet):

```bash
# Trên VPS
wg genkey | sudo tee /etc/wireguard/server.key | wg pubkey | sudo tee /etc/wireguard/server.pub
sudo chmod 600 /etc/wireguard/server.key
```

`/etc/wireguard/wg0.conf` trên VPS:

```ini
[Interface]
Address = 10.20.0.1/24
ListenPort = 51820
PrivateKey = <nội dung server.key>

[Peer]            # máy quản trị
PublicKey = <khóa công khai của máy quản trị>
AllowedIPs = 10.20.0.2/32
```

```bash
sudo systemctl enable --now wg-quick@wg0
# Sau khi ssh quantri@10.20.0.1 qua VPN đã được:
sudo ufw delete allow 22/tcp
sudo ufw allow in on wg0 to any port 22 proto tcp
```

**2.3. Cài hệ thống**

```bash
cd /opt/task-manager
git clone https://github.com/thanhtrankma/CD20-task-manager.git .
cd infra
cp .env.example .env && chmod 600 .env
openssl rand -hex 24    # → POSTGRES_PASSWORD
openssl rand -hex 32    # → APP_SECRET (SAO LƯU RIÊNG: mất khóa này thì mọi người phải bật lại 2FA)
nano .env               # điền SITE_ADDRESS, APP_ORIGIN, mật khẩu, khóa, SMTP_*, ADMIN_PASSWORD
docker compose up -d --build
docker compose run --rm --entrypoint npx api web-push generate-vapid-keys   # → VAPID_* trong .env
docker compose up -d                                   # nạp VAPID
docker compose exec api node dist/cli/seed.js          # tạo tài khoản quản trị
```

Sau đó:
1. Đăng nhập `admin`, đổi mật khẩu, bật xác thực hai lớp.
2. **Xóa `ADMIN_PASSWORD` khỏi `.env`**.
3. Tạo đơn vị, nhập tài khoản từ Excel (xem `docs/huong-dan-su-dung.md`, mục 5).
4. Chạy kiểm tra: `SITE_URL=https://<tên-miền> ./scripts/check-health.sh`.

**Thông báo đẩy về ứng dụng di động** (không bắt buộc; thiếu thì ứng dụng vẫn chạy, chỉ không có thông báo đẩy):
1. Tạo dự án Firebase (tài khoản Google của đơn vị), thêm ứng dụng Android, iOS với mã `vn.cdn20.giaoviec`.
2. Firebase Console → Project settings → Service accounts → tạo khóa → lưu thành `infra/secrets/fcm-account.json`
   (`chmod 600`); `.env`: `FCM_SERVICE_ACCOUNT_FILE=/run/secrets/fcm-account.json`.
3. iPhone: tạo khóa APNs (.p8) ở Apple Developer → Keys, **tải khóa này lên Firebase** (Cloud Messaging → Apple app
   configuration) để Firebase chuyển thông báo tới iPhone. Muốn gửi thẳng tới Apple không qua Firebase: đặt khóa vào
   `infra/secrets/apns-key.p8` và điền `APNS_KEY_FILE`, `APNS_KEY_ID`, `APNS_TEAM_ID`.
4. Build ứng dụng với cấu hình Firebase (xem `apps/mobile/README.md`), `docker compose up -d` để nạp cấu hình.

Thông báo gửi qua Google, Apple chỉ có câu nhắc chung và đường dẫn, không có nội dung nhiệm vụ. Thiết bị gắn với phiên
đăng nhập: đăng xuất, hết phiên, bị khóa tài khoản thì điện thoại thôi nhận.

Máy chủ tại trường, chỉ dùng mạng nội bộ (không có tên miền): `SITE_ADDRESS=https://<IP>`, `CADDY_TLS=tls internal`,
`APP_ORIGIN=https://<IP>`; cài chứng chỉ gốc của Caddy (`docker compose cp web:/data/caddy/pki/authorities/local/root.crt .`)
lên máy người dùng.

## 3. Sao lưu

Sao lưu CSDL và tệp đính kèm bằng restic (mã hóa, chống trùng lặp). Giữ 14 bản ngày, 8 bản tuần, 12 bản tháng.
**Kho sao lưu phải ở ngoài VPS** (ổ cứng ngoài tại trường qua SFTP, hoặc máy chủ khác).

```bash
sudo -i
openssl rand -hex 32 > /root/.restic-password && chmod 600 /root/.restic-password
export RESTIC_REPOSITORY=sftp:saoluu@<may-sao-luu>:/srv/restic/giaoviec
export RESTIC_PASSWORD_FILE=/root/.restic-password
restic init
crontab -e
```

```cron
30 1 * * *  RESTIC_REPOSITORY=sftp:saoluu@<may-sao-luu>:/srv/restic/giaoviec RESTIC_PASSWORD_FILE=/root/.restic-password /opt/task-manager/infra/scripts/backup.sh >> /var/log/task-manager-backup.log 2>&1
0 3 * * 0   RESTIC_REPOSITORY=... RESTIC_PASSWORD_FILE=/root/.restic-password restic check >> /var/log/task-manager-backup.log 2>&1
```

**Mật khẩu kho sao lưu và `APP_SECRET` cất ở hai nơi** (két của đơn vị, phong bì niêm phong): mất là không khôi phục được.

## 4. Khôi phục

```bash
sudo -i; cd /opt/task-manager/infra
export RESTIC_REPOSITORY=... RESTIC_PASSWORD_FILE=/root/.restic-password
restic snapshots --tag task-manager     # chọn bản
./scripts/restore.sh latest             # hoặc ./scripts/restore.sh <mã bản>; gõ YES để xác nhận
```

Script khôi phục CSDL, chép lại tệp đính kèm, kiểm tra đủ số tệp rồi mới báo xong.

**Mất toàn bộ VPS**: thuê VPS mới → mục 2.1–2.3 (dùng lại `.env` cũ, đặc biệt `APP_SECRET`) → `docker compose up -d`
→ `./scripts/restore.sh latest`.

**Diễn tập khôi phục mỗi quý** trên máy thử (không phải máy thật): khôi phục bản mới nhất, đăng nhập, mở vài nhiệm vụ,
tải một tệp đính kèm. Ghi biên bản.

> Đã diễn tập trên máy phát triển ngày 28/10/2026: xóa hết nhiệm vụ, tệp đính kèm rồi khôi phục; CSDL và tệp về đủ,
> mã băm tệp khớp, đăng nhập và tải tệp được.

## 5. Cập nhật phiên bản

```bash
cd /opt/task-manager
./infra/scripts/backup.sh                 # sao lưu trước (với biến RESTIC_* như cron)
git fetch && git log --oneline HEAD..origin/main   # xem thay đổi
git pull
cd infra && docker compose up -d --build --pull always   # migration CSDL tự chạy khi API khởi động
docker compose logs -f api                # kiểm tra khởi động
SITE_URL=https://<tên-miền> ./scripts/check-health.sh
```

Lỗi sau cập nhật: `git checkout <commit trước>` → `docker compose up -d --build`; nếu bản mới đã đổi CSDL thì khôi phục
bản sao lưu vừa làm.

Cập nhật hệ điều hành: bản vá bảo mật tự cài hằng ngày. Khởi động lại khi có thông báo cần (`/var/run/reboot-required`),
vào giờ ít người dùng; các container tự chạy lại.

## 6. Giám sát

- **Uptime Kuma** (`infra/monitoring/`) chạy trên máy khác (máy chủ tại trường): kiểm tra `https://<tên-miền>/api/health`
  mỗi phút; nhận báo cáo từ `check-health.sh`.
- **check-health.sh** trên VPS, cron 15 phút: API và CSDL, ổ đĩa (cảnh báo từ 85%), bản sao lưu gần nhất (quá 26 giờ),
  chứng chỉ HTTPS (còn dưới 14 ngày).

```cron
*/15 * * * * SITE_URL=https://<tên-miền> KUMA_PUSH_URL=<url push> RESTIC_REPOSITORY=... RESTIC_PASSWORD_FILE=/root/.restic-password /opt/task-manager/infra/scripts/check-health.sh >> /var/log/task-manager-health.log 2>&1
```

## 7. Xử lý sự cố

| Hiện tượng | Kiểm tra, xử lý |
|---|---|
| Không vào được trang | `docker compose ps`; `docker compose logs --tail 100 web api`; `ufw status` |
| API không khởi động | `docker compose logs api`: lỗi migration, thiếu biến môi trường, CSDL chưa sẵn sàng |
| Đầy ổ đĩa | `df -h`; `docker system df`; xóa image cũ: `docker image prune -a`; xem `/var/log` |
| Chứng chỉ HTTPS lỗi | Tên miền phải trỏ đúng IP, mở cổng 80, 443; `docker compose logs web` |
| Không gửi được thông báo đẩy, thư | API cần ra Internet cổng 443 tới dịch vụ đẩy; kiểm tra `SMTP_*`; trang Tài khoản → Gửi thông báo thử |
| Quản trị duy nhất bị khóa, mất OTP | Xem mục 8 |
| Mất `APP_SECRET` | Mọi khóa 2FA không giải mã được: tạo `APP_SECRET` mới, chạy SQL đặt lại 2FA cho mọi người (mục 8), báo người dùng bật lại |

## 8. Lệnh khẩn cấp (dùng khi không còn quản trị nào đăng nhập được)

```bash
cd /opt/task-manager/infra
# Mở khóa đăng nhập
docker compose exec db psql -U taskmanager -c "update users set locked_until=null, failed_logins=0 where username='admin';"
# Đặt lại 2FA (lần đăng nhập sau phải bật lại)
docker compose exec db psql -U taskmanager -c "update users set totp_enabled=false, totp_secret=null where username='admin';"
# Đặt lại mật khẩu: tạo tài khoản quản trị mới bằng seed với ADMIN_USERNAME khác
docker compose exec -e ADMIN_USERNAME=admin2 -e ADMIN_PASSWORD='<mật khẩu tạm>' api node dist/cli/seed.js
```

Mọi lần dùng lệnh khẩn cấp phải ghi biên bản (ai, khi nào, lý do). Thao tác trực tiếp CSDL không đi qua nhật ký của ứng dụng.

## 9. Việc định kỳ

| Chu kỳ | Việc |
|---|---|
| Hằng ngày | Xem cảnh báo Uptime Kuma |
| Hằng tuần | Xem nhật ký: đăng nhập sai, tài khoản bị khóa, xuất Excel bất thường |
| Hằng tháng | Cập nhật phiên bản (mục 5); xem `restic snapshots`; rà soát tài khoản: khóa người đã chuyển công tác |
| Hằng quý | Diễn tập khôi phục; quét bảo mật (OWASP ZAP); đổi mật khẩu CSDL nếu có thay đổi nhân sự quản trị |
| Hằng năm | Rà soát hồ sơ cấp độ, quy chế; kiểm tra, đánh giá an toàn thông tin theo yêu cầu |

## 10. Bí mật cần giữ

| Bí mật | Ở đâu | Bản lưu dự phòng |
|---|---|---|
| `APP_SECRET` (mã hóa khóa 2FA) | `infra/.env` (chmod 600) | Két, phong bì niêm phong |
| `POSTGRES_PASSWORD` | `infra/.env` | Như trên |
| `VAPID_PRIVATE_KEY` | `infra/.env` | Như trên (mất thì người dùng phải bật lại thông báo) |
| Khóa Firebase, khóa APNs (.p8) | `infra/secrets/` (chmod 600) | Tạo lại được trên Firebase, Apple Developer (thu hồi khóa cũ) |
| Mật khẩu kho sao lưu restic | `/root/.restic-password` | Như trên |
| Khóa WireGuard, khóa SSH quản trị | VPS, máy quản trị | Không sao chép; mất thì tạo lại |

Không đưa `.env`, khóa vào Git (kho mã nguồn đang công khai).
