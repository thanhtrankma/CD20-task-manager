import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Modal, Space, Table, Typography, Upload } from 'antd';
import { Download, FileSpreadsheet } from 'lucide-react';
import type { SheetData } from 'write-excel-file/browser';
import { useState } from 'react';
import { ApiError, api } from '../../api/client';

type Role = 'STAFF' | 'UNIT_HEAD' | 'LEADER';
interface ImportRow {
  username: string;
  fullName: string;
  unitCode: string;
  role: Role;
  rank?: string;
  position?: string;
  email?: string;
}
interface Created {
  username: string;
  fullName: string;
  temporaryPassword: string;
}

/** Cột trong tệp mẫu (thứ tự cố định). Vai trò ghi bằng tiếng Việt cho dễ điền. */
const HEADERS = ['Tên đăng nhập', 'Họ tên', 'Mã đơn vị', 'Vai trò', 'Cấp bậc', 'Chức vụ', 'Thư điện tử'];
const ROLE_BY_LABEL: Record<string, Role> = {
  'cán bộ': 'STAFF',
  'chỉ huy đơn vị': 'UNIT_HEAD',
  'lãnh đạo': 'LEADER',
};
// Thư viện Excel chỉ tải khi cần (quản trị nhập tài khoản), không làm nặng trang của người dùng khác.
const writeXlsx = async (data: SheetData, widths: number[], fileName: string) => {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(data, { columns: widths.map((width) => ({ width })) }).toFile(fileName);
};

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

async function downloadTemplate() {
  const bold = (value: string) => ({ value, fontWeight: 'bold' as const });
  const data: SheetData = [
    HEADERS.map(bold),
    ['nguyenvana', 'Nguyễn Văn A', 'KCNTT', 'Cán bộ', 'Thượng úy', 'Giảng viên', ''],
    ['tranvanb', 'Trần Văn B', 'PDT', 'Chỉ huy đơn vị', 'Thiếu tá', 'Trưởng phòng', ''],
  ];
  await writeXlsx(data, [20, 26, 14, 18, 14, 18, 28], 'mau-nhap-tai-khoan.xlsx');
}

/** Đọc tệp Excel theo mẫu, trả các dòng hợp lệ về mặt định dạng và lỗi đọc (dòng tính cả tiêu đề). */
async function parseFile(file: File): Promise<{ rows: ImportRow[]; errors: string[] }> {
  const { readSheet } = await import('read-excel-file/browser');
  const sheet = await readSheet(file);
  const [header, ...body] = sheet;
  if (!header || HEADERS.some((h, i) => text(header[i]).toLowerCase() !== h.toLowerCase())) {
    return { rows: [], errors: ['Tệp không đúng mẫu: dòng đầu phải là các cột ' + HEADERS.join(', ')] };
  }
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  body.forEach((r, i) => {
    if (r.every((c) => !text(c))) return; // bỏ dòng trống
    const role = ROLE_BY_LABEL[text(r[3]).toLowerCase()];
    if (!role) errors.push(`Dòng ${i + 2}: vai trò "${text(r[3])}" không hợp lệ (Cán bộ, Chỉ huy đơn vị, Lãnh đạo)`);
    rows.push({
      username: text(r[0]).toLowerCase(),
      fullName: text(r[1]),
      unitCode: text(r[2]),
      role: role ?? 'STAFF',
      rank: text(r[4]) || undefined,
      position: text(r[5]) || undefined,
      email: text(r[6]) || undefined,
    });
  });
  return { rows, errors };
}

