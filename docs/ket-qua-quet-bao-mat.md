# Kết quả quét bảo mật OWASP ZAP

**Ngày quét:** 28/10/2026 · **Công cụ:** OWASP ZAP (`zaproxy/zap-stable`), quét cơ bản (baseline: thu thập trang, phân tích
thụ động) · **Đối tượng:** bộ triển khai production chạy thử trên máy thử (Caddy HTTPS, API, PostgreSQL; cùng cấu hình
`infra/docker-compose.yml`).

## Kết quả

| Lần | Lỗi (FAIL) | Cảnh báo (WARN) | Đạt (PASS) |
|---|---|---|---|
| Lần 1 | 0 | 7 | 61 |
| Lần 2 (sau khắc phục) | 0 | 6 | 62 |

## Đã khắc phục sau lần 1

| Cảnh báo | Khắc phục |
|---|---|
| Thiếu tiêu đề cách ly nguồn (Cross-Origin-Embedder-Policy...) | Thêm `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Cross-Origin-Embedder-Policy` (Caddy) |
| Chỉ thị lưu đệm chưa phù hợp | API trả `Cache-Control: no-store` (dữ liệu nhiệm vụ, cá nhân không bị lưu trên máy dùng chung); tệp có mã băm lưu đệm lâu; `index.html` luôn kiểm tra bản mới |
| `robots.txt` trả về trang ứng dụng | Thêm `robots.txt` chặn công cụ tìm kiếm (hệ thống nội bộ) |

Cũng trong đợt rà soát này: phát hiện, sửa lỗi CSP chặn phông chữ nhúng (chỉ xảy ra ở bản production); thêm ghi nhật ký
khi xuất Excel.

## Cảnh báo còn lại (chấp nhận, có lý do)

| Cảnh báo | Đánh giá |
|---|---|
| Storable/Cacheable Content, Re-examine Cache-control (tệp tĩnh công khai) | Tệp giao diện công khai (logo, mã JavaScript đã đóng gói), không chứa dữ liệu; lưu đệm là chủ ý để tải nhanh. Dữ liệu API đã `no-store` |
| CSP: style-src 'unsafe-inline' | Ant Design chèn style lúc chạy, bắt buộc cần. Rủi ro thấp: script vẫn chỉ cho tải từ chính máy chủ (`script-src` theo `default-src 'self'`) |
| Suspicious Comments (mã JavaScript) | Chú thích trong mã thư viện bên thứ ba, không chứa thông tin hệ thống |
| Timestamp Disclosure | Báo nhầm: hằng số số học trong mã thư viện |
| Modern Web Application | Thông tin: ứng dụng một trang, không phải lỗi |

## Giới hạn

- Quét **thụ động, không đăng nhập**: không thử tấn công chủ động, không quét các chức năng sau đăng nhập. Phân quyền sau
  đăng nhập được kiểm tra bằng bộ kiểm thử tự động (96 bài: phân quyền từng vai trò, phạm vi đơn vị, CSRF, SSRF, tệp giả
  mạo, nhật ký...).
- Cần quét lại trên máy chủ thật sau khi triển khai; cân nhắc quét chủ động (ZAP full scan) trên máy thử, hoặc thuê đơn vị
  độc lập đánh giá theo yêu cầu thẩm định cấp độ.

Lệnh quét lại: `docker run --rm zaproxy/zap-stable zap-baseline.py -t https://<tên-miền> -I`
