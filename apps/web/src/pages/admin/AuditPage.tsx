import { useQuery } from '@tanstack/react-query';
import { DatePicker, Input, Select, Table } from 'antd';
import { Search } from 'lucide-react';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { api, toQuery } from '../../api/client';
import type { UserRow } from '../../api/types';
import { Pill } from '../../components/Pill';
import { PageHeader, Panel } from '../../layouts/shell';

interface AuditRow {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  ip: string | null;
  detail: { result?: string } | null;
  createdAt: string;
  user: { username: string; fullName: string } | null;
}

const ACTION_LABEL: Record<string, string> = {
  LOGIN: 'Đăng nhập',
  LOGIN_FAILED: 'Đăng nhập sai',
  LOGIN_FAILED_LOCKED: 'Đăng nhập sai, khóa tài khoản',
  LOGIN_LOCKED: 'Đăng nhập khi đang bị khóa',
  EXPORT_TASKS: 'Xuất Excel danh sách nhiệm vụ',
  EXPORT_REPORT: 'Xuất Excel thống kê',
};
const FAILED = new Set(['LOGIN_FAILED', 'LOGIN_FAILED_LOCKED', 'LOGIN_LOCKED']);

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState<number>();
  const [result, setResult] = useState<'ok' | 'error'>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });
  const filters = {
    page,
    action,
    userId,
    result,
    from: range?.[0]?.startOf('day').toISOString(),
    to: range?.[1]?.endOf('day').toISOString(),
  };
  const { data, isLoading } = useQuery({
    queryKey: ['audit', filters],
    queryFn: () => api.get<{ items: AuditRow[]; total: number }>(`/audit-logs${toQuery(filters)}`),
  });
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Nhật ký hệ thống" subtitle="Mọi lần đăng nhập và thao tác ghi dữ liệu; không sửa, xóa được" />
      <div className="shell-content">
        <Panel flush>
          <div className="filter-bar">
            <Select
              allowClear
              showSearch
              placeholder="Người dùng"
              style={{ width: 220 }}
              value={userId}
              onChange={filter(setUserId)}
              optionFilterProp="label"
              options={(users.data ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` }))}
            />
            <DatePicker.RangePicker format="DD/MM/YYYY" value={range} onChange={filter(setRange)} />
            <Select
              allowClear
              placeholder="Kết quả"
              style={{ width: 150 }}
              value={result}
              onChange={filter(setResult)}
              options={[
                { value: 'ok', label: 'Thành công' },
                { value: 'error', label: 'Lỗi, bị từ chối' },
              ]}
            />
            <Input
              placeholder="Hành động (VD: LOGIN, /tasks)"
              allowClear
              prefix={<Search size={15} color="#94a3b8" />}
              style={{ width: 260, maxWidth: '100%' }}
              onPressEnter={(e) => filter(setAction)(e.currentTarget.value)}
              onChange={(e) => {
                if (!e.target.value) filter(setAction)('');
              }}
            />
          </div>
          <Table<AuditRow>
            rowKey="id"
            size="small"
            loading={isLoading}
            dataSource={data?.items}
            scroll={{ x: 900 }}
            pagination={{ current: page, pageSize: 50, total: data?.total, onChange: setPage, showTotal: (t) => `${t} dòng` }}
            columns={[
              { title: 'Thời gian', dataIndex: 'createdAt', width: 160, render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm:ss') },
              { title: 'Người dùng', width: 180, render: (_, r) => r.user?.fullName ?? '—' },
              { title: 'Hành động', dataIndex: 'action', render: (a: string) => ACTION_LABEL[a] ?? a },
              { title: 'Đối tượng', width: 140, render: (_, r) => [r.entity, r.entityId].filter(Boolean).join(' #') },
              {
                title: 'Kết quả',
                width: 120,
                render: (_, r) =>
                  FAILED.has(r.action) || r.detail?.result?.startsWith('error') ? (
                    <Pill tone={{ label: r.detail?.result?.replace('error:', 'Lỗi ') ?? 'Thất bại', bg: '#fff1f2', fg: '#be123c' }} />
                  ) : (
                    <Pill tone={{ label: 'Thành công', bg: '#ecfdf5', fg: '#047857' }} />
                  ),
              },
              { title: 'IP', dataIndex: 'ip', width: 140 },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
