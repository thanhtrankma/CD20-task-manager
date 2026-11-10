# Nghỉ phép và chấm công

## Ai làm gì

| Người | Việc |
|---|---|
| Quản trị hệ thống | Bật ô *Phụ trách nhân sự – chấm công* cho cán bộ phụ trách (trang Tài khoản → Sửa). Quản trị không xem dữ liệu nhân sự |
| Phụ trách nhân sự | Menu *Nhân sự*: nhập dữ liệu chấm công, ghép mã chấm công, đối tượng, quỹ phép; cấu hình loại nghỉ, ngày lễ, ca làm việc, ngưỡng duyệt |
| Mọi cán bộ | *Nghỉ phép*: đăng ký nghỉ, xem phép còn lại; *Chấm công*: lịch sử chấm công của mình |
| Chỉ huy đơn vị | Duyệt đơn của người trong đơn vị (và đơn vị trực thuộc); *Bảng công* đơn vị |
| Lãnh đạo | Duyệt đơn quá ngưỡng ngày, đơn của chỉ huy cấp nhà trường; xem toàn trường |

## Việc làm một lần khi bắt đầu

1. Quản trị bật cờ phụ trách nhân sự cho cán bộ phụ trách.
2. *Nhân sự → Cấu hình*:
   - kiểm tra số ngày phép của từng đối tượng (mặc định 12 ngày, cần nhà trường xác nhận);
   - giờ làm việc (ca mặc định 07:30–16:30, nghỉ trưa 11:30–13:30, thứ Hai – thứ Sáu);
   - nhập Tết Nguyên đán, Giỗ Tổ và ngày nghỉ bù của năm.
3. *Nhân sự → Cán bộ & quỹ phép → Nhập từ Excel*: ghép mã chấm công (mã nhân viên trên máy) và đối tượng cho từng tài khoản. Tệp mẫu có sẵn trên trang.

## Nhập dữ liệu chấm công

Xuất dữ liệu từ máy hoặc phần mềm chấm công rồi tải lên ở *Nhân sự → Dữ liệu chấm công*. Đọc được các dạng sau:

| Dạng | Ví dụ |
|---|---|
| Mỗi dòng một lượt chấm, cột ngày giờ | `attlog.dat` của ZKTeco: `1	2026-10-05 07:25:31	1	0	1	0`; Excel: `Mã | Ngày giờ` |
| Mỗi dòng một ngày, cột giờ vào, giờ ra riêng | CSV từ Wise Eye, Mitaco: `Mã NV, Họ tên, Ngày, Giờ vào, Giờ ra` |

Màn hình tự đoán cột mã, cột ngày, cột giờ; chỉnh lại được trước khi nhập.

- Ngày viết dạng `dd/MM/yyyy` hoặc `yyyy-MM-dd`; giờ hiểu theo giờ Việt Nam.
- Nhập lại một tệp (hoặc tệp chồng khoảng thời gian) không sinh trùng.
- Mã chưa ghép với tài khoản vẫn được lưu, hiện ở mục *Mã chưa ghép*. Ghép mã xong, lượt chấm cũ tự gắn vào tài khoản đó.
- Hệ thống chỉ lưu mã và thời điểm chấm, **không** lấy dữ liệu vân tay hay khuôn mặt.

## Cách tính công

Ca mặc định của trường (sửa ở *Cấu hình → Ca làm việc*):

| Ca | Giờ | Chấm công |
|---|---|---|
| Ca 1 | 07:00 – 11:00 | Vào, ra |
| Ca 2 | 13:30 – 17:30 | Vào, ra |
| Ca 3 (làm thêm) | Từ 17:30 | Vào, ra riêng; phải đăng ký và được duyệt |

Người làm cả 3 ca chấm 6 lần (lúc 17:30 chấm ra ca 2 rồi chấm vào ca 3).

- **Chia lượt chấm theo ca:**
  - Lượt trước giữa giờ nghỉ trưa (12:15) thuộc ca 1.
  - Sau đó: 2 lượt đầu là ca 2, các lượt tiếp theo là ca 3.
- **Ca chính:** mỗi ca có chấm được 0,5 công.
  - Thiếu một lượt (quên chấm vào hoặc ra) vẫn tính công, nhưng đánh dấu *Thiếu lượt chấm*.
  - Không chấm lần nào thì tính *Vắng* ca đó.
  - Đi muộn, về sớm tính riêng từng ca, khi lệch quá số phút cho phép.
- **Ca 3:** chỉ tính khi có đủ lượt vào và ra, có đăng ký làm thêm đã được duyệt.
  - Số giờ tính từ 17:30, chỉ phần nằm trong khung giờ đã duyệt.
  - Dưới 30 phút thì không tính.
  - Làm thêm không đăng ký vẫn hiện trên lịch nhưng không được tính.
- **Nghỉ nửa ngày theo đơn đã duyệt:** nghỉ buổi sáng thì chỉ xét ca 2, nghỉ buổi chiều thì chỉ xét ca 1.
- **Lượt cùng thời điểm:** tệp chỉ ghi đến phút (ra ca 2 và vào ca 3 cùng 17:30) vẫn được giữ đủ 2 lượt. Nhập lại tệp cũ vẫn không sinh trùng.
- **Ca riêng:** đơn vị không chọn ca riêng thì theo ca của đơn vị cấp trên, cuối cùng là ca mặc định.

## Đăng ký làm thêm giờ

Menu *Cá nhân → Làm thêm giờ*:

- Cán bộ đăng ký ngày, giờ kết thúc, nội dung công việc.
  - Đăng ký trước tối đa 60 ngày, khai bù tối đa 31 ngày.
  - Mỗi ngày một đăng ký.
- Chỉ huy đơn vị duyệt (đơn vị không có chỉ huy thì lên cấp trên; chỉ huy cấp nhà trường thì lãnh đạo duyệt). Không duyệt phải ghi lý do.
- Người đăng ký rút được khi đang chờ, hoặc đã duyệt nhưng chưa tới ngày.

## Kết nối trực tiếp máy chấm công (làm sau)

Khi biết hãng, model máy:

- ZKTeco, Ronald Jack có chế độ máy tự gửi dữ liệu về máy chủ (ADMS/PUSH).
- Hikvision dùng ISAPI trong mạng nội bộ.

Dữ liệu ghi vào cùng bảng lượt chấm (`source = DEVICE`), nên lịch sử chấm công, bảng công, phân quyền không đổi.
