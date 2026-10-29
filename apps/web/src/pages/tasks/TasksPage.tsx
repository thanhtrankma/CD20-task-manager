import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Badge,
  Button,
  Checkbox,
  DatePicker,
  Grid,
  Input,
  Pagination,
  Popconfirm,
  Progress,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  TreeSelect,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { Download, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, toQuery } from '../../api/client';
import type { Assignee, Paged, Priority, TaskCounts, TaskRow, TaskStatus, TodoItem, TodoReason, Unit, UserRow } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ItemList, ItemRow } from '../../components/ItemList';
import { DueTag, PriorityPill, StatusPill } from '../../components/Pill';
import { DATE_FORMAT, DATETIME_FORMAT, PRIORITY, STATUS, TODO_REASON } from '../../constants';
import { downloadXlsx, headerRow } from '../../utils/excel';
import { buildUnitTree } from '../../utils/units';
import { PageHeader, Panel, useShell } from '../../layouts/shell';

export const assigneeLabel = (a: Pick<Assignee, 'unit' | 'user'>) => a.unit?.name ?? a.user?.fullName ?? '';
const leads = (t: TaskRow) => t.assignees.filter((a) => a.role === 'LEAD').map(assigneeLabel).join(', ');

/** Các mục của "Việc của tôi". "all": mọi việc trong phạm vi được xem (đơn vị, toàn trường). */
type View = 'todo' | 'assigned' | 'created' | 'review' | 'following' | 'all';
const VIEWS: View[] = ['todo', 'assigned', 'created', 'review', 'following', 'all'];

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
        ]
      : []),
    // Cán bộ thường chỉ hiện mục Theo dõi khi đang theo dõi việc nào đó.
    ...(canAssign || counts.data?.following ? [{ key: 'following', label: `Theo dõi${n(counts.data?.following)}` }] : []),
    ...(canAssign ? [{ key: 'all', label: me?.role === 'LEADER' ? 'Toàn trường' : 'Đơn vị' }] : []),
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
          {view === 'todo' ? (
            <TodoList />
          ) : view === 'review' ? (
            <ReviewList />
          ) : (
            <TaskList key={view} view={view} status={status} setParams={setParams} />
          )}
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

const VIEW_LABEL: Record<Exclude<View, 'todo'>, string> = {
  assigned: 'Được giao',
  created: 'Đã giao',
  review: 'Chờ duyệt',
  following: 'Theo dõi',
  all: 'Toàn bộ',
};

/** Đánh giá so với hạn, cùng cách tính với trang Thống kê. */
function resultOf(t: TaskRow & { completedAt?: string | null }) {
  if (t.status === 'CANCELLED') return 'Đã hủy';
  if (t.status === 'DONE') return t.completedAt && t.completedAt > t.dueDate ? 'Hoàn thành quá hạn' : 'Hoàn thành đúng hạn';
  return t.overdue ? 'Đang thực hiện quá hạn' : 'Đang thực hiện trong hạn';
}

/** Xuất toàn bộ danh sách theo mục, bộ lọc đang chọn (không chỉ trang đang xem) ra Excel, phục vụ giao ban. */
/** Bộ lọc nâng cao của danh sách (gửi lên máy chủ cùng mục, trạng thái, từ khóa). */
interface Filters {
  priority?: Priority;
  unitId?: number;
  createdById?: number;
  due?: [Dayjs, Dayjs] | null;
  overdue?: boolean;
  sort?: 'due' | 'newest';
}

const filterQuery = (f: Filters) => ({
  priority: f.priority,
  unitId: f.unitId,
  createdById: f.createdById,
  dueFrom: f.due?.[0].startOf('day').toISOString(),
  dueTo: f.due?.[1].endOf('day').toISOString(),
  overdue: f.overdue ? '1' : undefined,
  sort: f.sort === 'newest' ? 'newest' : undefined,
});

/** Số bộ lọc nâng cao đang bật (hiện trên nút "Bộ lọc"). */
const activeFilters = (f: Filters) =>
  [f.priority, f.unitId, f.createdById, f.due, f.overdue].filter((v) => v !== undefined && v !== null && v !== false)
    .length;

