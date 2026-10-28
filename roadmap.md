# Lộ trình phát triển: Phần mềm giao nhiệm vụ (Phương án 3)

Phần mềm giao nhiệm vụ, nộp báo cáo, theo dõi tiến độ của Nhà trường, **tự xây dựng gồm bản web và ứng dụng di động
(Android, iOS)**, triển khai cho toàn trường. Phương án đã báo cáo Ban Giám hiệu tại
`So-sanh-phuong-an-app-giao-viec.pdf`.

- **Hạ tầng:** VPS trong nước (ưu tiên Viettel). Dự phòng: máy chủ đặt tại trường, chỉ truy cập qua mạng nội bộ.
- **Công nghệ:** Node.js 24 LTS, NestJS 12 + Prisma 7 + PostgreSQL 16; React 19 + Vite 8 + Ant Design 6;
  Flutter (ứng dụng Android, iOS, thư mục `apps/mobile`); Caddy, Docker Compose.
- **Phạm vi dữ liệu:** công việc hành chính, nghiệp vụ thông thường. **Không đưa thông tin thuộc bí mật nhà nước lên hệ thống.**
- **Nhân lực:** 01 cán bộ chuyển đổi số (phát triển, vận hành).

Ký hiệu: `[x]` đã xong · `[ ]` chưa làm · `[~]` đang làm · 🧾 việc thủ tục, không phải lập trình

---

## Tổng quan

| Giai đoạn | Tuần | Nội dung | Kết quả |
|---|---|---|---|
| 0 | Đã xong | Bản khung, nhắc việc qua web push và thư | Chạy được trên máy phát triển |
| A | 1 – 2 | Nền tảng chất lượng, bảo mật; khởi động thủ tục | Có bộ kiểm thử tự động; hồ sơ thủ tục đã gửi |
| B | 3 – 6 | Hoàn thiện nghiệp vụ giao việc | Đủ chức năng cho thí điểm |
| C | 7 – 8 | Triển khai máy chủ thật, rà soát bảo mật | Bản chạy thử trên VPS |
| D | 9 – 10 | Thí điểm với ~20 đầu mối (trưởng cơ sở, đơn vị) | Báo cáo kết quả thí điểm |
| E | 11 – 16 (bắt đầu sớm) | Ứng dụng di động Android, iOS (Flutter) | Ứng dụng phát hành riêng tư, nhận thông báo đẩy |
| F | 17 – 18 | Triển khai toàn trường | Vận hành chính thức |

Thí điểm (D) dùng đúng nhóm 20 đầu mối mà phương án thuê ngoài dự kiến, nên Ban Giám hiệu so sánh được trực tiếp.

### Việc thủ tục chạy song song (bắt đầu ngay tuần 1, vì chờ lâu)

- [ ] 🧾 Hỏi bộ phận CNTT, cơ quan bảo vệ an ninh và cơ quan CNTT cấp trên về hiện trạng hệ thống, hồ sơ cấp độ
      (danh sách câu hỏi đã chuẩn bị)
- [ ] 🧾 Xin mẫu hồ sơ đề xuất cấp độ đã được duyệt; xác định cấp độ dự kiến (thường là cấp độ 2) và cơ quan thẩm định
- [ ] 🧾 Xin ý kiến: được đặt máy chủ ở đâu (VPS Viettel hay trung tâm dữ liệu quân đội); có được truy cập từ Internet
- [ ] 🧾 Xin ý kiến về phát hành ứng dụng di động và thông báo đẩy qua máy chủ Google, Apple (không chứa nội dung)
- [ ] 🧾 Đăng ký tên miền (vd. `giaoviec.<ten-truong>.edu.vn`) hoặc xin tên miền con của Nhà trường
- [ ] 🧾 **Tài khoản Apple Developer dạng tổ chức** (99 USD/năm): cần **mã số D-U-N-S** của Nhà trường; xin mã D-U-N-S
      mất 1 – 4 tuần, Apple duyệt thêm vài ngày. Phải làm sớm để kịp giai đoạn E
- [ ] 🧾 Tài khoản Google Play Console dạng tổ chức (25 USD, một lần); cũng cần D-U-N-S
- [ ] 🧾 Lập dự toán, đề xuất kinh phí năm đầu (10 – 17 triệu đồng)
- [ ] 🧾 Dùng thử miễn phí MISA AMIS Công việc, Base Wework 1 – 2 tuần (dữ liệu giả) để quan sát trực tiếp luồng sử dụng

