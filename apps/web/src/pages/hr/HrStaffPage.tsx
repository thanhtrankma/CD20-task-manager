import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Select, Table, Tag, TreeSelect, Upload } from 'antd';
import { CalendarSync, Download, FileSpreadsheet, Pencil } from 'lucide-react';
import { useState } from 'react';
import { ApiError, api, toQuery } from '../../api/client';
import type { StaffRow, Unit } from '../../api/types';
import { PageHeader, Panel } from '../../layouts/shell';
import { downloadXlsx, headerRow } from '../../utils/excel';
import { fmtDays, useHrCatalog } from '../../utils/leave';
import { buildUnitTree } from '../../utils/units';

const thisYear = new Date().getFullYear();
const SOURCE = { custom: 'riêng', category: 'theo đối tượng', default: 'mặc định' } as const;

/** Cán bộ: mã chấm công, đối tượng, quỹ phép năm. Phụ trách nhân sự sửa tại chỗ hoặc nhập từ Excel. */
export function HrStaffPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [year, setYear] = useState(thisYear);
  const [q, setQ] = useState<string>();
  const [unitId, setUnitId] = useState<number>();
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [rolling, setRolling] = useState(false);
  const catalog = useHrCatalog();
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Unit[]>('/units') });
  const query = { year, q, unitId };
  const { data, isLoading } = useQuery({
    queryKey: ['hr', 'staff', query],
    queryFn: () => api.get<StaffRow[]>(`/hr/staff${toQuery(query)}`),
  });
  const categories = catalog.data?.categories ?? [];

  const save = async (u: StaffRow, body: { attendanceCode?: string | null; staffCategoryId?: number | null }) => {
    try {
      await api.patch(`/hr/staff/${u.id}`, body);
      message.success('Đã lưu');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      await qc.invalidateQueries({ queryKey: ['hr', 'staff'] });
      await qc.invalidateQueries({ queryKey: ['attendance'] });
    }
  };

  return (
    <>
      <PageHeader
        title="Cán bộ và quỹ phép"
        subtitle="Mã chấm công, đối tượng, số ngày phép năm của từng người"
        actions={
          <>
            <Button icon={<FileSpreadsheet size={15} />} onClick={() => setImporting(true)}>
              <span className="hide-xs">Nhập từ Excel</span>
            </Button>
            <Button icon={<CalendarSync size={15} />} onClick={() => setRolling(true)}>
              <span className="hide-xs">Khởi tạo năm mới</span>
            </Button>
          </>
        }
      />
      <div className="shell-content">
        <Panel flush>
          <div className="filter-bar">
            <Input.Search allowClear placeholder="Họ tên, tên đăng nhập, mã" style={{ width: 240, maxWidth: '100%' }} onSearch={(v) => setQ(v || undefined)} />
            <TreeSelect
              allowClear
              showSearch
              treeNodeFilterProp="title"
              placeholder="Đơn vị"
              style={{ width: 240, maxWidth: '100%' }}
              value={unitId}
              onChange={setUnitId}
              treeData={buildUnitTree(units.data ?? [])}
              treeDefaultExpandAll
            />
            <Select
              value={year}
              onChange={setYear}
              style={{ width: 110, maxWidth: '100%' }}
              options={[thisYear - 1, thisYear, thisYear + 1].map((y) => ({ value: y, label: `Năm ${y}` }))}
            />
          </div>
          <Table<StaffRow>
            rowKey="id"
            size="small"
            loading={isLoading}
            dataSource={data ?? []}
            pagination={{ pageSize: 50, hideOnSinglePage: true }}
            scroll={{ x: 1100 }}
            columns={[
              {
                title: 'Họ tên',
                fixed: 'left',
                width: 200,
                render: (_, u) => (
                  <>
                    <div style={{ fontWeight: 600 }}>{u.fullName}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {u.username} · {u.unit.name}
                    </div>
                  </>
                ),
              },
              {
                title: 'Mã chấm công',
                width: 140,
                render: (_, u) => (
                  <Input
                    key={`${u.id}-${u.attendanceCode}`}
                    defaultValue={u.attendanceCode ?? ''}
                    placeholder="Chưa ghép"
                    maxLength={32}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (u.attendanceCode ?? '')) void save(u, { attendanceCode: v || null });
                    }}
                    onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
                  />
                ),
              },
              {
                title: 'Đối tượng',
                width: 220,
                render: (_, u) => (
                  <Select
                    allowClear
                    placeholder="Chưa chọn"
                    style={{ width: '100%' }}
                    value={u.staffCategoryId ?? undefined}
                    onChange={(v?: number) => save(u, { staffCategoryId: v ?? null })}
                    options={categories.map((c) => ({ value: c.id, label: `${c.name} (${fmtDays(c.annualDays)} ngày)` }))}
                  />
                ),
              },
              {
                title: 'Được hưởng',
                width: 130,
                align: 'right',
                render: (_, u) => (
                  <>
                    {fmtDays(u.balance.entitled)} <Tag style={{ marginInlineEnd: 0 }}>{SOURCE[u.balance.source]}</Tag>
                  </>
                ),
              },
              { title: 'Tồn', width: 70, align: 'right', render: (_, u) => fmtDays(u.balance.carried) },
              { title: 'Đã nghỉ', width: 80, align: 'right', render: (_, u) => fmtDays(u.balance.used) },
              { title: 'Chờ duyệt', width: 90, align: 'right', render: (_, u) => fmtDays(u.balance.pending) },
              {
                title: 'Còn lại',
                width: 80,
                align: 'right',
                render: (_, u) => <b style={{ color: u.balance.remaining < 0 ? '#be123c' : undefined }}>{fmtDays(u.balance.remaining)}</b>,
              },
              {
                title: '',
                width: 60,
                render: (_, u) => <Button size="small" icon={<Pencil size={14} />} onClick={() => setEditing(u)} aria-label="Sửa quỹ phép" />,
              },
            ]}
          />
        </Panel>
      </div>
      <BalanceModal user={editing} year={year} onClose={() => setEditing(null)} />
      <ImportStaffModal open={importing} onClose={() => setImporting(false)} />
      <RolloverModal open={rolling} onClose={() => setRolling(false)} />
    </>
  );
}

