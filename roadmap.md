# Lộ trình phát triển: Phần mềm quản lý giao việc

Phần mềm quản lý giao việc, nộp báo cáo và theo dõi tiến độ công việc của Nhà trường.

- **Hạ tầng:** VPS trong nước (ưu tiên Viettel). Dự phòng: máy chủ nội bộ, chỉ truy cập qua LAN.
- **Công nghệ:** Node.js 24 LTS, NestJS 12 + Prisma 7 + PostgreSQL 16, React 19 + Vite 8 + Ant Design 6, TypeScript 6 (API) / 7 (web), Caddy, Docker Compose.
- **Phạm vi dữ liệu:** công việc hành chính, nghiệp vụ thông thường. **Không đưa thông tin thuộc bí mật nhà nước lên hệ thống.**

Ký hiệu: `[x]` đã xong · `[ ]` chưa làm · ⭐ thuộc MVP

---

## Giai đoạn 0: Khung dự án (đã dựng)

- [x] Cấu trúc thư mục `apps/api`, `apps/web`, `infra`, `docs`
- [x] Docker Compose (PostgreSQL, API, Caddy + web tĩnh), cấu hình dev chỉ chạy PostgreSQL
- [x] Schema Prisma đầy đủ các bảng chính
- [x] Đăng nhập bằng phiên lưu trong PostgreSQL, cookie httpOnly, argon2, khóa tài khoản khi sai nhiều lần
- [x] Khung xác thực hai lớp (OTP): bật, xác nhận, yêu cầu OTP khi đăng nhập
- [x] Phân quyền theo vai trò + phạm vi đơn vị (guard, decorator)
- [x] Ghi nhật ký thao tác (interceptor cho mọi request ghi dữ liệu)
- [x] Khung các module: units, users, tasks, submissions, files, notifications, dashboard, audit
- [x] Giao diện: đăng nhập, bố cục chính, danh sách công việc, bảng điều khiển (bản khung)
- [x] Script sao lưu và khôi phục
- [x] Nâng cấp toàn bộ thư viện lên bản mới nhất (26/10/2026): NestJS 12, Prisma 7 (driver adapter), otplib 13,
      Vite 8, TypeScript 6/7, Node 24; thay `List` lỗi thời của antd bằng `Listy`

## Giai đoạn 1: Chuẩn bị (Tuần 1–2)

- [ ] Khảo sát 2–3 đơn vị: cách giao việc hiện tại, mẫu báo cáo đang dùng
- [ ] Chốt danh sách chức năng MVP (đóng băng phạm vi)
- [ ] Vẽ quy trình nghiệp vụ, phác thảo giao diện (wireframe)
- [ ] Rà soát lại schema CSDL theo yêu cầu thực tế
- [ ] Gửi xin ý kiến bộ phận CNTT, an toàn thông tin
- [ ] Lập danh sách đơn vị, tài khoản ban đầu (file Excel để nhập)

**Kết quả:** tài liệu yêu cầu được duyệt (`docs/yeu-cau.md`)

## Giai đoạn 2: Xây dựng (Tuần 3–8)

### Tuần 3: Nền tảng ⭐
- [ ] Viết test tự động (Jest + Supertest) cho phân quyền và quy trình giao việc
- [ ] Kiểm thử giao diện bật 2FA trên điện thoại thật
- [ ] Bắt buộc đổi mật khẩu ở lần đăng nhập đầu
- [ ] Quản lý đơn vị: thêm, sửa, ẩn; hiển thị dạng cây
- [ ] Quản lý tài khoản: thêm, sửa, khóa, đặt lại mật khẩu, nhập từ Excel
- [ ] Bắt buộc 2FA cho vai trò LEADER và ADMIN

