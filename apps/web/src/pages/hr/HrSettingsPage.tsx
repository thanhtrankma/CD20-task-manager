import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Checkbox,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  TimePicker,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import type { Holiday, Unit, WorkShift } from '../../api/types';
import { WEEKDAY } from '../../constants';
import { PageHeader, Panel } from '../../layouts/shell';
import { useHrCatalog } from '../../utils/leave';

/** Gọi API, báo kết quả, làm mới danh mục. */
function useRun() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  return async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      message.success(ok);
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    } finally {
      await qc.invalidateQueries({ queryKey: ['hr'] });
    }
  };
}

/** Cấu hình nghỉ phép, chấm công: ngưỡng duyệt, đối tượng, loại nghỉ, ngày lễ, ca làm việc. */
export function HrSettingsPage() {
  return (
    <>
      <PageHeader title="Cấu hình nghỉ phép, chấm công" subtitle="Áp dụng cho toàn trường" />
      <div className="shell-content">
        <Row gutter={[20, 20]}>
          <Col xs={24} xl={12}>
            <ApprovalPanel />
            <CategoryPanel />
            <LeaveTypePanel />
          </Col>
          <Col xs={24} xl={12}>
            <HolidayPanel />
            <ShiftPanel />
          </Col>
        </Row>
      </div>
    </>
  );
}

function ApprovalPanel() {
  const catalog = useHrCatalog();
  const run = useRun();
  const [value, setValue] = useState<number | null>(null);
  const current = catalog.data?.settings.leaveEscalateDays;
  return (
    <Panel title="Luồng duyệt phép" style={{ marginBottom: 20 }}>
      <Space wrap>
        <span>Đơn nghỉ quá</span>
        <InputNumber min={0} max={60} step={0.5} value={value ?? current} onChange={setValue} style={{ width: 90 }} />
        <span>ngày: sau chỉ huy đơn vị, chuyển lãnh đạo nhà trường duyệt.</span>
        <Button
          type="primary"
          disabled={value === null || value === current}
          onClick={() => run(() => api.patch('/hr/settings', { leaveEscalateDays: value }), 'Đã lưu').then(() => setValue(null))}
        >
          Lưu
        </Button>
      </Space>
    </Panel>
  );
}

