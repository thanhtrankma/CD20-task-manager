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

- Lượt chấm đầu ngày là giờ vào, lượt cuối là giờ ra.
- Đi muộn hoặc về sớm khi lệch quá số phút cho phép của ca.
- Chỉ có một lượt chấm thì tính *Thiếu lượt chấm*.
- Ngày làm việc không có lượt chấm, không có phép thì tính *Vắng*.
- Nghỉ nửa ngày theo đơn đã duyệt:
  - nghỉ buổi sáng: vào trước giờ hết nghỉ trưa là đúng giờ;
  - nghỉ buổi chiều: ra sau giờ bắt đầu nghỉ trưa là đủ;
  - ngày đó tính 0,5 công.
- Đơn vị không chọn ca riêng thì theo ca của đơn vị cấp trên, cuối cùng là ca mặc định.

## Kết nối trực tiếp máy chấm công (làm sau)

Khi biết hãng, model máy:

- ZKTeco, Ronald Jack có chế độ máy tự gửi dữ liệu về máy chủ (ADMS/PUSH).
- Hikvision dùng ISAPI trong mạng nội bộ.

Dữ liệu ghi vào cùng bảng lượt chấm (`source = DEVICE`), nên lịch sử chấm công, bảng công, phân quyền không đổi.
