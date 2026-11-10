import { useQuery } from '@tanstack/react-query';
import { App, Button, DatePicker, Input, Table, Tooltip, TreeSelect } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, toQuery } from '../../api/client';
import type { AttendanceDay, Unit, UnitAttendance } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { DAY_STATUS, WEEKDAY } from '../../constants';
import { PageHeader, Panel } from '../../layouts/shell';
import { downloadXlsx, headerRow } from '../../utils/excel';
import { fmtDays } from '../../utils/leave';
import { buildUnitTree } from '../../utils/units';
import { dayText, monthRange, sessionText } from './MyAttendancePage';

type Row = UnitAttendance['rows'][number];

/** Ký hiệu một ô bảng công; nghỉ nửa ngày thêm "½P". */
const symbol = (d: AttendanceDay) =>
  d.leave && d.status !== 'LEAVE' ? `${DAY_STATUS[d.status].short || ''}½P` : d.status === 'PENDING' ? '' : DAY_STATUS[d.status].short;

/** Bảng công đơn vị: người × ngày trong tháng, tổng hợp từng người; xuất Excel. Chỉ huy đơn vị, lãnh đạo, phụ trách nhân sự. */
export function UnitAttendancePage() {
  const { message } = App.useApp();
  const { me } = useAuth();
  const [search, setSearch] = useSearchParams();
  const month = search.get('month') ? dayjs(`${search.get('month')}-01`) : dayjs();
  const unitId = search.get('unitId') ? Number(search.get('unitId')) : undefined;
  const [q, setQ] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const range = monthRange(month);
  const query = { ...range, unitId, q };
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Unit[]>('/units') });
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'unit', query],
    queryFn: () => api.get<UnitAttendance>(`/attendance/unit${toQuery(query)}`),
  });
  const setParam = (k: string, v?: string) => {
    const next = new URLSearchParams(search);
    if (v) next.set(k, v);
    else next.delete(k);
    setSearch(next);
  };
  // Chỉ huy đơn vị chỉ chọn trong đơn vị mình; lãnh đạo, phụ trách nhân sự chọn toàn trường.
  const all = units.data ?? [];
  const seesAll = me?.role === 'LEADER' || me?.hrManager;
  const treeUnits = seesAll ? all : subtree(all, me?.unitId);

  const columns: ColumnsType<Row> = [
    {
      title: 'Họ tên',
      fixed: 'left',
      width: 190,
      render: (_, r) => (
        <>
          <Link to={`/attendance/users/${r.user.id}?month=${month.format('YYYY-MM')}`} className="task-link">
            {r.user.fullName}
          </Link>
          <div className="muted" style={{ fontSize: 12 }}>
            {r.user.unit.name}
            {!r.user.attendanceCode && ' · chưa ghép mã'}
          </div>
        </>
      ),
    },
    ...(data?.days ?? []).map((d, i) => ({
      key: d.day,
      width: 40,
      title: (
        <Tooltip title={d.holiday ?? undefined}>
          <div className={d.holiday || d.weekday > 5 ? 'att-day-head off' : 'att-day-head'}>
            {WEEKDAY[d.weekday]}
            <br />
            {d.day.slice(8)}
          </div>
        </Tooltip>
      ),
      onCell: (r: Row) => ({
        className: 'att-cell',
        style: { background: DAY_STATUS[r.days[i].status].bg, color: DAY_STATUS[r.days[i].status].fg },
      }),
      render: (_: unknown, r: Row) => {
        const day = r.days[i];
        const text = symbol(day);
        if (!text && !day.punches.length) return null;
        return (
          <Tooltip
            title={
              <>
                <div>{dayjs(day.day).format('DD/MM')}: {dayText(day)}</div>
                {day.sessions.map((x) => (
                  <div key={x.key}>{sessionText(x)}</div>
                ))}
              </>
            }
          >
            <span>{text || '·'}</span>
          </Tooltip>
        );
      },
    })),
    { title: 'Công', width: 64, align: 'right', fixed: 'right', render: (_, r) => fmtDays(r.summary.work) },
    { title: 'Muộn', width: 60, align: 'right', fixed: 'right', render: (_, r) => r.summary.lateCount || '' },
    { title: 'Sớm', width: 56, align: 'right', fixed: 'right', render: (_, r) => r.summary.earlyCount || '' },
    { title: 'Thiếu', width: 60, align: 'right', fixed: 'right', render: (_, r) => r.summary.missing || '' },
    { title: 'Vắng', width: 56, align: 'right', fixed: 'right', render: (_, r) => r.summary.absent || '' },
    { title: 'Phép', width: 56, align: 'right', fixed: 'right', render: (_, r) => (r.summary.leave ? fmtDays(r.summary.leave) : '') },
    {
      title: 'Làm thêm',
      width: 84,
      align: 'right',
      fixed: 'right',
      render: (_, r) => (r.summary.overtimeMinutes ? `${fmtDays(Math.round(r.summary.overtimeMinutes / 6) / 10)} giờ` : ''),
    },
  ];

  const exportExcel = async () => {
    setExporting(true);
    try {
      // Gọi lại kèm export=1 để máy chủ ghi nhật ký xuất dữ liệu.
      const sheet = await api.get<UnitAttendance>(`/attendance/unit${toQuery({ ...query, export: '1' })}`);
      const dayHeads = sheet.days.map((d) => `${WEEKDAY[d.weekday]} ${d.day.slice(8)}`);
      const totals = ['Công', 'Muộn (ca)', 'Phút muộn', 'Sớm (ca)', 'Phút sớm', 'Ca thiếu chấm', 'Ca vắng', 'Nghỉ phép', 'Làm thêm (phút)'];
      await downloadXlsx(`bang-cong-${month.format('YYYY-MM')}.xlsx`, [
        {
          name: 'Bảng công',
          widths: [26, 28, ...dayHeads.map(() => 6), ...totals.map(() => 10)],
          data: [
            headerRow(['Họ tên', 'Đơn vị', ...dayHeads, ...totals]),
            ...sheet.rows.map((r) => [
              { value: r.user.fullName },
              { value: r.user.unit.name },
              ...r.days.map((d) => ({ value: symbol(d) })),
              ...[
                r.summary.work,
                r.summary.lateCount,
                r.summary.lateMinutes,
                r.summary.earlyCount,
                r.summary.earlyMinutes,
                r.summary.missing,
                r.summary.absent,
                r.summary.leave,
                r.summary.overtimeMinutes,
              ].map((value) => ({ value })),
            ]),
            [],
            [{ value: 'Ký hiệu: ✓ đủ công · M đi muộn · S về sớm · MS muộn và sớm · ? thiếu lượt chấm · ½V vắng một ca · V vắng · P nghỉ phép · ½P nghỉ nửa ngày · L ngày lễ' }],
          ],
        },
        {
          name: 'Chi tiết',
          widths: [26, 12, 9, 9, 9, 9, 9, 9, 12, 50],
          data: [
            headerRow(['Họ tên', 'Ngày', 'Vào ca 1', 'Ra ca 1', 'Vào ca 2', 'Ra ca 2', 'Vào ca 3', 'Ra ca 3', 'Làm thêm (phút)', 'Tình trạng']),
            ...sheet.rows.flatMap((r) =>
              r.days
                .filter((d) => d.status !== 'WEEKEND' && d.status !== 'PENDING')
                .map((d) => [
                  { value: r.user.fullName },
                  { value: dayjs(d.day).format('DD/MM/YYYY') },
                  ...([1, 2, 3] as const).flatMap((k) => {
                    const x = d.sessions.find((c) => c.key === k);
                    return [{ value: x?.in ?? '' }, { value: x?.out ?? '' }];
                  }),
                  { value: d.overtime || '' },
                  { value: dayText(d) },
                ]),
            ),
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
      <PageHeader title="Bảng công" subtitle="Tổng hợp chấm công theo đơn vị, theo tháng" />
      <div className="shell-content">
        <Panel flush>
          <div className="filter-bar">
            <TreeSelect
              allowClear={!!seesAll}
              showSearch
              treeNodeFilterProp="title"
              placeholder={seesAll ? 'Toàn trường' : 'Đơn vị'}
              style={{ width: 260, maxWidth: '100%' }}
              value={unitId ?? (seesAll ? undefined : me?.unitId)}
              onChange={(v?: number) => setParam('unitId', v ? String(v) : undefined)}
              treeData={buildUnitTree(treeUnits)}
              treeDefaultExpandAll
            />
            <DatePicker
              picker="month"
              format="MM/YYYY"
              allowClear={false}
              value={month}
              onChange={(m) => setParam('month', m?.format('YYYY-MM'))}
              disabledDate={(d) => d.isAfter(dayjs(), 'month')}
            />
            <Input.Search allowClear placeholder="Tìm theo họ tên" style={{ width: 200, maxWidth: '100%' }} onSearch={(v) => setQ(v || undefined)} />
            <Button icon={<Download size={15} />} loading={exporting} onClick={exportExcel}>
              Xuất Excel
            </Button>
          </div>
          <Table<Row>
            className="att-sheet"
            rowKey={(r) => r.user.id}
            size="small"
            bordered
            loading={isLoading}
            dataSource={data?.rows ?? []}
            columns={columns}
            pagination={{ pageSize: 50, hideOnSinglePage: true }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: 'Không có cán bộ nào trong phạm vi đã chọn' }}
          />
          <div className="att-legend" style={{ padding: '0 20px 16px' }}>
            {(['OK', 'LATE', 'EARLY', 'LATE_EARLY', 'MISSING', 'ABSENT_HALF', 'ABSENT', 'LEAVE', 'HOLIDAY'] as const).map((k) => (
              <span key={k}>
                <i style={{ background: DAY_STATUS[k].bg, borderColor: DAY_STATUS[k].fg }} />
                <b style={{ color: DAY_STATUS[k].fg }}>{DAY_STATUS[k].short}</b> {DAY_STATUS[k].label}
              </span>
            ))}
            <span>½P nghỉ nửa ngày</span>
          </div>
        </Panel>
      </div>
    </>
  );
}

/** Đơn vị và các đơn vị trực thuộc (để chỉ huy đơn vị chọn trong phạm vi của mình). */
function subtree(units: Unit[], rootId?: number): Unit[] {
  if (!rootId) return [];
  const keep = new Set([rootId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const u of units) {
      if (u.parentId != null && keep.has(u.parentId) && !keep.has(u.id)) {
        keep.add(u.id);
        grew = true;
      }
    }
  }
  return units.filter((u) => keep.has(u.id)).map((u) => (u.id === rootId ? { ...u, parentId: null } : u));
}