function CategoryPanel() {
  const catalog = useHrCatalog();
  const run = useRun();
  const [form] = Form.useForm<{ name: string; annualDays: number }>();
  return (
    <Panel title="Đối tượng và số ngày phép năm" style={{ marginBottom: 20 }}>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={catalog.data?.categories ?? []}
        columns={[
          {
            title: 'Đối tượng',
            render: (_, c) => (
              <Input
                key={c.name}
                defaultValue={c.name}
                variant="borderless"
                onBlur={(e) => e.target.value.trim() !== c.name && run(() => api.patch(`/hr/categories/${c.id}`, { name: e.target.value.trim() }), 'Đã lưu')}
              />
            ),
          },
          {
            title: 'Ngày phép/năm',
            width: 140,
            render: (_, c) => (
              <InputNumber
                key={c.annualDays}
                min={0}
                max={60}
                step={0.5}
                defaultValue={c.annualDays}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== c.annualDays) void run(() => api.patch(`/hr/categories/${c.id}`, { annualDays: v }), 'Đã lưu');
                }}
              />
            ),
          },
          {
            title: '',
            width: 50,
            render: (_, c) => (
              <Popconfirm title={`Xóa đối tượng "${c.name}"?`} onConfirm={() => run(() => api.del(`/hr/categories/${c.id}`), 'Đã xóa')}>
                <Button size="small" type="text" icon={<Trash2 size={14} />} aria-label="Xóa" />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Form
        form={form}
        layout="inline"
        style={{ marginTop: 12, rowGap: 8 }}
        initialValues={{ annualDays: 12 }}
        onFinish={async (v) => {
          if (await run(() => api.post('/hr/categories', v), 'Đã thêm đối tượng')) form.resetFields();
        }}
      >
        <Form.Item name="name" rules={[{ required: true, min: 2, message: 'Nhập tên' }]}>
          <Input placeholder="Đối tượng mới" />
        </Form.Item>
        <Form.Item name="annualDays">
          <InputNumber min={0} max={60} step={0.5} suffix="ngày" style={{ width: 130 }} />
        </Form.Item>
        <Button htmlType="submit" icon={<Plus size={14} />}>
          Thêm
        </Button>
      </Form>
    </Panel>
  );
}

function LeaveTypePanel() {
  const catalog = useHrCatalog();
  const run = useRun();
  const [form] = Form.useForm<{ code: string; name: string; deductsBalance: boolean }>();
  return (
    <Panel title="Loại nghỉ">
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={catalog.data?.leaveTypes ?? []}
        columns={[
          { title: 'Loại nghỉ', render: (_, t) => <>{t.name} <span className="muted">({t.code})</span></> },
          {
            title: 'Trừ phép năm',
            width: 120,
            render: (_, t) => (
              <Switch size="small" checked={t.deductsBalance} onChange={(v) => run(() => api.patch(`/hr/leave-types/${t.id}`, { deductsBalance: v }), 'Đã lưu')} />
            ),
          },
          {
            title: 'Đang dùng',
            width: 100,
            render: (_, t) => (
              <Switch size="small" checked={t.isActive} onChange={(v) => run(() => api.patch(`/hr/leave-types/${t.id}`, { isActive: v }), 'Đã lưu')} />
            ),
          },
        ]}
      />
      <Form
        form={form}
        layout="inline"
        style={{ marginTop: 12, rowGap: 8 }}
        initialValues={{ deductsBalance: false }}
        onFinish={async (v) => {
          if (await run(() => api.post('/hr/leave-types', { ...v, code: v.code.toUpperCase() }), 'Đã thêm loại nghỉ')) form.resetFields();
        }}
      >
        <Form.Item name="code" rules={[{ required: true, pattern: /^[A-Za-z0-9_]{2,30}$/, message: 'Mã không dấu' }]}>
          <Input placeholder="Mã (VD: CON_OM)" style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="name" rules={[{ required: true, min: 2, message: 'Nhập tên' }]}>
          <Input placeholder="Tên loại nghỉ" />
        </Form.Item>
        <Form.Item name="deductsBalance" valuePropName="checked">
          <Checkbox>Trừ phép năm</Checkbox>
        </Form.Item>
        <Button htmlType="submit" icon={<Plus size={14} />}>
          Thêm
        </Button>
      </Form>
    </Panel>
  );
}

function HolidayPanel() {
  const run = useRun();
  const [year, setYear] = useState(dayjs().year());
  const [date, setDate] = useState<Dayjs | null>(null);
  const [name, setName] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['hr', 'holidays', year],
    queryFn: () => api.get<Holiday[]>(`/hr/holidays?year=${year}`),
  });
  return (
    <Panel
      title="Ngày lễ, nghỉ bù"
      style={{ marginBottom: 20 }}
      extra={
        <Select
          value={year}
          onChange={setYear}
          style={{ width: 110 }}
          options={[-1, 0, 1].map((d) => ({ value: dayjs().year() + d, label: `Năm ${dayjs().year() + d}` }))}
        />
      }
    >
      <Table
        size="small"
        rowKey="id"
        loading={isLoading}
        pagination={false}
        dataSource={data ?? []}
        locale={{ emptyText: 'Chưa có ngày lễ nào trong năm' }}
        columns={[
          { title: 'Ngày', width: 150, render: (_, h) => `${WEEKDAY[dayjs(h.date).day() || 7]}, ${dayjs(h.date).format('DD/MM/YYYY')}` },
          { title: 'Tên', dataIndex: 'name' },
          {
            title: '',
            width: 50,
            render: (_, h) => (
              <Popconfirm title="Xóa ngày lễ này?" onConfirm={() => run(() => api.del(`/hr/holidays/${h.id}`), 'Đã xóa')}>
                <Button size="small" type="text" icon={<Trash2 size={14} />} aria-label="Xóa" />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Space wrap style={{ marginTop: 12 }}>
        <DatePicker format="DD/MM/YYYY" value={date} onChange={setDate} placeholder="Ngày" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên (VD: Tết Nguyên đán)" style={{ width: 220 }} />
        <Button
          icon={<Plus size={14} />}
          disabled={!date || name.trim().length < 2}
          onClick={async () => {
            if (await run(() => api.post('/hr/holidays', { date: date!.format('YYYY-MM-DD'), name: name.trim() }), 'Đã thêm ngày lễ')) {
              setDate(null);
              setName('');
            }
          }}
        >
          Thêm
        </Button>
      </Space>
      <div className="muted" style={{ marginTop: 8 }}>
        Ngày lễ dương lịch có sẵn; Tết Nguyên đán, Giỗ Tổ Hùng Vương và ngày nghỉ bù nhập theo thông báo hằng năm.
      </div>
    </Panel>
  );
}

const T = (s: string) => dayjs(`2000-01-01T${s}`);

function ShiftPanel() {
  const catalog = useHrCatalog();
  const run = useRun();
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Unit[]>('/units') });
  const [editing, setEditing] = useState<WorkShift | 'new' | null>(null);
  const shifts = catalog.data?.shifts ?? [];
  const unitShift = new Map((catalog.data?.unitShifts ?? []).map((u) => [u.id, u.workShiftId]));
  return (
    <Panel title="Ca làm việc" extra={<Button size="small" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Thêm ca</Button>}>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={shifts}
        columns={[
          { title: 'Ca', render: (_, s) => <>{s.name} {s.isDefault && <Tag color="blue">Mặc định</Tag>}</> },
          {
            title: 'Giờ',
            width: 230,
            render: (_, s) => (
              <>
                Ca 1 {s.startTime}–{s.breakStart} · Ca 2 {s.breakEnd}–{s.endTime}
                {s.overtimeEnabled && (
                  <div className="muted">
                    Làm thêm từ {s.endTime}, tối thiểu {s.overtimeMinMinutes} phút
                  </div>
                )}
              </>
            ),
          },
          { title: 'Ngày làm', width: 150, render: (_, s) => s.workdays.map((d) => WEEKDAY[d]).join(', ') },
          {
            title: '',
            width: 80,
            render: (_, s) => (
              <Space size={2}>
                <Button size="small" type="text" icon={<Pencil size={14} />} onClick={() => setEditing(s)} aria-label="Sửa" />
                {!s.isDefault && (
                  <Popconfirm title="Xóa ca này?" onConfirm={() => run(() => api.del(`/hr/shifts/${s.id}`), 'Đã xóa')}>
                    <Button size="small" type="text" icon={<Trash2 size={14} />} aria-label="Xóa" />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <h3 className="panel-title" style={{ margin: '18px 0 8px' }}>
        Ca riêng của đơn vị
      </h3>
      <div className="muted" style={{ marginBottom: 8 }}>
        Đơn vị không chọn ca riêng thì theo đơn vị cấp trên, cuối cùng là ca mặc định.
      </div>
      <Table
        size="small"
        rowKey="id"
        pagination={{ pageSize: 8, hideOnSinglePage: true }}
        dataSource={(units.data ?? []).filter((u) => u.isActive && u.parentId !== null)}
        columns={[
          { title: 'Đơn vị', dataIndex: 'name' },
          {
            title: 'Ca',
            width: 220,
            render: (_, u) => (
              <Select
                allowClear
                placeholder="Theo cấp trên"
                style={{ width: '100%' }}
                value={unitShift.get(u.id)}
                onChange={(v?: number) => run(() => api.patch(`/hr/units/${u.id}/shift`, { workShiftId: v ?? null }), 'Đã lưu')}
                options={shifts.map((s) => ({ value: s.id, label: s.name }))}
              />
            ),
          },
        ]}
      />
      <ShiftModal shift={editing} onClose={() => setEditing(null)} />
    </Panel>
  );
}

interface ShiftValues {
  name: string;
  ca1: [Dayjs, Dayjs];
  ca2: [Dayjs, Dayjs];
  graceMinutes: number;
  workdays: number[];
  isDefault: boolean;
  overtimeEnabled: boolean;
  overtimeMinMinutes: number;
}

/** Ca làm việc: ca 1 (sáng), ca 2 (chiều), mỗi ca chấm vào, ra; ca 3 làm thêm từ giờ ra ca 2 (phải đăng ký). */
function ShiftModal({ shift, onClose }: { shift: WorkShift | 'new' | null; onClose: () => void }) {
  const run = useRun();
  const [form] = Form.useForm<ShiftValues>();
  const s = shift === 'new' || !shift ? null : shift;
  const overtime = Form.useWatch('overtimeEnabled', form);
  const ca2 = Form.useWatch('ca2', form) as [Dayjs, Dayjs] | undefined;
  return (
    <Modal open={!!shift} title={s ? `Sửa ca: ${s.name}` : 'Thêm ca làm việc'} okText="Lưu" onOk={() => form.submit()} onCancel={onClose} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: s?.name ?? '',
          ca1: [T(s?.startTime ?? '07:00'), T(s?.breakStart ?? '11:00')],
          ca2: [T(s?.breakEnd ?? '13:30'), T(s?.endTime ?? '17:30')],
          graceMinutes: s?.graceMinutes ?? 5,
          workdays: s?.workdays ?? [1, 2, 3, 4, 5],
          isDefault: s?.isDefault ?? false,
          overtimeEnabled: s?.overtimeEnabled ?? true,
          overtimeMinMinutes: s?.overtimeMinMinutes ?? 30,
        }}
        onFinish={async (v) => {
          const body = {
            name: v.name,
            startTime: v.ca1[0].format('HH:mm'),
            breakStart: v.ca1[1].format('HH:mm'),
            breakEnd: v.ca2[0].format('HH:mm'),
            endTime: v.ca2[1].format('HH:mm'),
            graceMinutes: v.graceMinutes,
            workdays: v.workdays,
            isDefault: v.isDefault,
            overtimeEnabled: v.overtimeEnabled,
            overtimeMinMinutes: v.overtimeMinMinutes,
          };
          if (await run(() => (s ? api.patch(`/hr/shifts/${s.id}`, body) : api.post('/hr/shifts', body)), 'Đã lưu ca')) onClose();
        }}
      >
        <Form.Item name="name" label="Tên ca" rules={[{ required: true, min: 2 }]}>
          <Input placeholder="VD: Giờ mùa hè" />
        </Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="ca1" label="Ca 1 (sáng): vào – ra" rules={[{ required: true }]}>
              <TimePicker.RangePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="ca2" label="Ca 2 (chiều): vào – ra" rules={[{ required: true }]}>
              <TimePicker.RangePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="graceMinutes" label="Cho phép đi muộn, về sớm mỗi ca (phút)">
          <InputNumber min={0} max={120} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="overtimeEnabled" valuePropName="checked" style={{ marginBottom: 8 }}>
          <Checkbox>Ca 3 làm thêm giờ, từ {ca2?.[1]?.format('HH:mm') ?? 'giờ ra ca 2'} (phải đăng ký, được duyệt)</Checkbox>
        </Form.Item>
        {overtime && (
          <Form.Item name="overtimeMinMinutes" label="Làm thêm tối thiểu (phút): dưới mức này không tính">
            <InputNumber min={0} max={240} style={{ width: '100%' }} />
          </Form.Item>
        )}
        <Form.Item name="workdays" label="Ngày làm việc trong tuần" rules={[{ required: true, type: 'array', min: 1 }]}>
          <Checkbox.Group options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: WEEKDAY[d] }))} />
        </Form.Item>
        <Form.Item name="isDefault" valuePropName="checked">
          <Checkbox disabled={s?.isDefault}>Ca mặc định cho toàn trường</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
