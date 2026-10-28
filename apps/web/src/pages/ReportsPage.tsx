import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Empty, Segmented, Skeleton, Table, Tooltip } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { api, toQuery } from '../api/client';
import type { Report, ReportCounts } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, Panel } from '../layouts/shell';
import { downloadXlsx, headerRow } from '../utils/excel';

/**
 * 4 nhóm theo kết quả so với hạn. Thứ tự xếp chồng và màu cố định; bảng màu đã kiểm định
 * (dataviz validate_palette: đạt cả với người mù màu khi đặt cạnh nhau theo thứ tự này).
 */
const GROUPS = [
  { key: 'doneOnTime', label: 'Hoàn thành đúng hạn', color: '#0ca30c' },
  { key: 'inProgressOnTime', label: 'Đang thực hiện trong hạn', color: '#5b8def' },
  { key: 'doneLate', label: 'Hoàn thành quá hạn', color: '#c98306' },
  { key: 'inProgressLate', label: 'Đang thực hiện quá hạn', color: '#d03b3b' },
] as const;

type Preset = 'month' | 'lastMonth' | 'quarter' | 'year' | 'custom';
const quarterStart = (d: Dayjs) => d.month(Math.floor(d.month() / 3) * 3).startOf('month');

function presetRange(p: Exclude<Preset, 'custom'>): [Dayjs, Dayjs] {
  const now = dayjs();
  switch (p) {
    case 'month':
      return [now.startOf('month'), now.endOf('month')];
    case 'lastMonth':
      return [now.subtract(1, 'month').startOf('month'), now.subtract(1, 'month').endOf('month')];
    case 'quarter':
      return [quarterStart(now), quarterStart(now).add(2, 'month').endOf('month')];
    case 'year':
      return [now.startOf('year'), now.endOf('year')];
  }
}

const rate = (r: number | null) => (r === null ? '—' : `${r.toLocaleString('vi-VN')}%`);

/** Thanh xếp chồng 4 nhóm; di chuột xem số liệu. Khoảng trắng 2px giữa các đoạn. */
function StackBar({ c, max }: { c: ReportCounts; max: number }) {
  if (!c.total) return <div className="stack-bar" />;
  return (
    <div className="stack-bar" style={{ width: `${(c.total / max) * 100}%` }}>
      {GROUPS.filter((g) => c[g.key]).map((g) => (
        <Tooltip key={g.key} title={`${g.label}: ${c[g.key]}`}>
          <span style={{ flexGrow: c[g.key], background: g.color }} />
        </Tooltip>
      ))}
    </div>
  );
}

const Legend = () => (
  <div className="chart-legend">
    {GROUPS.map((g) => (
      <span key={g.key}>
        <i style={{ background: g.color }} />
        {g.label}
      </span>
    ))}
  </div>
);

/** Cột số liệu 4 nhóm; thanh xếp chồng so sánh giữa các dòng (dài nhất = dòng nhiều việc nhất). */
function countColumns<T extends ReportCounts>(max: number) {
  return [
    { title: 'Tổng', dataIndex: 'total', width: 64, align: 'right' as const },
    ...GROUPS.map((g) => ({ title: g.label, dataIndex: g.key, width: 104, align: 'right' as const })),
    {
      title: 'Tỷ lệ đúng hạn',
      dataIndex: 'onTimeRate',
      width: 96,
      align: 'right' as const,
      render: (r: number | null) => <b>{rate(r)}</b>,
    },
    { title: '', width: 160, render: (_: unknown, row: T) => <StackBar c={row} max={max} /> },
  ];
}