async function exportTasks(view: Exclude<View, 'todo'>, status?: TaskStatus, q?: string, filters: Filters = {}) {
  type Row = TaskRow & { source?: string | null; completedAt?: string | null };
  const items: Row[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await api.get<Paged<Row>>(
      // export=1: máy chủ ghi nhật ký lượt xuất.
      `/tasks${toQuery({
        view: view === 'all' ? undefined : view,
        status,
        q,
        ...filterQuery(filters),
        page,
        pageSize: 100,
        export: '1',
      })}`,
    );
    items.push(...r.items);
    if (items.length >= r.total) break;
  }
  const by = (t: Row, role: 'LEAD' | 'SUPPORT') =>
    t.assignees.filter((a) => a.role === role).map(assigneeLabel).join(', ');
  await downloadXlsx(`nhiem-vu-${dayjs().format('YYYYMMDD-HHmm')}.xlsx`, [
    {
      name: VIEW_LABEL[view],
      data: [
        headerRow(['STT', 'Nhiệm vụ', 'Căn cứ', 'Người giao', 'Chủ trì', 'Phối hợp', 'Hạn', 'Mức ưu tiên', 'Trạng thái', 'Tiến độ (%)', 'Hoàn thành lúc', 'Đánh giá']),
        ...items.map((t, i) => [
          i + 1,
          t.title,
          t.source ?? '',
          t.createdBy.fullName,
          by(t, 'LEAD'),
          by(t, 'SUPPORT'),
          dayjs(t.dueDate).format(DATETIME_FORMAT),
          PRIORITY[t.priority].label,
          STATUS[t.status].label,
          t.progress,
          t.completedAt ? dayjs(t.completedAt).format(DATETIME_FORMAT) : '',
          resultOf(t),
        ]),
      ],
      widths: [6, 44, 28, 22, 26, 24, 17, 12, 16, 10, 17, 22],
    },
  ]);
  return items.length;
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
  const { message } = App.useApp();
  const { me } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [showFilters, setShowFilters] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'list', { view, status, q, page, filters: filterQuery(filters) }],
    queryFn: () =>
      api.get<Paged<TaskRow>>(
        `/tasks${toQuery({ view: view === 'all' ? undefined : view, status, q, page, ...filterQuery(filters) })}`,
      ),
  });
  // Danh sách đơn vị, người giao cho bộ lọc: chỉ tải khi mở bộ lọc. Cán bộ không xem được danh sách tài khoản.
  const canListUsers = me?.role === 'LEADER' || me?.role === 'UNIT_HEAD';
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Unit[]>('/units'), enabled: showFilters });
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserRow[]>('/users'),
    enabled: showFilters && canListUsers,
  });
  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const nActive = activeFilters(filters);
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
          placeholder="Tìm theo tên, căn cứ (số văn bản)"
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
        <Badge count={nActive} size="small" color="#b91c1c">
          <Button
            icon={<SlidersHorizontal size={15} />}
            type={showFilters ? 'primary' : 'default'}
            ghost={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          >
            Bộ lọc
          </Button>
        </Badge>
        <Select
          value={filters.sort ?? 'due'}
          style={{ width: 170 }}
          onChange={(sort) => setFilter({ sort })}
          options={[
            { value: 'due', label: 'Hạn gần nhất trước' },
            { value: 'newest', label: 'Mới giao trước' },
          ]}
        />
        {compact && data && <span className="muted">{data.total} công việc</span>}
        <Button
          icon={<Download size={15} />}
          loading={exporting}
          disabled={!data?.total}
          style={{ marginLeft: 'auto' }}
          onClick={async () => {
            setExporting(true);
            try {
              message.success(`Đã xuất ${await exportTasks(view, status, q || undefined, filters)} nhiệm vụ`);
            } catch (e) {
              message.error((e as Error).message);
            } finally {
              setExporting(false);
            }
          }}
        >
          <span className="hide-xs">Xuất Excel</span>
        </Button>
      </div>

      {showFilters && (
        <div className="filter-bar filter-advanced">
          <Select
            allowClear
            placeholder="Mức ưu tiên"
            style={{ width: 150 }}
            value={filters.priority}
            onChange={(priority?: Priority) => setFilter({ priority })}
            options={Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label }))}
          />
          <TreeSelect
            allowClear
            showSearch
            treeNodeFilterProp="title"
            placeholder="Đơn vị nhận (gồm trực thuộc)"
            style={{ width: 240 }}
            value={filters.unitId}
            onChange={(unitId?: number) => setFilter({ unitId })}
            treeData={buildUnitTree(units.data ?? [], { includeInactive: true })}
            treeDefaultExpandAll
            loading={units.isLoading}
          />
          {canListUsers && (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Người giao"
              style={{ width: 210 }}
              value={filters.createdById}
              onChange={(createdById?: number) => setFilter({ createdById })}
              loading={users.isLoading}
              options={(users.data ?? [])
                .filter((u) => u.role === 'LEADER' || u.role === 'UNIT_HEAD')
                .map((u) => ({ value: u.id, label: u.fullName }))}
            />
          )}
          <DatePicker.RangePicker
            format="DD/MM/YYYY"
            placeholder={['Hạn từ ngày', 'đến ngày']}
            value={filters.due ?? null}
            onChange={(v) => setFilter({ due: v?.[0] && v[1] ? [v[0], v[1]] : null })}
          />
          <Checkbox checked={!!filters.overdue} onChange={(e) => setFilter({ overdue: e.target.checked || undefined })}>
            Chỉ việc quá hạn
          </Checkbox>
          {nActive > 0 && (
            <Button type="link" onClick={() => setFilter({ priority: undefined, unitId: undefined, createdById: undefined, due: null, overdue: undefined })}>
              Xóa bộ lọc
            </Button>
          )}
        </div>
      )}

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

