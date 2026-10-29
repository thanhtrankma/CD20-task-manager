/** Đường dẫn ảnh đại diện; `v` đổi mỗi lần thay ảnh để trình duyệt, ứng dụng được lưu đệm lâu. */
export const avatarUrl = (u: { id: number; avatarFile: string | null }) =>
  u.avatarFile ? `/api/users/${u.id}/avatar?v=${u.avatarFile.slice(0, 8)}` : null;
