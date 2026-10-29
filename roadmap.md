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
| G | Bổ sung | Trò chuyện nội bộ (nhắn riêng, nhóm tự tạo, nhóm theo đơn vị), ảnh đại diện | Trao đổi nhanh trong hệ thống |

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
- [x] **B3. Lọc, tìm kiếm**: theo trạng thái, mức ưu tiên, đơn vị nhận (gồm trực thuộc), người giao, khoảng hạn, quá hạn; tìm theo tên và căn cứ; sắp xếp theo hạn hoặc mới giao. Xuất Excel theo đúng bộ lọc. Lọc không mở rộng phạm vi được xem

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
- [x] **B16. Thống kê 4 nhóm** theo đơn vị, cá nhân, theo tháng: hoàn thành đúng hạn, hoàn thành quá hạn,
      đang thực hiện trong hạn, đang thực hiện quá hạn; số nhiệm vụ đang thực hiện của mỗi người
- [x] **B17. Xuất Excel** danh sách nhiệm vụ và thống kê (phục vụ giao ban, báo cáo)
- [x] **B18. Hướng dẫn sử dụng** theo vai trò (`docs/huong-dan-su-dung.md`), có hình minh họa

## Giai đoạn C: Triển khai thử trên máy chủ thật (Tuần 7 – 8)

Mục tiêu: hệ thống chạy trên VPS, an toàn, có sao lưu và giám sát. Phần chuẩn bị đã làm, đã diễn tập trên máy thử
(28/10/2026); còn lại là các việc cần máy chủ thật.

- [~] **C1. Chuẩn bị máy chủ**: script `infra/scripts/setup-server.sh` (Ubuntu 24.04: tài khoản quản trị dùng khóa SSH,
      tắt root, tường lửa chỉ mở 80/443/VPN, fail2ban, tự cập nhật bản vá, Docker, WireGuard). 🧾 Còn: thuê VPS, chạy script
- [~] **C2. Triển khai** bằng Docker Compose: đã chạy thử bộ production trên máy thử (HTTPS, migration tự chạy, container
      chỉ đọc, bỏ quyền hệ thống, cookie Secure; sửa lỗi CSP chặn phông chữ). Caddy hỗ trợ cả tên miền và chế độ mạng nội bộ
      (`CADDY_TLS=tls internal`). 🧾 Còn: tên miền, VAPID, máy chủ thư nội bộ trên máy thật
- [~] **C3. Sao lưu tự động**: đã diễn tập sao lưu, khôi phục thật (dữ liệu, tệp đính kèm về đủ, mã băm khớp); sửa 2 lỗi của
      script khôi phục. 🧾 Còn: chọn nơi đặt kho sao lưu ngoài VPS, cài cron
- [~] **C4. Giám sát**: Uptime Kuma (`infra/monitoring/`, chạy trên máy khác) + `check-health.sh` (API, ổ đĩa, sao lưu,
      chứng chỉ). 🧾 Còn: chọn máy giám sát, kênh cảnh báo
- [~] **C5. Rà soát bảo mật**: quét OWASP ZAP trên bản triển khai thử; ghi nhật ký khi xuất Excel. Còn: quét lại trên máy thật
- [x] **C6. Tài liệu vận hành** (`docs/van-hanh.md`): triển khai, sao lưu, khôi phục, cập nhật, giám sát, sự cố, việc định kỳ
- [~] 🧾 **C7. Hồ sơ đề xuất cấp độ**: dự thảo thuyết minh `docs/ho-so-cap-do-du-thao.md` (đề xuất cấp độ 2, đối chiếu
      biện pháp theo nhóm yêu cầu quản lý, kỹ thuật). Còn: điền thông tin ☐, theo mẫu của cơ quan thẩm định, gửi thẩm định

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
  (đợt 1 xong 28/10/2026; đợt 2 xong cùng ngày: khóa ứng dụng, chặn chụp màn hình, thông báo đẩy, giao nhanh, sửa/hủy,
  thêm người theo dõi, chia việc con; 88 kiểm thử. Chưa thử trên máy thật, Android emulator, chưa có dự án Firebase.
  Đợt 3 xong 29/10/2026: tìm kiếm nhiệm vụ (tên, căn cứ, lọc trạng thái, quá hạn); đổi mật khẩu, bật/tắt xác thực hai
  lớp ngay trên ứng dụng, kể cả khi bị bắt buộc lúc đăng nhập lần đầu; 111 kiểm thử)

