import { useQuery } from '@tanstack/react-query';
import { App, Button, DatePicker, Empty, Result, Skeleton, Tooltip } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { AlarmClock, ArrowLeft, CalendarCheck2, CalendarOff, CircleHelp, Download, LogOut as LeaveEarly, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { AttendanceDay, PersonAttendance } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Stat } from '../../components/Stat';
import { DAY_PART, DAY_STATUS, WEEKDAY } from '../../constants';
import { PageHeader, Panel } from '../../layouts/shell';
import { downloadXlsx, headerRow } from '../../utils/excel';
import { fmtDays } from '../../utils/leave';

export const monthRange = (m: Dayjs) => ({ from: m.startOf('month').format('YYYY-MM-DD'), to: m.endOf('month').format('YYYY-MM-DD') });

/** Mô tả một ngày công (dùng cho ô lịch, bảng công, tệp Excel). */
export function dayText(d: AttendanceDay) {
  const parts = [DAY_STATUS[d.status].label];
  if (d.holiday) parts[0] = d.holiday;
  if (d.leave && d.status !== 'LEAVE') parts.push(`nghỉ ${DAY_PART[d.leave.part].toLowerCase()} (${d.leave.type})`);
  if (d.status === 'LEAVE' && d.leave) parts[0] = `Nghỉ: ${d.leave.type}`;
  if (d.late) parts.push(`muộn ${d.late} phút`);
  if (d.early) parts.push(`sớm ${d.early} phút`);
  return parts.join(', ');
}

