# DỰ THẢO thuyết minh hồ sơ đề xuất cấp độ an toàn hệ thống thông tin

**Hệ thống giao nhiệm vụ, báo cáo, theo dõi tiến độ của Trường Cao đẳng nghề số 20**

> Bản dự thảo do bộ phận chuyển đổi số chuẩn bị để làm việc với cơ quan chuyên trách. **Cấp độ đề xuất, khung pháp lý
> và mẫu hồ sơ phải đối chiếu với văn bản hiện hành và hướng dẫn của cơ quan thẩm định trong Bộ Quốc phòng**
> (khung chung: Nghị định 85/2016/NĐ-CP, Thông tư 12/2022/TT-BTTTT, TCVN 11930:2017; cần xác nhận văn bản còn hiệu lực,
> văn bản thay thế). Các mục có dấu ☐ là thông tin cần bổ sung.

---

## 1. Thông tin chung

| Mục | Nội dung |
|---|---|
| Tên hệ thống | Hệ thống giao nhiệm vụ, báo cáo, theo dõi tiến độ |
| Chủ quản hệ thống | Trường Cao đẳng nghề số 20 – Bộ Quốc phòng ☐ (xác nhận theo phân cấp) |
| Đơn vị vận hành | ☐ (bộ phận chuyển đổi số / phòng, ban được giao) |
| Đơn vị chuyên trách ATTT | ☐ |
| Mục đích | Giao nhiệm vụ, nộp và duyệt báo cáo kết quả, theo dõi tiến độ, nhắc việc, thống kê phục vụ chỉ huy, điều hành |
| Người dùng | Cán bộ, giảng viên, nhân viên Nhà trường; khoảng ☐ tài khoản; 4 vai trò: quản trị, lãnh đạo, chỉ huy đơn vị, cán bộ |
| Phạm vi thông tin | Thông tin công việc hành chính, nghiệp vụ thông thường. **Không xử lý thông tin thuộc bí mật nhà nước** (quy định trong quy chế sử dụng, hiển thị cảnh báo trên mọi màn hình; căn cứ giao nhiệm vụ chỉ ghi số hiệu, trích yếu) |
| Hình thức cung cấp | Ứng dụng web (HTTPS), ứng dụng di động Android, iOS (dùng chung API) |
| Vị trí đặt máy chủ | ☐ VPS trong nước (Viettel) / máy chủ tại trường (theo ý kiến cơ quan chức năng) |

## 2. Mô tả hệ thống

**2.1. Thành phần**

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Máy chủ | VPS Ubuntu 24.04 LTS, 2 vCPU, 4 GB RAM, 60 GB SSD ☐ | Tường lửa ufw, SSH chỉ qua VPN WireGuard, đăng nhập bằng khóa |
| Cổng web | Caddy 2.11 | HTTPS (TLS), tiêu đề bảo mật (HSTS, CSP, chống nhúng khung) |
| Ứng dụng | NestJS 12 (Node.js 24 LTS) | Container chỉ đọc, không quyền hệ thống, chạy bằng người dùng thường |
| Cơ sở dữ liệu | PostgreSQL 16 | Mạng nội bộ của Docker, không mở cổng ra ngoài |
| Giao diện | React 19, ứng dụng Flutter | |
| Sao lưu | restic (mã hóa) | Kho sao lưu ngoài máy chủ; giữ 14 ngày, 8 tuần, 12 tháng |
| Giám sát | Uptime Kuma (máy riêng) | Kiểm tra mỗi phút; cảnh báo ổ đĩa, sao lưu, chứng chỉ |

**2.2. Sơ đồ mạng**: xem `docs/van-hanh.md`, mục 1. ☐ Vẽ lại theo mẫu của cơ quan thẩm định (vùng mạng, địa chỉ IP).

**2.3. Dữ liệu xử lý**: tài khoản (họ tên, cấp bậc, chức vụ, đơn vị, thư điện tử công vụ); nhiệm vụ (tiêu đề, nội dung,
căn cứ, hạn, người giao, người nhận); báo cáo kết quả, tệp đính kèm (PDF, văn phòng, ảnh); nhật ký thao tác.
Không lưu số định danh cá nhân, thông tin tài chính, sức khỏe.

**2.4. Kết nối ra ngoài**: dịch vụ thông báo đẩy (Google FCM, Apple APNs, Mozilla, Microsoft) chỉ nhận **câu nhắc chung
và đường dẫn, không có nội dung nhiệm vụ**, nội dung được mã hóa đầu cuối (Web Push); máy chủ thư nội bộ (SMTP).
Không dùng dịch vụ AI, lưu trữ đám mây nước ngoài.

