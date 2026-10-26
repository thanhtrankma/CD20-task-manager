import { useQuery } from '@tanstack/react-query';
import { Button, Grid, Input, Pagination, Progress, Segmented, Select, Skeleton, Table } from 'antd';
import dayjs from 'dayjs';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, toQuery } from '../../api/client';
import type { Assignee, Paged, TaskRow, TaskStatus } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ItemList, ItemRow } from '../../components/ItemList';
import { OverduePill, PriorityPill, StatusPill } from '../../components/Pill';
import { DATE_FORMAT, STATUS } from '../../constants';
import { PageHeader, Panel, useShell } from '../../layouts/shell';

export const assigneeLabel = (a: Assignee) => a.unit?.name ?? a.user?.fullName ?? '';

export function TasksPage() {
  const { me } = useAuth();
  const { openCreateTask } = useShell();
  // Trạng thái lọc nằm trên URL để bấm từ thẻ thống kê ở trang Tổng quan sang được.
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as TaskStatus | null) ?? undefined;
  const [q, setQ] = useState('');
  const [mine, setMine] = useState<'' | 'assigned' | 'created'>('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', { status, q, mine, page }],
    queryFn: () =>
      api.get<Paged<TaskRow>>(`/tasks${toQuery({ status, q, mine: mine || undefined, page })}`),
  });
  const canCreate = me?.role === 'LEADER' || me?.role === 'UNIT_HEAD';
  // Màn hình hẹp: hiển thị dạng thẻ thay cho bảng nhiều cột.
  const compact = !Grid.useBreakpoint().md;

  return (
    <>
      <PageHeader
        title="Danh sách công việc"
        subtitle={data ? `${data.total} công việc` : undefined}
        actions={
          canCreate && (
            <Button type="primary" icon={<Plus size={16} />} onClick={() => openCreateTask()}>
              <span className="hide-xs">Giao việc</span>
            </Button>
          )
        }
      />
      <div className="shell-content">
        <Panel flush>
          <div className="filter-bar">
            <Segmented
              value={mine}
              onChange={(v) => {
                setMine(v as typeof mine);
                setPage(1);
              }}
              options={[
                { value: '', label: 'Tất cả' },
                { value: 'assigned', label: 'Tôi nhận' },
                { value: 'created', label: 'Tôi giao' },
              ]}
            />
            <Select
              allowClear
              placeholder="Tất cả trạng thái"
              style={{ width: 190 }}
              value={status}
              onChange={(v?: TaskStatus) => {
                setParams(v ? { status: v } : {});
                setPage(1);
              }}
              options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))}
            />
            <Input
              placeholder="Tìm theo tên công việc"
              allowClear
              prefix={<Search size={15} color="#94a3b8" />}
              onPressEnter={(e) => {
                setQ(e.currentTarget.value);
                setPage(1);
              }}
              onChange={(e) => {
                if (!e.target.value) setQ('');
              }}
              style={{ width: 280, maxWidth: '100%' }}
            />
          </div>

          {compact ? (
            <div style={{ padding: '0 14px 14px' }}>
              {isLoading ? (
                <Skeleton active style={{ paddingTop: 14 }} />
              ) : (
                <ItemList
                  items={data?.items ?? []}
                  rowKey={(t) => t.id}
                  emptyText="Không có công việc"
                  renderItem={(t) => (
                    <ItemRow
                      title={
                        <Link to={`/tasks/${t.id}`} className="task-link">
                          {t.title}
                        </Link>
                      }
                      description={
                        <>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
                            <StatusPill status={t.status} />
                            <PriorityPill priority={t.priority} />
                            {t.overdue && <OverduePill />}
                          </div>
                          Hạn {dayjs(t.dueDate).format(DATE_FORMAT)} ·{' '}
                          {t.assignees
                            .filter((a) => a.role === 'LEAD')
                            .map(assigneeLabel)
                            .join(', ')}
                          <Progress percent={t.progress} size="small" strokeColor="#2563eb" />
                        </>
                      }
                    />
                  )}
                />
              )}
              {(data?.total ?? 0) > (data?.pageSize ?? 20) && (
                <Pagination
                  simple
                  current={page}
                  pageSize={data?.pageSize ?? 20}
                  total={data?.total}
                  onChange={setPage}
                  style={{ marginTop: 12, textAlign: 'center' }}
                />
              )}
            </div>
          ) : (
          <Table<TaskRow>
            rowKey="id"
            loading={isLoading}
            dataSource={data?.items}
            scroll={{ x: 960 }}
            pagination={{
              current: page,
              pageSize: data?.pageSize ?? 20,
              total: data?.total,
              onChange: setPage,
              showTotal: (t) => `${t} công việc`,
              style: { padding: '0 20px' },
            }}
            columns={[
              {
                title: 'Công việc',
                dataIndex: 'title',
                width: 300,
                render: (title, r) => (
                  <>
                    <Link to={`/tasks/${r.id}`} className="task-link">
                      {title}
                    </Link>
                    <div className="muted">Giao bởi {r.createdBy.fullName}</div>
                  </>
                ),
              },
              {
                title: 'Chủ trì',
                width: 200,
                render: (_, r) =>
                  r.assignees
                    .filter((a) => a.role === 'LEAD')
                    .map(assigneeLabel)
                    .join(', '),
              },
              {
                title: 'Hạn',
                dataIndex: 'dueDate',
                width: 130,
                render: (d, r) => (
                  <span style={{ fontWeight: 600, color: r.overdue ? '#e11d48' : undefined }}>
                    {dayjs(d).format(DATE_FORMAT)}
                  </span>
                ),
              },
              {
                title: 'Ưu tiên',
                dataIndex: 'priority',
                width: 120,
                render: (p: TaskRow['priority']) => <PriorityPill priority={p} />,
              },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                width: 170,
                render: (s: TaskStatus, r) => (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <StatusPill status={s} />
                    {r.overdue && <OverduePill />}
                  </div>
                ),
              },
              {
                title: 'Tiến độ',
                dataIndex: 'progress',
                width: 140,
                render: (p: number) => <Progress percent={p} size="small" strokeColor="#2563eb" />,
              },
            ]}
          />
          )}
        </Panel>
      </div>
    </>
  );
}