### Tuần 12 – 13: Thông báo đẩy
- [x] **E3. Bảng thiết bị** (Android/iOS, mã thiết bị); đăng ký khi đăng nhập, xóa khi đăng xuất
- [x] **E4. Gửi thông báo**: máy chủ gửi qua Firebase Cloud Messaging (Android, iOS) hoặc thẳng tới APNs (iOS);
      **chỉ gửi câu chung** như hiện nay, bấm vào mở đúng nhiệm vụ. Đã kiểm thử với FCM, APNs giả lập (kiểm tra chữ ký JWT).
      🧾 Còn: dự án Firebase, khóa APNs (cần tài khoản Apple Developer)
- [~] **E5. Số chưa đọc** trên biểu tượng ứng dụng (iOS: máy chủ đã gửi số chưa đọc kèm thông báo)
- [x] **E5b. Thao tác một chạm** trên thẻ nhiệm vụ (Đã nhận, cập nhật %, Duyệt); **chụp ảnh đính kèm** khi nộp báo cáo; "Giao nhanh"

### Tuần 14: Bảo vệ ứng dụng
- [x] **E6. Khóa ứng dụng** bằng vân tay, khuôn mặt hoặc mã PIN khi mở lại sau một khoảng thời gian
- [x] **E7. Chặn chụp màn hình** trên Android; ẩn nội dung khi chuyển ứng dụng; không lưu dữ liệu nhiệm vụ lâu dài trên máy
- [~] **E8. Chỉ kết nối tới máy chủ của Nhà trường** (khóa tên miền), từ chối kết nối không an toàn (bản phát hành chỉ HTTPS tới địa chỉ cấu hình sẵn; chưa ghim chứng chỉ)

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

## Giai đoạn G: Trò chuyện nội bộ, ảnh đại diện (bổ sung)

Mục tiêu: trao đổi nhanh ngay trong hệ thống thay cho nhóm Zalo, Messenger; dữ liệu nằm trên máy chủ của Nhà trường.

Nguyên tắc riêng:
- Màn trò chuyện luôn nhắc **không trao đổi thông tin bí mật nhà nước** (như toàn hệ thống).
- Tài khoản quản trị (ADMIN) **không tham gia, không đọc** được trò chuyện.
- Thông báo đẩy chỉ có câu chung "Đồng chí có tin nhắn mới", không có nội dung, tên người gửi; mỗi cuộc trò chuyện
  tối đa 1 thông báo đẩy / 2 phút / người; tắt thông báo được theo từng cuộc trò chuyện.
- Nhật ký ghi ai gửi, lúc nào (không ghi nội dung); người gửi thu hồi được tin trong 24 giờ.
- Phiên 1 chỉ gửi chữ; gửi ảnh, tệp trong trò chuyện làm sau nếu cần.

- [x] **G1. Ảnh đại diện**: tự đổi, xóa ảnh (JPEG, PNG ≤ 2 MB, cắt vuông, thu nhỏ ở máy người dùng); máy chủ kiểm tra chữ
      ký tệp, kích thước và **xóa siêu dữ liệu** (EXIF: vị trí GPS, loại máy); quản trị gỡ được ảnh không phù hợp.
      Ảnh chỉ xem được khi đã đăng nhập; hiện ở menu, trò chuyện, danh sách người
