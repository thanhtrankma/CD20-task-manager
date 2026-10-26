import { useQuery } from '@tanstack/react-query';
import { Input, Table } from 'antd';
import { Search } from 'lucide-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api, toQuery } from '../../api/client';
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

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, action],
    queryFn: () =>
      api.get<{ items: AuditRow[]; total: number }>(`/audit-logs${toQuery({ page, action })}`),
  });

  return (
    <>
      <PageHeader title="Nhật ký hệ thống" subtitle="Mọi lần đăng nhập và thao tác ghi dữ liệu" />
      <div className="shell-content">
        <Panel flush>
          <div className="filter-bar">
            <Input
              placeholder="Lọc theo hành động (VD: LOGIN, /tasks)"
              allowClear
              prefix={<Search size={15} color="#94a3b8" />}
              style={{ width: 320, maxWidth: '100%' }}
              onPressEnter={(e) => {
                setAction(e.currentTarget.value);
                setPage(1);
              }}
              onChange={(e) => {
                if (!e.target.value) setAction('');
              }}
            />
          </div>
          <Table<AuditRow>
            rowKey="id"
            size="small"
            loading={isLoading}
            dataSource={data?.items}
            scroll={{ x: 900 }}
            pagination={{ current: page, pageSize: 50, total: data?.total, onChange: setPage }}
            columns={[
              { title: 'Thời gian', dataIndex: 'createdAt', width: 160, render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm:ss') },
              { title: 'Người dùng', width: 180, render: (_, r) => r.user?.fullName ?? '—' },
              { title: 'Hành động', dataIndex: 'action' },
              { title: 'Đối tượng', width: 140, render: (_, r) => [r.entity, r.entityId].filter(Boolean).join(' #') },
              { title: 'Kết quả', width: 110, render: (_, r) => r.detail?.result ?? '' },
              { title: 'IP', dataIndex: 'ip', width: 140 },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