---

## Giai đoạn 0: Đã hoàn thành

- [x] Cấu trúc dự án `apps/api`, `apps/web`, `infra`; Docker Compose; script sao lưu, khôi phục
- [x] Đăng nhập: phiên lưu trong CSDL, cookie httpOnly, argon2id, khóa tài khoản khi sai 5 lần, giới hạn tần suất
- [x] Xác thực hai lớp (OTP) bật/tắt; bắt buộc đổi mật khẩu ở lần đăng nhập đầu
- [x] Phân quyền theo vai trò (Quản trị, Lãnh đạo, Chỉ huy đơn vị, Cán bộ) và phạm vi đơn vị; chống CSRF bằng kiểm tra Origin
- [x] Ghi nhật ký mọi thao tác ghi dữ liệu; quản trị xem nhật ký
- [x] Quản lý đơn vị (thêm, sửa), tài khoản (thêm, sửa, đặt lại mật khẩu)
- [x] Giao việc cho cá nhân, đơn vị (chủ trì, phối hợp); chia việc con; danh sách, chi tiết công việc
- [x] Cập nhật % tiến độ; nộp báo cáo kèm tệp (kiểm tra loại tệp thật); duyệt hoặc trả lại; bình luận
- [x] Bảng điều khiển: số việc theo trạng thái, quá hạn, sắp đến hạn, thống kê theo đơn vị
- [x] Thông báo trong hệ thống; nhắc hạn 7h sáng hằng ngày (gộp một lời nhắc mỗi người)
- [x] Nhắc việc qua web push (cài như ứng dụng, PWA) và thư điện tử; lời nhắc không chứa nội dung nhiệm vụ; chống SSRF
- [x] Giao diện theo bộ nhận diện của Nhà trường; thư viện cập nhật bản mới nhất (10/2026)

---

## Giai đoạn A: Nền tảng chất lượng và bảo mật (Tuần 1 – 2)

Mục tiêu: mọi thay đổi sau này đều được kiểm thử tự động; đóng các khoảng trống bảo mật đã biết.

- [x] **A1. Bộ kiểm thử tự động cho API** (`npm test` trong `apps/api`): 52 bài kiểm thử, khoảng 12 giây
  - Chạy trên CSDL kiểm thử riêng, tự tạo bảng và dữ liệu mẫu, không đụng dữ liệu phát triển
  - Bao phủ: đăng nhập, khóa tài khoản, phiên, phân quyền từng vai trò, phạm vi đơn vị, quy trình
    giao việc → tiến độ → nộp → duyệt/trả lại, tệp, chống CSRF, nhắc việc
  - Hoàn thành khi: chạy một lệnh, tất cả đạt; thêm vào hướng dẫn trong README
- [x] **A2. Bắt buộc xác thực hai lớp cho Lãnh đạo và Quản trị**
  - Tài khoản thuộc vai trò này chưa bật OTP chỉ được vào trang bật OTP (tương tự bắt buộc đổi mật khẩu); không tự tắt được
  - Cấu hình bằng biến `REQUIRE_2FA_ROLES` (mặc định `ADMIN,LEADER`)
- [x] **A3. Nhật ký không sửa, xóa được**: trigger PostgreSQL chặn `UPDATE`, `DELETE` trên bảng `audit_logs`
- [x] **A4. Dọn phiên hết hạn** (mỗi giờ); vô hiệu hóa tài khoản, đặt lại mật khẩu thì thu hồi mọi phiên (đã có, nay có kiểm thử)
- [x] **A5. Kiểm thử tự động trên GitHub** (GitHub Actions): mỗi lần đẩy mã chạy build, kiểm tra kiểu và bộ kiểm thử

## Giai đoạn B: Hoàn thiện nghiệp vụ (Tuần 3 – 6)

Mục tiêu: đủ chức năng để 20 đầu mối dùng thật. Trước khi làm, rà soát với 2 – 3 đơn vị về cách giao việc,
mẫu báo cáo hiện tại. Nhiều hạng mục học từ MISA AMIS Công việc, phần mềm điều hành của cơ quan nhà nước và các ứng
dụng khác: xem [docs/tham-khao-ung-dung-giao-viec.md](docs/tham-khao-ung-dung-giao-viec.md).