### Tuần 4–5: Giao việc ⭐
- [ ] Form tạo việc: tiêu đề, nội dung, hạn, ưu tiên, chọn đơn vị/cá nhân (chủ trì, phối hợp)
- [ ] Chỉ huy đơn vị phân tiếp việc cho cán bộ (việc con)
- [ ] Danh sách việc: lọc theo trạng thái, hạn, đơn vị, người giao; tìm kiếm
- [ ] Trang chi tiết công việc: thông tin, người nhận, lịch sử, tệp đính kèm
- [ ] Tải tệp lên, tải tệp về (kiểm tra quyền)

### Tuần 6: Tiến độ và báo cáo ⭐
- [ ] Cập nhật % tiến độ kèm ghi chú
- [ ] Nộp báo cáo kèm tệp; người giao duyệt hoặc trả lại kèm nhận xét
- [ ] Xin gia hạn; người giao duyệt hoặc từ chối
- [ ] Bình luận trong công việc

### Tuần 7: Thông báo và thống kê ⭐
- [ ] Thông báo trong hệ thống (biểu tượng chuông, số chưa đọc)
- [ ] Tác vụ định kỳ: nhắc trước hạn 3 ngày, 1 ngày; đánh dấu quá hạn
- [ ] Bảng điều khiển: số việc theo trạng thái, tỷ lệ đúng hạn theo đơn vị
- [ ] Xuất Excel danh sách việc và thống kê

### Tuần 8: Bảo mật và triển khai ⭐
- [ ] Màn hình tra cứu nhật ký cho quản trị
- [ ] Trigger PostgreSQL chặn sửa/xóa bảng `audit_logs`
- [ ] Rà soát bảo mật: quét bằng OWASP ZAP, kiểm tra phân quyền từng API
- [ ] Thuê VPS, cài đặt tường lửa, WireGuard, Docker; triển khai bản chạy thử
- [ ] Cài lịch sao lưu tự động (cron), **thử khôi phục thực tế**
- [ ] Cài Uptime Kuma giám sát

**Kết quả:** bản chạy thử trên VPS

## Giai đoạn 3: Thí điểm (Tuần 9–10)

- [ ] Tạo tài khoản cho 1–2 đơn vị thí điểm, hướng dẫn trực tiếp
- [ ] Thu thập góp ý (biểu mẫu), ghi nhận lỗi
- [ ] Sửa lỗi, điều chỉnh giao diện
- [ ] Báo cáo kết quả thí điểm lên Ban Giám hiệu

## Giai đoạn 4: Triển khai chính thức (Tuần 11–12)

- [ ] Viết hướng dẫn sử dụng theo vai trò (`docs/huong-dan-su-dung.md`)
- [ ] Viết tài liệu vận hành: khởi động lại, sao lưu, khôi phục, cập nhật (`docs/van-hanh.md`)
- [ ] Dự thảo quy chế sử dụng phần mềm
- [ ] Tập huấn toàn trường
- [ ] Nhập toàn bộ đơn vị, tài khoản; vận hành chính thức

## Đợt 2: Mở rộng (sau khi vận hành ổn định)

- [ ] Báo cáo định kỳ: mẫu báo cáo tuần/tháng/quý, tự sinh yêu cầu nộp theo lịch
- [ ] PWA: cài trên điện thoại, thông báo đẩy
- [ ] Đánh giá, thi đua: tổng hợp kết quả theo cá nhân, đơn vị, theo kỳ
- [ ] Mẫu công việc lặp lại
- [ ] Tích hợp đăng nhập một lần (nếu Nhà trường có hệ thống tài khoản tập trung)

---

## Nguyên tắc khi phát triển

1. Kiểm tra quyền ở backend cho **mọi** API. Không tin vào việc ẩn nút trên giao diện.
2. Mỗi thay đổi CSDL đều qua `prisma migrate`. Không sửa tay trên máy chủ.
3. Không commit `.env`, mật khẩu, khóa bí mật.
4. Mỗi tuần cập nhật file này và đánh dấu việc đã xong.
