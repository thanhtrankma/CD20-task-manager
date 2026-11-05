import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Input, Pagination, Popconfirm, Select, Space, Table, Tabs, TreeSelect } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { CalendarCheck2, CalendarClock, CalendarPlus, Download, Hourglass, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, toQuery } from '../../api/client';
import type { LeaveBalance, LeaveRequest, LeaveStatus, Paged, Unit } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Pill } from '../../components/Pill';
import { Stat } from '../../components/Stat';
import { DATETIME_FORMAT, LEAVE_STATUS } from '../../constants';
import { PageHeader, Panel } from '../../layouts/shell';
import { downloadXlsx, headerRow } from '../../utils/excel';
import { fmtDays, leavePeriod, useHrCatalog, useLeavePending } from '../../utils/leave';
import { buildUnitTree } from '../../utils/units';
import { LeaveRequestModal } from './LeaveRequestModal';

type Scope = 'mine' | 'approve' | 'unit';

/** Quỹ phép năm của mình. */
function BalanceCards({ year }: { year: number }) {
  const { data } = useQuery({
    queryKey: ['leave', 'balance', year],
    queryFn: () => api.get<LeaveBalance>(`/leave/balance?year=${year}`),
  });
  const v = (n?: number) => (n === undefined ? undefined : fmtDays(n));
  return (
    <div className="stat-grid">
      <Stat label={`Phép năm ${year}`} value={v(data?.entitled)} icon={Wallet} tone="tone-blue" />
      <Stat label="Tồn năm trước" value={v(data?.carried)} icon={CalendarClock} tone="tone-indigo" />
      <Stat label="Đã nghỉ" value={v(data?.used)} icon={CalendarCheck2} tone="tone-green" />
      <Stat label="Đang chờ duyệt" value={v(data?.pending)} icon={Hourglass} tone="tone-amber" />
      <Stat label="Còn lại" value={v(data?.remaining)} icon={Wallet} tone="tone-rose" />
    </div>
  );
}

const statusOptions = Object.entries(LEAVE_STATUS).map(([value, t]) => ({ value, label: t.label }));