### Tuần 3: Màn hình "Việc của tôi"
- [x] **B1. Việc của tôi theo mục**: *Cần xử lý* (quá hạn, đến hạn hôm nay, sắp đến hạn, chờ tôi duyệt, việc đơn vị
      cần phân tiếp; sắp theo hạn), *Được giao*, *Đã giao*, *Theo dõi*, *Chờ duyệt*, *Đơn vị* (chỉ huy đơn vị).
      "Cần xử lý" là màn hình mặc định. Mục *Theo dõi* có từ B5
- [x] **B2. Màu theo hạn** thống nhất; hạn hiển thị tương đối ("Còn 2 ngày", "Trễ 3 ngày"); số việc cần xử lý,
      chờ duyệt trên menu
- [ ] **B3. Lọc, tìm kiếm**: theo trạng thái, mức ưu tiên, đơn vị nhận, người giao, khoảng hạn, quá hạn

### Tuần 4: Vòng đời nhiệm vụ
- [x] **B4. Xác nhận đã nhận nhiệm vụ** (ghi thời điểm; người giao thấy ai chưa nhận)
- [x] **B5. Người theo dõi**: người giao thêm khi giao, hoặc lãnh đạo tự bấm "Theo dõi"; nhận thông báo, không phải làm
- [x] **B6. Đôn đốc**: người giao bấm "Nhắc" trên nhiệm vụ chậm → người thực hiện nhận thông báo ngay (giới hạn số lần/ngày)
- [x] **B7. Căn cứ giao nhiệm vụ**: số, ký hiệu, ngày văn bản hoặc "Kết luận giao ban..." (chỉ số hiệu, trích yếu)
- [x] **B8. Xin gia hạn**: người thực hiện đề nghị hạn mới kèm lý do; người giao duyệt hoặc từ chối; có thông báo
- [x] **B9. Sửa, hủy nhiệm vụ** trên giao diện; thông báo người nhận khi đổi hạn; **đính kèm tệp khi giao việc**
- [x] **B10. Dòng hoạt động** trong chi tiết nhiệm vụ: giao, nhận, tiến độ, đổi hạn, nộp, duyệt, bình luận theo thời gian

### Tuần 5: Duyệt, đơn vị, quản trị
- [x] **B11. Duyệt nhanh, duyệt hàng loạt** trong mục *Chờ duyệt*
- [x] **B12. Theo dõi việc giao cho đơn vị**: người giao thấy tiến độ việc con do chỉ huy đơn vị phân tiếp
- [x] **B13. Quản lý đơn vị dạng cây**: sửa, ẩn đơn vị; chuyển cán bộ giữa các đơn vị
- [x] **B14. Quản lý tài khoản**: khóa/mở khóa, đặt lại xác thực hai lớp khi cán bộ mất điện thoại (có ghi nhật ký);
      **nhập danh sách từ Excel** theo mẫu
- [x] **B15. Tra cứu nhật ký**: lọc theo người, thao tác, thời gian

### Tuần 6: Thống kê, hướng dẫn
- [ ] **B16. Thống kê 4 nhóm** theo đơn vị, cá nhân, theo tháng: hoàn thành đúng hạn, hoàn thành quá hạn,
      đang thực hiện trong hạn, đang thực hiện quá hạn; số nhiệm vụ đang thực hiện của mỗi người
- [ ] **B17. Xuất Excel** danh sách nhiệm vụ và thống kê (phục vụ giao ban, báo cáo)
- [ ] **B18. Hướng dẫn sử dụng** theo vai trò (`docs/huong-dan-su-dung.md`), có hình minh họa

## Giai đoạn C: Triển khai thử trên máy chủ thật (Tuần 7 – 8)

Mục tiêu: hệ thống chạy trên VPS, an toàn, có sao lưu và giám sát.