export function ReportsPage() {
  const { me } = useAuth();
  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState<[Dayjs, Dayjs]>(presetRange('month'));
  const [from, to] = preset === 'custom' ? custom : presetRange(preset);
  const params = { from: from.startOf('day').toISOString(), to: to.endOf('day').toISOString() };
  const { data, isLoading } = useQuery({
    queryKey: ['report', params],
    queryFn: () => api.get<Report>(`/dashboard/report${toQuery(params)}`),
  });
  const periodLabel = `${from.format('DD/MM/YYYY')} – ${to.format('DD/MM/YYYY')}`;
  const maxMonth = Math.max(1, ...(data?.byMonth.map((m) => m.total) ?? [1]));

  const exportExcel = async () => {
    // Lấy lại số liệu kèm export=1 để máy chủ ghi nhật ký lượt xuất.
    const data = await api.get<Report>(`/dashboard/report${toQuery({ ...params, export: '1' })}`);
    const counts = (c: ReportCounts) => [c.total, ...GROUPS.map((g) => c[g.key]), c.onTimeRate ?? ''];
    const head = ['Tổng', ...GROUPS.map((g) => g.label), 'Tỷ lệ đúng hạn (%)'];
    const w = [10, 16, 16, 16, 16, 14];
    await downloadXlsx(`thong-ke-${from.format('YYYYMMDD')}-${to.format('YYYYMMDD')}.xlsx`, [
      {
        name: 'Tổng hợp',
        data: [
          [{ value: `Kết quả thực hiện nhiệm vụ, kỳ ${periodLabel}`, fontWeight: 'bold' }],
          [`Phạm vi: ${me?.role === 'LEADER' ? 'toàn trường' : 'đơn vị'}; nhiệm vụ có hạn trong kỳ, không tính việc đã hủy`],
          [],
          headerRow(head),
          counts(data.totals),
        ],
        widths: w,
      },
      {
        name: 'Theo đơn vị',
        data: [headerRow(['Đơn vị chủ trì', ...head]), ...data.byUnit.map((u) => [u.name, ...counts(u)])],
        widths: [30, ...w],
      },
      {
        name: 'Theo cá nhân',
        data: [
          headerRow(['Họ tên', 'Đơn vị', ...head, 'Đang thực hiện (hiện tại)']),
          ...data.byPerson.map((p) => [p.fullName, p.unitName, ...counts(p), p.active]),
        ],
        widths: [26, 26, ...w, 14],
      },
      {
        name: 'Theo tháng',
        data: [headerRow(['Tháng', ...head]), ...data.byMonth.map((m) => [dayjs(m.month).format('MM/YYYY'), ...counts(m)])],
        widths: [12, ...w],
      },
    ]);
  };

  return (
    <>
      <PageHeader
        title="Thống kê"
        subtitle={`Kết quả thực hiện nhiệm vụ có hạn trong kỳ ${periodLabel}`}
        actions={
          <Button icon={<Download size={16} />} onClick={() => void exportExcel()} disabled={!data}>
            <span className="hide-xs">Xuất Excel</span>
          </Button>
        }
      />
      <div className="shell-content">
        <div className="filter-row">
          <div className="scroll-x">
          <Segmented<Preset>
            value={preset}
            onChange={setPreset}
            options={[
              { value: 'month', label: 'Tháng này' },
              { value: 'lastMonth', label: 'Tháng trước' },
              { value: 'quarter', label: 'Quý này' },
              { value: 'year', label: 'Năm nay' },
              { value: 'custom', label: 'Tùy chọn' },
            ]}
          />
          </div>
          {preset === 'custom' && (
            <DatePicker.RangePicker
              format="DD/MM/YYYY"
              value={custom}
              allowClear={false}
              onChange={(v) => v?.[0] && v[1] && setCustom([v[0], v[1]])}
            />
          )}
        </div>

        {isLoading || !data ? (
          <Panel>
            <Skeleton active />
          </Panel>
        ) : !data.totals.total ? (
          <Panel>
            <Empty description="Không có nhiệm vụ nào có hạn trong kỳ này" />
          </Panel>
        ) : (
          <>
            <div className="stat-grid">
              <div className="report-tile">
                <span>Tỷ lệ đúng hạn</span>
                <b>{rate(data.totals.onTimeRate)}</b>
                <small>trên {data.totals.doneOnTime + data.totals.doneLate + data.totals.inProgressLate} việc đã đến hạn</small>
              </div>
              <div className="report-tile">
                <span>Tổng nhiệm vụ</span>
                <b>{data.totals.total}</b>
              </div>
              {GROUPS.map((g) => (
                <div key={g.key} className="report-tile">
                  <span>
                    <i className="dot" style={{ background: g.color }} />
                    {g.label}
                  </span>
                  <b>{data.totals[g.key]}</b>
                </div>
              ))}
            </div>

            {data.byMonth.length > 1 && (
              <Panel title="Theo tháng" style={{ marginTop: 20 }}>
                <Legend />
                <div className="month-bars">
                  {data.byMonth.map((m) => (
                    <div key={m.month} className="month-row">
                      <span className="month-label">{dayjs(m.month).format('MM/YYYY')}</span>
                      <StackBar c={m} max={maxMonth} />
                      <span className="month-value">
                        {m.total} việc · {rate(m.onTimeRate)}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            <Panel title="Theo đơn vị chủ trì" flush style={{ marginTop: 20 }}>
              <div className="panel-legend">
                <Legend />
              </div>
              <Table
                rowKey="unitId"
                size="small"
                pagination={false}
                dataSource={data.byUnit}
                scroll={{ x: 900 }}
                columns={[
                  { title: 'Đơn vị', dataIndex: 'name', fixed: 'left' as const, width: 200 },
                  ...countColumns(Math.max(...data.byUnit.map((u) => u.total))),
                ]}
              />
            </Panel>

            <Panel title="Theo cá nhân chủ trì" flush style={{ marginTop: 20 }}>
              <Table
                rowKey="userId"
                size="small"
                pagination={data.byPerson.length > 20 ? { pageSize: 20 } : false}
                dataSource={data.byPerson}
                scroll={{ x: 990 }}
                columns={[
                  {
                    title: 'Họ tên',
                    fixed: 'left' as const,
                    width: 220,
                    render: (_, p) => (
                      <>
                        {p.fullName}
                        <div className="muted">{p.unitName}</div>
                      </>
                    ),
                  },
                  ...countColumns(Math.max(...data.byPerson.map((p) => p.total))),
                  {
                    title: 'Đang làm',
                    dataIndex: 'active',
                    width: 90,
                    align: 'right' as const,
                    render: (n: number) => <Tooltip title="Số nhiệm vụ chủ trì đang thực hiện hiện tại (khối lượng)">{n}</Tooltip>,
                  },
                ]}
              />
            </Panel>
            <p className="muted" style={{ marginTop: 12 }}>
              Tính các nhiệm vụ có hạn trong kỳ, không tính việc đã hủy. Tỷ lệ đúng hạn = hoàn thành đúng hạn / (hoàn thành
              + đang thực hiện quá hạn). Việc giao cho cá nhân tính cho cả đơn vị của người đó.
            </p>
          </>
        )}
      </div>
    </>
  );
}