## 3. Đề xuất cấp độ

**Đề xuất: Cấp độ 2** ☐ (chờ cơ quan chuyên trách xác nhận).

Lý do (đối chiếu tiêu chí xác định cấp độ tại văn bản hiện hành):
- Hệ thống phục vụ hoạt động nội bộ của Nhà trường;
- Chỉ xử lý thông tin công việc thông thường, không xử lý thông tin thuộc bí mật nhà nước;
- Khi bị phá hoại: ảnh hưởng tới hoạt động điều hành nội bộ của Nhà trường, có phương án dự phòng (giao việc bằng văn
  bản, giao ban); không ảnh hưởng tới quốc phòng, an ninh, lợi ích công cộng.

## 4. Phương án bảo đảm an toàn thông tin

Đối chiếu theo nhóm yêu cầu cơ bản (quản lý, kỹ thuật). ✅ đã có; 🔶 có một phần; ☐ chưa có, cần làm.

### 4.1. Yêu cầu quản lý

| Nhóm | Biện pháp | Tình trạng |
|---|---|---|
| Chính sách ATTT | Quy chế sử dụng phần mềm (trách nhiệm người dùng, cấm thông tin mật, bảo mật tài khoản) | ☐ Dự thảo ở giai đoạn F |
| Tổ chức | Phân công cán bộ quản trị, cán bộ phụ trách ATTT; đầu mối xử lý sự cố | ☐ |
| Nguồn nhân lực | Tập huấn người dùng (hướng dẫn sử dụng theo vai trò); tài liệu vận hành cho quản trị | 🔶 Đã có tài liệu: `docs/huong-dan-su-dung.md`, `docs/van-hanh.md` |
| Thiết kế, xây dựng | Kiểm tra quyền ở máy chủ cho mọi chức năng; kiểm thử tự động (96 bài) chạy mỗi lần thay đổi mã; rà soát bảo mật trước khi vận hành | ✅ |
| Vận hành | Sao lưu hằng ngày, diễn tập khôi phục hằng quý (đã diễn tập 28/10/2026); giám sát; cập nhật bản vá; quy trình cập nhật phiên bản, xử lý sự cố | ✅ (quy trình); ☐ phân công thực hiện |

### 4.2. Yêu cầu kỹ thuật

| Nhóm | Biện pháp | Tình trạng |
|---|---|---|
| **An toàn mạng** | Tường lửa chỉ mở 80/443 và cổng VPN; SSH chỉ qua WireGuard; CSDL nằm trong mạng nội bộ của Docker, không mở cổng; fail2ban chặn dò mật khẩu SSH; HTTPS bắt buộc (HSTS) | ✅ (script `infra/scripts/setup-server.sh`; ☐ chạy trên máy chủ thật) |
| **An toàn máy chủ** | Ubuntu LTS, tự động cài bản vá bảo mật; không đăng nhập root, không đăng nhập bằng mật khẩu; container chỉ đọc, bỏ quyền hệ thống, chống leo thang quyền; giới hạn log | ✅; ☐ phần mềm phòng chống mã độc trên máy chủ (theo yêu cầu của cơ quan thẩm định) |
| **An toàn ứng dụng: xác thực** | Mật khẩu ≥ 10 ký tự, băm argon2id; bắt buộc đổi mật khẩu lần đầu; **xác thực hai lớp bắt buộc** với lãnh đạo, quản trị; khóa tài khoản 15 phút sau 5 lần sai; giới hạn tần suất đăng nhập; phiên lưu ở máy chủ (cookie httpOnly, Secure, SameSite=Strict, chỉ lưu băm), hết hạn sau 8 giờ, thu hồi khi đăng xuất, khóa tài khoản, đổi vai trò | ✅ |
| **An toàn ứng dụng: phân quyền** | 4 vai trò; phạm vi theo đơn vị (cán bộ chỉ thấy việc của mình, chỉ huy thấy đơn vị mình); quản trị không xem được nội dung nhiệm vụ; kiểm tra ở máy chủ, có kiểm thử tự động | ✅ |
| **An toàn ứng dụng: đầu vào** | Kiểm tra, từ chối trường lạ ở mọi API; chống SQL injection (truy vấn tham số hóa); chống CSRF (SameSite + kiểm tra Origin); tệp tải lên: danh sách loại cho phép, kiểm tra chữ ký tệp, tên lưu ngẫu nhiên, giới hạn 20 MB; chống SSRF khi đăng ký thông báo đẩy | ✅; ☐ quét mã độc tệp tải lên (vd. ClamAV) nếu cơ quan thẩm định yêu cầu |
| **An toàn ứng dụng: nhật ký** | Ghi mọi lần đăng nhập (thành công, thất bại, bị khóa), mọi thao tác ghi dữ liệu, xuất Excel; không ghi mật khẩu, nội dung; **CSDL chặn sửa, xóa nhật ký**; quản trị tra cứu theo người, thời gian, kết quả | ✅ |
| **An toàn ứng dụng: tiêu đề HTTP** | CSP chặt (chỉ tải tài nguyên từ chính máy chủ), chống nhúng khung, chống đoán kiểu, không gửi Referrer | ✅ (đã kiểm tra trên bản triển khai thử) |
| **An toàn dữ liệu** | Mã hóa đường truyền (TLS); khóa xác thực hai lớp mã hóa AES-256-GCM trong CSDL; sao lưu mã hóa (restic), lưu ngoài máy chủ, kiểm tra toàn vẹn hằng tuần; dữ liệu trên điện thoại: phiên lưu trong Keychain/Keystore, không lưu nội dung nhiệm vụ lâu dài | ✅; ☐ mã hóa ổ đĩa máy chủ (tùy nhà cung cấp VPS) |
| **Ứng dụng di động** | Chỉ kết nối HTTPS; tắt sao lưu dữ liệu ứng dụng (Android); phát hành riêng tư | ✅; ☐ khóa ứng dụng bằng sinh trắc học, chặn chụp màn hình (đợt 2) |