/** Lịch tháng: mỗi ô một ngày, tô màu theo trạng thái, giờ vào – ra; di chuột xem mọi lượt chấm. */
function MonthGrid({ days }: { days: AttendanceDay[] }) {
  const lead = days.length ? days[0].weekday - 1 : 0;
  return (
    <div className="att-cal">
      {WEEKDAY.slice(1).map((w) => (
        <div key={w} className="att-cal-head">
          {w}
        </div>
      ))}
      {Array.from({ length: lead }, (_, i) => (
        <div key={`e${i}`} />
      ))}
      {days.map((d) => {
        const tone = DAY_STATUS[d.status];
        const isToday = d.day === dayjs().format('YYYY-MM-DD');
        return (
          <Tooltip
            key={d.day}
            title={
              <>
                <div>{dayText(d)}</div>
                {d.punches.length > 0 && <div>Lượt chấm: {d.punches.join(', ')}</div>}
              </>
            }
          >
            <div className={isToday ? 'att-cal-day today' : 'att-cal-day'} style={{ background: tone.bg }}>
              <div className="att-cal-num">{Number(d.day.slice(8))}</div>
              {d.status !== 'PENDING' && d.status !== 'WEEKEND' && (
                <div className="att-cal-status" style={{ color: tone.fg }}>
                  {d.status === 'HOLIDAY' ? d.holiday : d.status === 'LEAVE' ? 'Nghỉ phép' : tone.label}
                </div>
              )}
              {(d.in || d.out) && (
                <div className="att-cal-time">
                  {d.in ?? '--:--'} – {d.out ?? '--:--'}
                </div>
              )}
              {d.leave && d.status !== 'LEAVE' && <div className="att-cal-time">Nghỉ {DAY_PART[d.leave.part].toLowerCase()}</div>}
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Lịch sử chấm công của mình (hoặc của một cán bộ trong phạm vi xem: /attendance/users/:id). */
export function MyAttendancePage() {
  const { message } = App.useApp();
  const { me } = useAuth();
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const userId = params.id ? Number(params.id) : undefined;
  const month = search.get('month') ? dayjs(`${search.get('month')}-01`) : dayjs();
  const [exporting, setExporting] = useState(false);
  const range = monthRange(month);
  const path = userId && userId !== me?.id ? `/attendance/users/${userId}` : '/attendance/me';
  const { data, isLoading, error } = useQuery({
    queryKey: ['attendance', path, range],
    queryFn: () => api.get<PersonAttendance>(`${path}?from=${range.from}&to=${range.to}`),
  });
  const s = data?.summary;

  const exportExcel = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await downloadXlsx(`cham-cong-${data.user.fullName}-${month.format('YYYY-MM')}.xlsx`, [
        {
          name: 'Chấm công',
          widths: [12, 6, 10, 10, 40, 30],
          data: [
            headerRow(['Ngày', 'Thứ', 'Giờ vào', 'Giờ ra', 'Tình trạng', 'Các lượt chấm']),
            ...data.days.map((d) => [
              { value: dayjs(d.day).format('DD/MM/YYYY') },
              { value: WEEKDAY[d.weekday] },
              { value: d.in ?? '' },
              { value: d.out ?? '' },
              { value: d.status === 'PENDING' ? '' : dayText(d) },
              { value: d.punches.join(', ') },
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

  if (error) return <Result status="404" title={error.message} extra={<Link to="/attendance">Về chấm công của tôi</Link>} />;
  const other = !!userId && userId !== me?.id;

  return (
    <>
      <PageHeader
        title={other ? `Chấm công: ${data?.user.fullName ?? ''}` : 'Chấm công của tôi'}
        subtitle={
          other ? (
            <Link to="/attendance/unit" className="muted">
              <ArrowLeft size={13} style={{ verticalAlign: -2 }} /> Bảng công đơn vị
            </Link>
          ) : data ? (
            `Mã chấm công: ${data.user.attendanceCode ?? 'chưa ghép'} · Ca ${data.shift.name} ${data.shift.startTime}–${data.shift.endTime}`
          ) : undefined
        }
        actions={
          <>
            <DatePicker
              picker="month"
              format="MM/YYYY"
              allowClear={false}
              value={month}
              onChange={(m) => setSearch(m ? { month: m.format('YYYY-MM') } : {})}
              disabledDate={(d) => d.isAfter(dayjs(), 'month')}
            />
            <Button icon={<Download size={15} />} loading={exporting} onClick={exportExcel} disabled={!data}>
              <span className="hide-xs">Xuất Excel</span>
            </Button>
          </>
        }
      />
      <div className="shell-content">
        {data && !data.user.attendanceCode && (
          <Panel>
            <Empty
              description="Tài khoản chưa được ghép mã chấm công. Liên hệ cán bộ phụ trách nhân sự để ghép mã trên máy chấm công."
            />
          </Panel>
        )}
        <div className="stat-grid">
          <Stat label="Ngày công" value={s && `${fmtDays(s.work)}/${s.scheduled}`} icon={CalendarCheck2} tone="tone-green" />
          <Stat label="Đi muộn" value={s && `${s.lateCount} lần · ${s.lateMinutes}′`} icon={AlarmClock} tone="tone-amber" />
          <Stat label="Về sớm" value={s && `${s.earlyCount} lần · ${s.earlyMinutes}′`} icon={LeaveEarly} tone="tone-amber" />
          <Stat label="Thiếu lượt chấm" value={s?.missing} icon={CircleHelp} tone="tone-indigo" />
          <Stat label="Vắng" value={s?.absent} icon={UserX} tone="tone-rose" />
          <Stat label="Nghỉ phép" value={s && fmtDays(s.leave)} icon={CalendarOff} tone="tone-blue" />
        </div>
        <Panel title={`Tháng ${month.format('MM/YYYY')}`}>
          {isLoading || !data ? <Skeleton active /> : <MonthGrid days={data.days} />}
          <div className="att-legend">
            {(['OK', 'LATE', 'EARLY', 'MISSING', 'ABSENT', 'LEAVE', 'HOLIDAY'] as const).map((k) => (
              <span key={k}>
                <i style={{ background: DAY_STATUS[k].bg, borderColor: DAY_STATUS[k].fg }} />
                {DAY_STATUS[k].label}
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
