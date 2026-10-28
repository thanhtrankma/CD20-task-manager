import { useQuery } from '@tanstack/react-query';
import { Button, Grid, Input, Pagination, Progress, Select, Skeleton, Table, Tabs } from 'antd';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, toQuery } from '../../api/client';
import type { Assignee, Paged, TaskCounts, TaskRow, TaskStatus, TodoItem, TodoReason } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ItemList, ItemRow } from '../../components/ItemList';
import { DueTag, PriorityPill, StatusPill } from '../../components/Pill';
import { STATUS, TODO_REASON } from '../../constants';
import { PageHeader, Panel, useShell } from '../../layouts/shell';

export const assigneeLabel = (a: Assignee) => a.unit?.name ?? a.user?.fullName ?? '';
const leads = (t: TaskRow) => t.assignees.filter((a) => a.role === 'LEAD').map(assigneeLabel).join(', ');

/** Các mục của "Việc của tôi". "all": mọi việc trong phạm vi được xem (đơn vị, toàn trường). */
type View = 'todo' | 'assigned' | 'created' | 'review' | 'all';
const VIEWS: View[] = ['todo', 'assigned', 'created', 'review', 'all'];

export function useTaskCounts(enabled = true) {
  return useQuery({
    queryKey: ['tasks', 'counts'],
    queryFn: () => api.get<TaskCounts>('/tasks/counts'),
    enabled,
    refetchInterval: 60_000,
  });
}

export function TasksPage() {
  const { me } = useAuth();
  const { openCreateTask } = useShell();
  // Mục và bộ lọc nằm trên URL để bấm từ trang Tổng quan, thông báo sang được, và giữ khi quay lại.
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as TaskStatus | null) ?? undefined;
  const viewParam = params.get('view') as View | null;
  const view: View = viewParam && VIEWS.includes(viewParam) ? viewParam : status ? 'all' : 'todo';
  const counts = useTaskCounts();

  const canAssign = me?.role === 'LEADER' || me?.role === 'UNIT_HEAD';
  const n = (v?: number) => (v ? ` (${v})` : '');
  const tabs = [
    { key: 'todo', label: `Cần xử lý${n(counts.data?.todo)}` },
    { key: 'assigned', label: `Được giao${n(counts.data?.assigned)}` },
    ...(canAssign
      ? [
          { key: 'created', label: `Đã giao${n(counts.data?.created)}` },
          { key: 'review', label: `Chờ duyệt${n(counts.data?.review)}` },
          { key: 'all', label: me?.role === 'LEADER' ? 'Toàn trường' : 'Đơn vị' },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Việc của tôi"
        subtitle={view === 'todo' ? 'Những việc cần đồng chí xử lý, việc gấp ở trên' : undefined}
        actions={
          canAssign && (
            <Button type="primary" icon={<Plus size={16} />} onClick={() => openCreateTask()}>
              <span className="hide-xs">Giao việc</span>
            </Button>
          )
        }
      />
      <div className="shell-content">
        <Panel flush>
          <Tabs
            activeKey={view}
            onChange={(v) => setParams({ view: v })}
            items={tabs}
            tabBarStyle={{ padding: '0 16px', marginBottom: 0 }}
          />
          {view === 'todo' ? <TodoList /> : <TaskList key={view} view={view} status={status} setParams={setParams} />}
        </Panel>
      </div>
    </>
  );
}

/** Mục "Cần xử lý": nhóm theo lý do (quá hạn, hôm nay, chờ duyệt...), không phân trang. */
function TodoList() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'todo'],
    queryFn: () => api.get<{ items: TodoItem[] }>('/tasks/todo'),
  });
  if (isLoading) return <Skeleton active style={{ padding: 20 }} />;

  const groups = new Map<TodoReason, TodoItem[]>();
  for (const t of data?.items ?? []) groups.set(t.reason, [...(groups.get(t.reason) ?? []), t]);

  if (!groups.size) {
    return (
      <div style={{ padding: 16 }}>
        <ItemList items={[]} rowKey={() => 0} renderItem={() => null} emptyText="Không có việc nào cần xử lý. Tốt lắm!" />
      </div>
    );
  }
  return (
    <div className="todo-groups">
      {[...groups].map(([reason, items]) => (
        <section key={reason} className={`todo-group todo-${reason}`}>
          <h3 className="todo-group-title">
            {TODO_REASON[reason]} <span className="todo-group-count">{items.length}</span>
          </h3>
          <ItemList
            items={items}
            rowKey={(t) => t.id}
            renderItem={(t) => (
              <ItemRow
                title={
                  <Link to={`/tasks/${t.id}`} className="task-link">
                    {t.title}
                  </Link>
                }
                description={
                  reason === 'review'
                    ? `Báo cáo của ${leads(t)} · hạn ${new Date(t.dueDate).toLocaleDateString('vi-VN')}`
                    : `Giao bởi ${t.createdBy.fullName}${t.progress ? ` · ${t.progress}%` : ''}`
                }
                actions={
                  <>
                    <PriorityPill priority={t.priority} />
                    <DueTag dueDate={t.dueDate} status={t.status} />
                  </>
                }
              />
            )}
          />
        </section>
      ))}
    </div>
  );
}

/** Các mục còn lại: danh sách có lọc trạng thái, tìm kiếm, phân trang. */
function TaskList({
  view,
  status,
  setParams,
}: {
  view: Exclude<View, 'todo'>;
  status?: TaskStatus;
  setParams: ReturnType<typeof useSearchParams>[1];
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'list', { view, status, q, page }],
    queryFn: () =>
      api.get<Paged<TaskRow>>(`/tasks${toQuery({ view: view === 'all' ? undefined : view, status, q, page })}`),
  });
  // Màn hình hẹp: hiển thị dạng thẻ thay cho bảng nhiều cột.
  const compact = !Grid.useBreakpoint().md;

  return (
    <>
      <div className="filter-bar">
        <Select
          allowClear
          placeholder="Tất cả trạng thái"
          style={{ width: 190 }}
          value={status}
          onChange={(v?: TaskStatus) => {
            setParams(v ? { view, status: v } : { view });
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
        {compact && data && <span className="muted">{data.total} công việc</span>}
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
                        <DueTag dueDate={t.dueDate} status={t.status} />
                        <StatusPill status={t.status} />
                        <PriorityPill priority={t.priority} />
                      </div>
                      {leads(t)}
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
            { title: 'Chủ trì', width: 200, render: (_, r) => leads(r) },
            {
              title: 'Hạn',
              dataIndex: 'dueDate',
              width: 140,
              render: (d: string, r) => (
                <>
                  <DueTag dueDate={d} status={r.status} />
                  <div className="muted">{new Date(d).toLocaleDateString('vi-VN')}</div>
                </>
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
              width: 150,
              render: (s: TaskStatus) => <StatusPill status={s} />,
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
    </>
  );
}