export function LeavePage() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const canApprove = me?.role === 'LEADER' || me?.role === 'UNIT_HEAD';
  const seesUnit = canApprove || !!me?.hrManager;
  const pending = useLeavePending(canApprove);
  const scopeParam = params.get('scope') as Scope | null;
  const scope: Scope = scopeParam === 'approve' && canApprove ? 'approve' : scopeParam === 'unit' && seesUnit ? 'unit' : 'mine';
  const n = pending.data?.count;

  return (
    <>
      <PageHeader
        title="Nghỉ phép"
        subtitle="Đăng ký nghỉ, theo dõi đơn và số ngày phép còn lại"
        actions={
          <Button type="primary" icon={<CalendarPlus size={16} />} onClick={() => setCreating(true)}>
            <span className="hide-xs">Đăng ký nghỉ</span>
          </Button>
        }
      />
      <div className="shell-content">
        <BalanceCards year={dayjs().year()} />
        <Panel flush>
          <Tabs
            activeKey={scope}
            onChange={(k) => setParams(k === 'mine' ? {} : { scope: k })}
            tabBarStyle={{ padding: '0 20px', marginBottom: 0 }}
            items={[
              { key: 'mine', label: 'Đơn của tôi' },
              ...(canApprove ? [{ key: 'approve', label: `Chờ tôi duyệt${n ? ` (${n})` : ''}` }] : []),
              ...(seesUnit
                ? [{ key: 'unit', label: me?.role === 'LEADER' || me?.hrManager ? 'Toàn trường' : 'Đơn vị' }]
                : []),
            ]}
          />
          {scope === 'approve' ? <ApproveList /> : <RequestList key={scope} scope={scope} />}
        </Panel>
      </div>
      <LeaveRequestModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

interface Filters {
  status?: LeaveStatus;
  typeId?: number;
  unitId?: number;
  q?: string;
  range?: [Dayjs, Dayjs] | null;
}

function RequestList({ scope }: { scope: 'mine' | 'unit' }) {
  const { message } = App.useApp();
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const catalog = useHrCatalog();
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Unit[]>('/units'), enabled: scope === 'unit' });
  const query = {
    scope,
    status: filters.status,
    typeId: filters.typeId,
    unitId: filters.unitId,
    q: filters.q,
    from: filters.range?.[0].format('YYYY-MM-DD'),
    to: filters.range?.[1].format('YYYY-MM-DD'),
  };
  const { data, isLoading } = useQuery({
    queryKey: ['leave', 'list', query, page],
    queryFn: () => api.get<Paged<LeaveRequest>>(`/leave${toQuery({ ...query, page, pageSize: 20 })}`),
  });
  const set = (f: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...f }));
    setPage(1);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const all: LeaveRequest[] = [];
      for (let p = 1; p <= 20; p++) {
        const r = await api.get<Paged<LeaveRequest>>(`/leave${toQuery({ ...query, page: p, pageSize: 200 })}`);
        all.push(...r.items);
        if (all.length >= r.total) break;
      }
      await downloadXlsx(`don-nghi-phep-${dayjs().format('YYYYMMDD')}.xlsx`, [
        {
          name: 'Đơn nghỉ',
          widths: [28, 30, 22, 34, 10, 40, 18, 18],
          data: [
            headerRow(['Họ tên', 'Đơn vị', 'Loại nghỉ', 'Thời gian', 'Số ngày', 'Lý do', 'Trạng thái', 'Gửi lúc']),
            ...all.map((r) => [
              { value: r.user.fullName },
              { value: r.user.unit.name },
              { value: r.type.name },
              { value: leavePeriod(r) },
              { value: r.days },
              { value: r.reason },
              { value: LEAVE_STATUS[r.status].label },
              { value: dayjs(r.createdAt).format(DATETIME_FORMAT) },
            ]),
          ],
        },
      ]);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="filter-bar">
        {scope === 'unit' && (
          <>
            <Input.Search
              allowClear
              placeholder="Tìm theo họ tên"
              style={{ width: 210, maxWidth: '100%' }}
              onSearch={(q) => set({ q: q || undefined })}
            />
            <TreeSelect
              allowClear
              showSearch
              treeNodeFilterProp="title"
              placeholder="Đơn vị (gồm trực thuộc)"
              style={{ width: 240, maxWidth: '100%' }}
              value={filters.unitId}
              onChange={(unitId?: number) => set({ unitId })}
              treeData={buildUnitTree(units.data ?? [])}
              treeDefaultExpandAll
            />
          </>
        )}
        <Select
          allowClear
          placeholder="Trạng thái"
          style={{ width: 180, maxWidth: '100%' }}
          value={filters.status}
          onChange={(status?: LeaveStatus) => set({ status })}
          options={statusOptions}
        />
        <Select
          allowClear
          placeholder="Loại nghỉ"
          style={{ width: 200, maxWidth: '100%' }}
          value={filters.typeId}
          onChange={(typeId?: number) => set({ typeId })}
          options={(catalog.data?.leaveTypes ?? []).map((t) => ({ value: t.id, label: t.name }))}
        />
        <DatePicker.RangePicker
          format="DD/MM/YYYY"
          value={filters.range ?? null}
          onChange={(v) => set({ range: v as [Dayjs, Dayjs] | null })}
          placeholder={['Nghỉ từ ngày', 'đến ngày']}
        />
        {scope === 'unit' && (
          <Button icon={<Download size={15} />} loading={exporting} onClick={exportExcel}>
            Xuất Excel
          </Button>
        )}
      </div>
      <Table<LeaveRequest>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        pagination={false}
        scroll={{ x: 820 }}
        locale={{ emptyText: scope === 'mine' ? 'Đồng chí chưa gửi đơn nghỉ nào' : 'Không có đơn nghỉ nào' }}
        columns={[
          ...(scope === 'unit'
            ? [
                {
                  title: 'Người nghỉ',
                  render: (_: unknown, r: LeaveRequest) => (
                    <>
                      <div style={{ fontWeight: 600 }}>{r.user.fullName}</div>
                      <div className="muted">{r.user.unit.name}</div>
                    </>
                  ),
                },
              ]
            : []),
          {
            title: 'Thời gian nghỉ',
            render: (_, r) => (
              <Link to={`/leave/${r.id}`} className="task-link">
                {leavePeriod(r)}
              </Link>
            ),
          },
          { title: 'Loại nghỉ', width: 190, render: (_, r) => r.type.name },
          { title: 'Số ngày', width: 90, align: 'right', render: (_, r) => fmtDays(r.days) },
          { title: 'Trạng thái', width: 170, render: (_, r) => <Pill tone={LEAVE_STATUS[r.status]} /> },
          { title: 'Gửi lúc', width: 150, render: (_, r) => dayjs(r.createdAt).format(DATETIME_FORMAT) },
        ]}
      />
      {(data?.total ?? 0) > 20 && (
        <div className="filter-bar" style={{ justifyContent: 'flex-end', borderBottom: 0 }}>
          <Pagination current={page} pageSize={20} total={data?.total} onChange={setPage} showSizeChanger={false} />
        </div>
      )}
    </>
  );
}

