/**
 * 14 đầu mối của Trường Cao đẳng nghề số 20, trực thuộc đơn vị gốc "Nhà trường".
 * Lệnh seed chỉ tạo đơn vị chưa có (theo mã); đổi tên, thêm đơn vị con sau đó làm trong mục Quản trị → Đơn vị.
 */
export const SCHOOL_UNITS: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'BGH', name: 'Ban Giám hiệu' },
  { code: 'PCT', name: 'Phòng Chính trị và Công tác sinh viên' },
  { code: 'PDT', name: 'Phòng Đào tạo' },
  { code: 'PHCKT', name: 'Phòng Hậu cần - Kỹ thuật' },
  { code: 'BKT', name: 'Ban Khảo thí và Bảo đảm chất lượng giáo dục đào tạo' },
  { code: 'BHC', name: 'Ban Hành chính' },
  { code: 'BTC', name: 'Ban Tài chính' },
  { code: 'KKTKT', name: 'Khoa Kinh tế - Kỹ thuật tổng hợp' },
  { code: 'KDIEN', name: 'Khoa Điện - Điện tử - Điện lạnh' },
  { code: 'KCKDL', name: 'Khoa Cơ khí động lực' },
  { code: 'KCNTT', name: 'Khoa Công nghệ thông tin và Công nghệ may' },
  { code: 'TTSH1', name: 'Trung tâm Đào tạo và Sát hạch lái xe số 1' },
  { code: 'TTSH2', name: 'Trung tâm Đào tạo và Sát hạch lái xe số 2' },
  { code: 'TTSH3', name: 'Trung tâm Đào tạo và Sát hạch lái xe số 3' },
];
