-- Nhật ký thao tác chỉ được ghi thêm: chặn sửa, xóa, xóa trắng bảng audit_logs ở tầng CSDL,
-- kể cả khi mã nguồn ứng dụng có lỗi hoặc bị lợi dụng.
-- Lưu ý: chủ sở hữu CSDL vẫn có thể tắt trigger; tài khoản quản trị CSDL phải được quản lý riêng.
CREATE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs chỉ được ghi thêm, không được sửa hoặc xóa';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();