/** Đơn chờ mình duyệt: duyệt nhanh trên dòng, hoặc chọn nhiều đơn rồi duyệt một lần. */
function ApproveList() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['leave', 'list', { scope: 'approve' }],
    queryFn: () => api.get<Paged<LeaveRequest>>('/leave?scope=approve&pageSize=200'),
  });
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
      await qc.invalidateQueries({ queryKey: ['leave'] });
    }
  };

  return (
    <>
      <div className="filter-bar">
        <Button
          type="primary"
          disabled={!selected.length || busy}
          onClick={() =>
            act(async () => {
              const r = await api.post<{ approved: number; failed: { id: number; message: string }[] }>(
                '/leave/approve-batch',
                { ids: selected },
              );
              if (r.failed.length) message.warning(`${r.failed.length} đơn chưa duyệt được: ${r.failed[0].message}`);
            }, 'Đã duyệt các đơn đã chọn')
          }
        >
          Duyệt {selected.length ? `(${selected.length})` : ''}
        </Button>
        <span className="muted">Chọn các đơn đã xem rồi duyệt một lần; không duyệt thì làm từng đơn kèm lý do.</span>
      </div>
      <Table<LeaveRequest>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        pagination={false}
        scroll={{ x: 860 }}
        locale={{ emptyText: 'Không có đơn nghỉ nào chờ đồng chí duyệt' }}
        rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as number[]) }}
        columns={[
          {
            title: 'Người nghỉ',
            render: (_, r) => (
              <>
                <Link to={`/leave/${r.id}`} className="task-link">
                  {r.user.fullName}
                </Link>
                <div className="muted">
                  {r.user.unit.name} · {r.type.name}: {r.reason}
                </div>
              </>
            ),
          },
          { title: 'Thời gian nghỉ', width: 230, render: (_, r) => leavePeriod(r) },
          { title: 'Số ngày', width: 90, align: 'right', render: (_, r) => fmtDays(r.days) },
          {
            title: '',
            width: 200,
            render: (_, r) => (
              <Space size={6} wrap>
                <Button
                  size="small"
                  type="primary"
                  disabled={busy}
                  onClick={() => act(() => api.post(`/leave/${r.id}/decide`, { decision: 'APPROVED' }), 'Đã duyệt')}
                >
                  Duyệt
                </Button>
                <Popconfirm
                  title="Không duyệt đơn này?"
                  description={<Input.TextArea id={`lv-${r.id}`} placeholder="Lý do (bắt buộc)" />}
                  onConfirm={() =>
                    act(
                      () => api.post(`/leave/${r.id}/decide`, { decision: 'REJECTED', note: noteValue(`lv-${r.id}`) }),
                      'Đã trả lời đơn',
                    )
                  }
                >
                  <Button size="small" disabled={busy}>
                    Không duyệt
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </>
  );
}