function BalanceModal({ user, year, onClose }: { user: StaffRow | null; year: number; onClose: () => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<{ entitledDays: number | null; carriedDays: number; note: string }>();
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={!!user}
      title={user ? `Quỹ phép ${year}: ${user.fullName}` : ''}
      okText="Lưu"
      confirmLoading={busy}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      {user && (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            entitledDays: user.balance.source === 'custom' ? user.balance.entitled : null,
            carriedDays: user.balance.carried,
            note: user.balance.note ?? '',
          }}
          onFinish={async (v) => {
            setBusy(true);
            try {
              await api.patch(`/hr/balances/${user.id}`, { year, entitledDays: v.entitledDays ?? null, carriedDays: v.carriedDays ?? 0, note: v.note || null });
              message.success('Đã lưu quỹ phép');
              onClose();
              await qc.invalidateQueries({ queryKey: ['hr', 'staff'] });
            } catch (e) {
              message.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="entitledDays"
            label="Số ngày được hưởng"
            extra={`Để trống: theo đối tượng${user.balance.category ? ` (${user.balance.category})` : ''}`}
          >
            <InputNumber min={0} max={90} step={0.5} style={{ width: '100%' }} placeholder="Theo đối tượng" />
          </Form.Item>
          <Form.Item name="carriedDays" label="Phép tồn năm trước">
            <InputNumber min={0} max={90} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} maxLength={500} placeholder="Ví dụ: mới tuyển tháng 7, hưởng theo tỉ lệ" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

function RolloverModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [year, setYear] = useState(thisYear + 1);
  const [maxCarry, setMaxCarry] = useState(0);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      title="Khởi tạo quỹ phép năm mới"
      okText="Khởi tạo"
      confirmLoading={busy}
      onCancel={onClose}
      onOk={async () => {
        setBusy(true);
        try {
          const r = await api.post<{ users: number }>('/hr/balances/rollover', { year, maxCarry });
          message.success(`Đã khởi tạo quỹ phép ${year} cho ${r.users} cán bộ`);
          onClose();
          await qc.invalidateQueries({ queryKey: ['hr', 'staff'] });
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>Phép năm {year - 1} còn lại của từng người (không tính đơn đang chờ) được chuyển sang năm {year}, tối đa số ngày dưới đây.</p>
      <Form layout="vertical">
        <Form.Item label="Năm mới">
          <InputNumber min={2000} max={2100} value={year} onChange={(v) => setYear(v ?? thisYear + 1)} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Chuyển tối đa (ngày)" extra="0: không chuyển phép tồn">
          <InputNumber min={0} max={90} step={0.5} value={maxCarry} onChange={(v) => setMaxCarry(v ?? 0)} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

const HEADERS = ['Tên đăng nhập', 'Mã chấm công', 'Đối tượng'];

/** Nhập mã chấm công, đối tượng cho nhiều người từ Excel: có lỗi thì không ghi dòng nào. */
function ImportStaffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [rows, setRows] = useState<{ username: string; attendanceCode?: string; category?: string }[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
  const close = () => {
    setRows([]);
    setErrors([]);
    onClose();
  };
  return (
    <Modal
      open={open}
      width={640}
      title="Nhập mã chấm công, đối tượng từ Excel"
      okText={`Ghi ${rows.length} dòng`}
      okButtonProps={{ disabled: !rows.length }}
      confirmLoading={busy}
      onCancel={close}
      onOk={async () => {
        setBusy(true);
        try {
          await api.post('/hr/staff/import', { rows });
          message.success(`Đã cập nhật ${rows.length} cán bộ`);
          await qc.invalidateQueries({ queryKey: ['hr', 'staff'] });
          await qc.invalidateQueries({ queryKey: ['attendance'] });
          close();
        } catch (e) {
          const list = e instanceof ApiError ? e.errors : undefined;
          setErrors(list?.length ? list.map((x) => `Dòng ${x.row}: ${x.message}`) : [(e as Error).message]);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Cột theo thứ tự: {HEADERS.join(', ')}. Để trống cột nào thì giữ nguyên thông tin đó.{' '}
        <Button
          type="link"
          size="small"
          icon={<Download size={14} />}
          style={{ padding: 0 }}
          onClick={() =>
            downloadXlsx('mau-ma-cham-cong.xlsx', [
              { name: 'Cán bộ', widths: [20, 16, 30], data: [headerRow(HEADERS), ['canbo', '15', 'Quân nhân chuyên nghiệp']] },
            ])
          }
        >
          Tải tệp mẫu
        </Button>
      </p>
      <Upload.Dragger
        accept=".xlsx"
        showUploadList={false}
        beforeUpload={async (file) => {
          const { readSheet } = await import('read-excel-file/browser');
          const [header, ...body] = await readSheet(file);
          if (!header || HEADERS.some((h, i) => text(header[i]).toLowerCase() !== h.toLowerCase())) {
            setRows([]);
            setErrors([`Tệp không đúng mẫu: dòng đầu phải là ${HEADERS.join(', ')}`]);
            return false;
          }
          setErrors([]);
          setRows(
            body
              .filter((r) => text(r[0]))
              .map((r) => ({
                username: text(r[0]).toLowerCase(),
                attendanceCode: text(r[1]).replace(/\.0$/, '') || undefined,
                category: text(r[2]) || undefined,
              })),
          );
          return false;
        }}
      >
        <p>Kéo tệp .xlsx vào đây hoặc bấm để chọn</p>
      </Upload.Dragger>
      {errors.length > 0 && <Alert type="error" showIcon style={{ marginTop: 12 }} title={errors.slice(0, 8).join('\n')} />}
      {rows.length > 0 && (
        <Table
          size="small"
          style={{ marginTop: 12 }}
          rowKey="username"
          dataSource={rows}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          columns={[
            { title: 'Tên đăng nhập', dataIndex: 'username' },
            { title: 'Mã chấm công', dataIndex: 'attendanceCode' },
            { title: 'Đối tượng', dataIndex: 'category' },
          ]}
        />
      )}
    </Modal>
  );
}
