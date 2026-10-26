# Tài liệu dự án

| Tài liệu | Nội dung | Thời điểm |
|---|---|---|
| `yeu-cau.md` | Yêu cầu nghiệp vụ, danh sách chức năng MVP đã chốt | Tuần 1–2 |
| `quy-trinh.md` | Quy trình giao việc, báo cáo, duyệt, gia hạn | Tuần 1–2 |
| `phan-quyen.md` | Ma trận vai trò × chức năng × phạm vi dữ liệu | Tuần 1–2 |
| `huong-dan-su-dung.md` | Hướng dẫn theo từng vai trò | Tuần 11 |
| `van-hanh.md` | Khởi động, cập nhật, sao lưu, khôi phục, xử lý sự cố | Tuần 8–11 |
| `quy-che.md` | Dự thảo quy chế sử dụng phần mềm | Tuần 11 |

## Quy tắc phân quyền hiện tại (đã cài đặt)

Toàn bộ quy tắc nằm ở `apps/api/src/modules/tasks/task-access.service.ts`.

| Vai trò | Xem công việc | Giao việc | Cập nhật, nộp báo cáo | Duyệt báo cáo |
|---|---|---|---|---|
| LEADER | Toàn trường | Mọi đơn vị, cá nhân | Việc giao trực tiếp cho mình | Việc mình giao (và mọi việc) |
| UNIT_HEAD | Việc mình giao/nhận + việc của đơn vị mình và trực thuộc | Trong đơn vị mình và trực thuộc | Việc giao cho mình hoặc đơn vị mình | Việc mình giao |
| STAFF | Việc mình giao/nhận | Không | Việc giao trực tiếp cho mình | Không |
| ADMIN | Không xem nội dung công việc | Không | Không | Không |