- [ ] **C1. Chuẩn bị máy chủ**: thuê VPS, cập nhật hệ điều hành, tường lửa chỉ mở 80/443, SSH qua WireGuard và khóa
- [ ] **C2. Triển khai** bằng Docker Compose; HTTPS; cấu hình VAPID, máy chủ thư nội bộ (SMTP)
- [ ] **C3. Sao lưu tự động** hằng ngày ra ổ ngoài/máy khác; **thử khôi phục thực tế** trên máy thử
- [ ] **C4. Giám sát**: Uptime Kuma báo khi hệ thống ngừng hoạt động, ổ đĩa đầy, chứng chỉ sắp hết hạn
- [ ] **C5. Rà soát bảo mật**: quét OWASP ZAP; kiểm tra phân quyền từng API; khắc phục lỗ hổng
- [ ] **C6. Tài liệu vận hành** (`docs/van-hanh.md`): khởi động lại, cập nhật, sao lưu, khôi phục, xử lý sự cố
- [ ] 🧾 **C7. Hoàn thiện hồ sơ đề xuất cấp độ** (mô tả hệ thống, sơ đồ mạng, phương án bảo đảm an toàn) và gửi thẩm định

## Giai đoạn D: Thí điểm với 20 đầu mối (Tuần 9 – 10)

- [ ] 🧾 D1. Tạo tài khoản cho Ban Giám hiệu và khoảng 20 trưởng cơ sở, đơn vị; hướng dẫn trực tiếp (30 phút)
- [ ] 🧾 D2. Giao việc thật trong 2 tuần; hướng dẫn bật nhắc việc trên điện thoại (web push)
- [ ] D3. Thu thập góp ý (phiếu khảo sát), ghi nhận lỗi; sửa lỗi, điều chỉnh giao diện
- [ ] 🧾 D4. Báo cáo kết quả thí điểm lên Ban Giám hiệu: mức độ sử dụng, góp ý, đề xuất mở rộng

## Giai đoạn E: Ứng dụng di động Android, iOS (Tuần 11 – 16)

Mục tiêu: cán bộ cài ứng dụng của Nhà trường, nhận nhắc việc ổn định như các ứng dụng thương mại.
Ứng dụng viết bằng **Flutter** (một mã nguồn cho Android và iOS), gọi chung API với bản web.

### Tuần 11: Nền tảng ứng dụng (làm sớm, song song với giai đoạn B)
- [x] **E1. Ứng dụng Flutter** (`apps/mobile`): đăng nhập (kèm OTP), Việc của tôi, chi tiết nhiệm vụ với thao tác một chạm,
      thông báo, tài khoản; biểu tượng theo logo trường. Dùng chung API với bản web
- [x] **E2. Đăng nhập trên ứng dụng**: mã phiên lưu trong **kho bảo mật của điện thoại** (Keychain trên iOS, Keystore trên
      Android); dùng chung bảng phiên, chung cơ chế thu hồi khi đăng xuất. Bản phát hành chỉ kết nối HTTPS
  (đợt 1 xong 28/10/2026: 48 kiểm thử, chạy được trên iOS Simulator với API thật; chưa thử trên máy thật, Android
  emulator. Việc API cần làm thêm cho thông báo đẩy: `apps/mobile/API-NEEDS.md`)

### Tuần 12 – 13: Thông báo đẩy
- [ ] **E3. Bảng thiết bị** (Android/iOS, mã thiết bị); đăng ký khi đăng nhập, xóa khi đăng xuất
- [ ] **E4. Gửi thông báo**: Android qua Firebase Cloud Messaging, iOS qua Apple Push Notification service;
      **chỉ gửi câu chung** như hiện nay, bấm vào mở đúng nhiệm vụ
- [ ] **E5. Số chưa đọc** trên biểu tượng ứng dụng
- [ ] **E5b. Thao tác một chạm** trên thẻ nhiệm vụ (Đã nhận, cập nhật %, Duyệt); **chụp ảnh đính kèm** khi nộp báo cáo; "Giao nhanh"

### Tuần 14: Bảo vệ ứng dụng
- [ ] **E6. Khóa ứng dụng** bằng vân tay, khuôn mặt hoặc mã PIN khi mở lại sau một khoảng thời gian
- [ ] **E7. Chặn chụp màn hình** trên Android; ẩn nội dung khi chuyển ứng dụng; không lưu dữ liệu nhiệm vụ lâu dài trên máy
- [ ] **E8. Chỉ kết nối tới máy chủ của Nhà trường** (khóa tên miền), từ chối kết nối không an toàn