/** Nhập tài khoản từ tệp Excel; xong thì tải danh sách mật khẩu tạm để phát cho từng người. */
export function ImportUsersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [created, setCreated] = useState<Created[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setRows([]);
    setErrors([]);
    setCreated(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ created: Created[] }>('/users/import', { rows });
      setCreated(r.created);
      setErrors([]);
      await qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e) {
      // Lỗi từng dòng (trùng tên đăng nhập, sai mã đơn vị...) máy chủ trả trong `errors`.
      const err = e as ApiError;
      setErrors(err.errors?.map((x) => `Dòng ${x.row}: ${x.message}`) ?? [err.message]);
    } finally {
      setBusy(false);
    }
  };

  const downloadPasswords = async () => {
    if (!created) return;
    const data: SheetData = [
      [
        { value: 'Tên đăng nhập', fontWeight: 'bold' },
        { value: 'Họ tên', fontWeight: 'bold' },
        { value: 'Mật khẩu tạm (đổi ở lần đăng nhập đầu)', fontWeight: 'bold' },
      ],
      ...created.map((c) => [c.username, c.fullName, c.temporaryPassword]),
    ];
    await writeXlsx(data, [20, 28, 38], 'mat-khau-tam.xlsx');
  };

  return (
    <Modal
      open={open}
      title="Nhập tài khoản từ Excel"
      onCancel={close}
      width={760}
      destroyOnHidden
      footer={
        created ? (
          <Space>
            <Button icon={<Download size={15} />} type="primary" onClick={downloadPasswords}>
              Tải danh sách mật khẩu tạm
            </Button>
            <Button onClick={close}>Đóng</Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={close}>Hủy</Button>
            <Button type="primary" disabled={!rows.length || busy} loading={busy} onClick={submit}>
              Tạo {rows.length || ''} tài khoản
            </Button>
          </Space>
        )
      }
    >
      {created ? (
        <>
          <Alert
            type="success"
            showIcon
            title={`Đã tạo ${created.length} tài khoản`}
            description="Mật khẩu tạm chỉ hiển thị một lần. Tải danh sách, phát riêng cho từng người, rồi xóa tệp sau khi phát xong."
            style={{ marginBottom: 12 }}
          />
          <Table<Created>
            rowKey="username"
            size="small"
            pagination={false}
            scroll={{ y: 320 }}
            dataSource={created}
            columns={[
              { title: 'Tên đăng nhập', dataIndex: 'username' },
              { title: 'Họ tên', dataIndex: 'fullName' },
              { title: 'Mật khẩu tạm', dataIndex: 'temporaryPassword', render: (p: string) => <code>{p}</code> },
            ]}
          />
        </>
      ) : (
        <>
          <Typography.Paragraph>
            1. Tải tệp mẫu, điền mỗi người một dòng. Cột <b>Mã đơn vị</b> lấy ở trang Đơn vị; <b>Vai trò</b> ghi Cán bộ,
            Chỉ huy đơn vị hoặc Lãnh đạo. Tài khoản quản trị phải tạo riêng.
          </Typography.Paragraph>
          <Button icon={<Download size={15} />} onClick={downloadTemplate} style={{ marginBottom: 16 }}>
            Tải tệp mẫu
          </Button>
          <Typography.Paragraph>
            2. Chọn tệp đã điền. Hệ thống kiểm tra hết trước khi tạo: có lỗi thì không tạo tài khoản nào.
          </Typography.Paragraph>
          <Upload.Dragger
            accept=".xlsx"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => {
              reset();
              parseFile(file)
                .then((r) => {
                  setRows(r.errors.length ? [] : r.rows);
                  setErrors(r.errors);
                  if (!r.errors.length && !r.rows.length) message.warning('Tệp không có dòng dữ liệu nào');
                })
                .catch(() => setErrors(['Không đọc được tệp. Hãy dùng tệp .xlsx theo mẫu.']));
              return false;
            }}
          >
            <p>
              <FileSpreadsheet size={28} color="#16a34a" />
            </p>
            <p>Kéo tệp .xlsx vào đây hoặc bấm để chọn</p>
          </Upload.Dragger>

          {errors.length > 0 && (
            <Alert
              type="error"
              showIcon
              style={{ marginTop: 12 }}
              title="Tệp có lỗi, chưa tạo tài khoản nào"
              description={
                <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 180, overflow: 'auto' }}>
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              }
            />
          )}
          {rows.length > 0 && (
            <Table<ImportRow>
              style={{ marginTop: 12 }}
              rowKey={(r) => r.username}
              size="small"
              pagination={false}
              scroll={{ y: 260 }}
              dataSource={rows}
              columns={[
                { title: 'Tên đăng nhập', dataIndex: 'username' },
                { title: 'Họ tên', dataIndex: 'fullName' },
                { title: 'Đơn vị', dataIndex: 'unitCode', width: 100 },
                {
                  title: 'Vai trò',
                  dataIndex: 'role',
                  width: 130,
                  render: (r: Role) => Object.entries(ROLE_BY_LABEL).find(([, v]) => v === r)?.[0],
                },
              ]}
            />
          )}
        </>
      )}
    </Modal>
  );
}