/**
 * Mục "Chờ duyệt": báo cáo, đề nghị gia hạn chờ chính mình xử lý. Duyệt nhanh ngay trên dòng,
 * hoặc chọn nhiều báo cáo rồi duyệt "Đạt" một lần (trả lại cần nhận xét nên làm từng báo cáo).
 */
function ReviewList() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'list', { view: 'review' }],
    queryFn: () => api.get<Paged<TaskRow>>('/tasks?view=review&pageSize=100'),
  });
  const items = data?.items ?? [];
  const submissionOf = (t: TaskRow) => t.submissions?.[0];
  const extensionOf = (t: TaskRow) => t.extensionRequests?.[0];
  const noteValue = (id: string) => (document.getElementById(id) as HTMLTextAreaElement | null)?.value || undefined;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      message.success(ok);
      setSelected([]);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ['tasks'] });
    }
  };

  const approveSelected = () =>
    act(async () => {
      const ids = items.filter((t) => selected.includes(t.id)).map((t) => submissionOf(t)!.id);
      const r = await api.post<{ approved: number; failed: { id: number; message: string }[] }>(
        '/submissions/approve-batch',
        { submissionIds: ids },
      );
      if (r.failed.length) message.warning(`${r.failed.length} báo cáo chưa duyệt được: ${r.failed[0].message}`);
    }, 'Đã duyệt các báo cáo đã chọn');

  const actions = (t: TaskRow) => {
    const sub = submissionOf(t);
    const ext = extensionOf(t);
    if (sub) {
      return (
        <Space size={6} wrap>
          <Button
            size="small"
            type="primary"
            disabled={busy}
            onClick={() => act(() => api.post(`/submissions/${sub.id}/review`, { decision: 'APPROVED' }), 'Đã duyệt')}
          >
            Duyệt
          </Button>
          <Popconfirm
            title="Trả lại báo cáo?"
            description={<Input.TextArea id={`rv-${sub.id}`} placeholder="Nhận xét, yêu cầu bổ sung" />}
            onConfirm={() =>
              act(
                () => api.post(`/submissions/${sub.id}/review`, { decision: 'RETURNED', note: noteValue(`rv-${sub.id}`) }),
                'Đã trả lại',
              )
            }
          >
            <Button size="small" disabled={busy}>
              Trả lại
            </Button>
          </Popconfirm>
        </Space>
      );
    }
    if (ext) {
      return (
        <Space size={6} wrap>
          <Button
            size="small"
            type="primary"
            disabled={busy}
            onClick={() =>
              act(() => api.post(`/tasks/extensions/${ext.id}/decide`, { decision: 'APPROVED' }), 'Đã chấp thuận gia hạn')
            }
          >
            Gia hạn
          </Button>
          <Popconfirm
            title="Không chấp thuận gia hạn?"
            description={<Input.TextArea id={`ex-${ext.id}`} placeholder="Lý do" />}
            onConfirm={() =>
              act(
                () => api.post(`/tasks/extensions/${ext.id}/decide`, { decision: 'REJECTED', note: noteValue(`ex-${ext.id}`) }),
                'Đã trả lời đề nghị',
              )
            }
          >
            <Button size="small" disabled={busy}>
              Không
            </Button>
          </Popconfirm>
        </Space>
      );
    }
    return null;
  };

  const what = (t: TaskRow) => {
    const sub = submissionOf(t);
    const ext = extensionOf(t);
    if (sub) return `Báo cáo của ${sub.submittedBy.fullName} · ${dayjs(sub.createdAt).format('DD/MM HH:mm')}`;
    if (ext) return `${ext.requestedBy.fullName} xin gia hạn đến ${dayjs(ext.newDueDate).format(DATE_FORMAT)}: ${ext.reason}`;
    return '';
  };

  return (
    <>
      <div className="filter-bar">
        <Button type="primary" disabled={!selected.length || busy} onClick={approveSelected}>
          Duyệt Đạt {selected.length ? `(${selected.length})` : ''}
        </Button>
        <span className="muted">Chọn các báo cáo đã xem rồi duyệt một lần; trả lại thì làm từng báo cáo kèm nhận xét.</span>
      </div>
      <Table<TaskRow>
        rowKey="id"
        loading={isLoading}
        dataSource={items}
        pagination={false}
        scroll={{ x: 760 }}
        locale={{ emptyText: 'Không có báo cáo, đề nghị nào chờ đồng chí xử lý' }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as number[]),
          // Chỉ chọn được việc có báo cáo chờ duyệt (đề nghị gia hạn xử lý riêng).
          getCheckboxProps: (t) => ({ disabled: !submissionOf(t) }),
        }}
        columns={[
          {
            title: 'Nhiệm vụ',
            render: (_, t) => (
              <>
                <Link to={`/tasks/${t.id}`} className="task-link">
                  {t.title}
                </Link>
                <div className="muted">{what(t)}</div>
              </>
            ),
          },
          {
            title: 'Hạn',
            dataIndex: 'dueDate',
            width: 130,
            render: (d: string, t) => <DueTag dueDate={d} status={t.status} />,
          },
          { title: '', width: 190, render: (_, t) => actions(t) },
        ]}
      />
    </>
  );
}