### Tuần 15 – 16: Phát hành
- [ ] **E9. Android**: phát hành trên Google Play dạng riêng tư (chỉ người được mời) hoặc tệp APK ký số để cài trực tiếp
- [ ] **E10. iOS**: phân phối không công khai (Unlisted App Distribution) hoặc TestFlight cho giai đoạn đầu
- [ ] **E11. Hướng dẫn cài đặt** có hình (Android, iPhone); tập huấn cài cho 20 đầu mối thí điểm
- [ ] 🧾 E12. Xin ý kiến bộ phận chuyên trách an toàn thông tin trước khi phát hành

## Giai đoạn F: Triển khai toàn trường (Tuần 17 – 18)

- [ ] 🧾 F1. Dự thảo quy chế sử dụng phần mềm (trách nhiệm cập nhật tiến độ, báo cáo, bảo mật tài khoản)
- [ ] F2. Nhập toàn bộ đơn vị, tài khoản từ Excel
- [ ] 🧾 F3. Tập huấn theo đơn vị; hỗ trợ cài ứng dụng
- [ ] 🧾 F4. Vận hành chính thức; báo cáo Ban Giám hiệu sau 1 tháng

## Mở rộng (sau thí điểm, theo góp ý của người dùng)

- [ ] Checklist đầu việc (mỗi đầu việc giao được một người), ngày bắt đầu, nhắc tên (@) trong bình luận
- [ ] Ủy quyền: trợ lý, Văn phòng giao và theo dõi nhiệm vụ thay Ban Giám hiệu; vai trò Văn phòng theo dõi chung
- [ ] Đơn vị phối hợp báo cáo cho đơn vị chủ trì; đơn vị chủ trì tổng hợp báo cáo chung
- [ ] Xem nhiệm vụ dạng Lịch (tuần, tháng); nhập nhiệm vụ từ Excel; phê duyệt 2 cấp; nhóm theo Kế hoạch/Lĩnh vực
- [ ] Báo cáo định kỳ: mẫu báo cáo tuần/tháng/quý, tự sinh yêu cầu nộp theo lịch
- [ ] Mẫu nhiệm vụ lặp lại
- [ ] Đánh giá, thi đua: tổng hợp kết quả theo cá nhân, đơn vị, theo kỳ
- [ ] Đăng nhập một lần nếu Nhà trường có hệ thống tài khoản tập trung
- [ ] Tin nhắn SMS thương hiệu cho nhiệm vụ khẩn, quá hạn (nếu được duyệt kinh phí)

---

## Rủi ro và cách xử lý

| Rủi ro | Ảnh hưởng | Cách xử lý |
|---|---|---|
| Chưa được chấp thuận đặt máy chủ trên VPS hoặc truy cập từ Internet | Chậm giai đoạn C, D | Hỏi từ tuần 1; dự phòng máy chủ tại trường, chỉ dùng trong mạng nội bộ |
| Chậm có mã D-U-N-S, tài khoản Apple | Chậm phát hành iOS | Đăng ký từ tuần 1; trong lúc chờ, iPhone dùng bản web (PWA) |
| Không được phát hành ứng dụng di động | Không có giai đoạn E | Giữ bản web và nhắc việc qua web push, thư điện tử (đã có) |
| Phụ thuộc 01 cán bộ phát triển | Gián đoạn khi vắng mặt | Kiểm thử tự động, tài liệu vận hành, mã nguồn lưu tập trung, sao lưu định kỳ |
| Cán bộ ngại dùng, không cập nhật tiến độ | Thí điểm không hiệu quả | Giao diện đơn giản, nhắc việc tự động, quy chế sử dụng, Ban Giám hiệu giao việc qua phần mềm |

## Nguyên tắc khi phát triển

1. Kiểm tra quyền ở máy chủ cho **mọi** API. Không tin vào việc ẩn nút trên giao diện.
2. Mỗi chức năng mới có kiểm thử tự động; chạy `npm test` trước khi đưa mã lên.
3. Mỗi thay đổi CSDL đều qua `prisma migrate`. Không sửa tay trên máy chủ.
4. Không commit `.env`, mật khẩu, khóa bí mật. Kho mã nguồn đang công khai: không đưa thông tin nội bộ vào mã nguồn.
5. Thông báo gửi ra ngoài (web push, ứng dụng di động, thư) **không chứa nội dung nhiệm vụ**.
6. Mỗi tuần cập nhật file này và đánh dấu việc đã xong.