## 5. Kết quả kiểm tra đã thực hiện

| Nội dung | Kết quả |
|---|---|
| Kiểm thử tự động (đăng nhập, phân quyền, phạm vi dữ liệu, CSRF, SSRF, tệp giả mạo, nhật ký...) | 96/96 đạt (28/10/2026); chạy lại tự động mỗi lần thay đổi mã |
| Triển khai thử bộ production trên máy thử | Đạt: HTTPS, tiêu đề bảo mật, cookie Secure, container chỉ đọc, migration tự chạy |
| Diễn tập sao lưu, khôi phục | Đạt: dữ liệu, tệp đính kèm khôi phục đủ, mã băm khớp |
| Quét OWASP ZAP (quét cơ bản) | Đạt (0 lỗi, 6 cảnh báo đã đánh giá; `docs/ket-qua-quet-bao-mat.md`) |
| Kiểm tra, đánh giá bởi đơn vị độc lập | ☐ Theo yêu cầu của cơ quan thẩm định |

## 6. Việc cần làm trước khi vận hành chính thức

1. ☐ Cơ quan chuyên trách xác nhận cấp độ, vị trí đặt máy chủ, việc dùng dịch vụ thông báo đẩy của Google, Apple.
2. ☐ Chạy `setup-server.sh` trên máy chủ thật; cấu hình VPN; ghi biên bản cấu hình.
3. ☐ Phân công cán bộ quản trị, cán bộ phụ trách ATTT; ban hành quy chế sử dụng.
4. ☐ Bổ sung theo yêu cầu thẩm định (phòng chống mã độc, quét mã độc tệp tải lên, đánh giá độc lập...).
5. ☐ Hoàn thiện sơ đồ mạng, danh mục thiết bị, phần mềm theo mẫu hồ sơ.

## Phụ lục: Danh mục phần mềm

| Phần mềm | Phiên bản | Giấy phép |
|---|---|---|
| Ubuntu Server | 24.04 LTS | Tự do |
| Docker Engine, Compose | Bản ổn định mới nhất | Apache 2.0 |
| PostgreSQL | 16 | PostgreSQL License |
| Caddy | 2.11 | Apache 2.0 |
| Node.js | 24 LTS | MIT |
| NestJS, Prisma, React, Ant Design | 12, 7, 19, 6 | MIT |
| Flutter | 3.47 | BSD |
| restic | 0.19 | BSD |
| Uptime Kuma | 2 | MIT |
| WireGuard | Theo Ubuntu | GPL 2.0 |

Mã nguồn hệ thống do Nhà trường tự xây dựng, quản lý tại kho mã nguồn ☐ (hiện là kho công khai trên GitHub; cân nhắc
chuyển sang kho riêng tư hoặc kho nội bộ trước khi vận hành chính thức).