- [x] **G2. Nhắn riêng** (1 – 1) với bất kỳ cán bộ nào trong trường (danh bạ: tên, cấp bậc, chức vụ, đơn vị)
- [x] **G3. Nhóm tự tạo**: ai cũng tạo được (tên + thành viên); người tạo đổi tên, thêm, bớt người; thành viên tự rời nhóm
- [x] **G4. Nhóm theo đơn vị**: Ban Giám hiệu tạo cho mọi đơn vị, chỉ huy đơn vị tạo cho đơn vị mình và trực thuộc; mỗi
      đơn vị một nhóm; **thành viên tự cập nhật** theo đơn vị của tài khoản (chuyển đơn vị, khóa tài khoản là tự ra khỏi
      nhóm), tùy chọn gồm cả đơn vị trực thuộc
- [x] **G5. Thời gian thực**: tin mới hiện ngay (Server-Sent Events, kiểm tra lại phiên mỗi phút), số tin chưa đọc trên
      menu, đã đọc đến đâu, thông báo đẩy về điện thoại
- [x] **G6. Web**: màn "Trò chuyện"; đổi ảnh đại diện ở "Tài khoản"
  (xong 29/10/2026: 16 kiểm thử API mới, tổng 128; Caddy không nén, không đệm luồng `/api/chat/stream`)
- [x] **G7. Ứng dụng di động**: tab "Trò chuyện", tạo nhóm, đổi ảnh đại diện (chụp hoặc chọn ảnh), mở đúng cuộc trò chuyện
      khi bấm thông báo
  (xong 29/10/2026: 138 kiểm thử; chưa thử camera, thư viện ảnh thật và thông báo đẩy thật trên máy)

### Hợp đồng API (bản web và ứng dụng dùng chung)

| Phương thức | Đường dẫn | Ghi chú |
|---|---|---|
| POST, DELETE | `/api/users/me/avatar` | Tải lên (multipart, trường `file`), xóa ảnh của mình |
| DELETE | `/api/users/:id/avatar` | Quản trị gỡ ảnh |
| GET | `/api/users/:id/avatar?v=` | Ảnh (cần đăng nhập). `avatarUrl` có sẵn trong `/auth/me`, danh bạ, thành viên |
| GET | `/api/chat/directory?q=&unitId=` | Danh bạ: tài khoản đang hoạt động, trừ quản trị và chính mình, tối đa 50 |
| GET | `/api/chat/conversations` | Danh sách: loại, tên, tin cuối, số chưa đọc, đã tắt thông báo; mới nhất trước |
| GET | `/api/chat/unread` | `{ count }` tổng tin chưa đọc (số trên menu) |
| POST | `/api/chat/direct` | `{ userId }` → mở (hoặc tạo) cuộc nhắn riêng |
| POST | `/api/chat/groups` | `{ name, memberIds }` nhóm tự tạo |
| POST | `/api/chat/unit-groups` | `{ unitId, includeSubunits }` nhóm theo đơn vị |
| GET, PATCH | `/api/chat/conversations/:id` | Chi tiết kèm thành viên, quyền quản lý; đổi `{ name, includeSubunits }` |
| POST | `/api/chat/conversations/:id/members` | `{ userIds }` thêm người (nhóm tự tạo) |
| DELETE | `/api/chat/conversations/:id/members/:userId` | Bớt người; `userId` là mình = rời nhóm |
| GET | `/api/chat/conversations/:id/messages?before=&limit=` | Tin nhắn, mới nhất trước, tối đa 50 mỗi lần |
| POST | `/api/chat/conversations/:id/messages` | `{ body }` (1 – 4000 ký tự) |
| POST | `/api/chat/conversations/:id/read` | `{ messageId }` đã đọc đến tin này |
| POST | `/api/chat/conversations/:id/mute` | `{ muted }` tắt, bật thông báo |
| DELETE | `/api/chat/messages/:id` | Thu hồi tin của mình (trong 24 giờ) |
| GET | `/api/chat/stream` | Server-Sent Events: `message`, `message_deleted`, `conversation`, `read` |

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
