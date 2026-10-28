import { useQuery } from '@tanstack/react-query';
import { Progress, Skeleton } from 'antd';
import dayjs from 'dayjs';
import {
  AlarmClock,
  CheckCircle2,
  CircleDot,
  Hourglass,
  Inbox,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { DashboardSummary, Paged, TaskRow, TaskStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ItemList, ItemRow } from '../components/ItemList';
import { EnablePushBanner } from '../components/NotificationSettings';
import { OverduePill, StatusPill } from '../components/Pill';
import { DATE_FORMAT } from '../constants';
import { PageHeader, Panel } from '../layouts/shell';

const ACTIVE: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'RETURNED', 'PENDING_REVIEW'];

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  to,
}: {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  tone: string;
  to?: string;
}) {
  const body = (
    <>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className={`icon-tile ${tone}`}>
          <Icon size={20} />
        </span>
      </div>
      <span className="stat-value">{value ?? '–'}</span>
    </>
  );
  return to ? (
    <Link to={to} className="stat">
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
};

export function DashboardPage() {
  const { me } = useAuth();
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary'),
  });
  const upcoming = useQuery({
    queryKey: ['tasks', 'upcoming'],
    queryFn: () => api.get<Paged<TaskRow>>('/tasks?pageSize=30'),
  });
  const attention = (upcoming.data?.items ?? []).filter((t) => ACTIVE.includes(t.status)).slice(0, 6);
  const s = data?.byStatus;

  return (
    <>
      <PageHeader title="Tổng quan" subtitle={`${greeting()}, ${me?.fullName}. Hôm nay ${dayjs().format('dddd, DD/MM/YYYY')}.`} />
      <div className="shell-content">
        <EnablePushBanner />
        <div className="stat-grid">
          <Stat label="Mới giao" value={s?.NEW ?? 0} icon={Inbox} tone="tone-blue" to="/tasks?status=NEW" />
          <Stat label="Đang thực hiện" value={s?.IN_PROGRESS ?? 0} icon={CircleDot} tone="tone-indigo" to="/tasks?status=IN_PROGRESS" />
          <Stat label="Chờ duyệt" value={s?.PENDING_REVIEW ?? 0} icon={Hourglass} tone="tone-amber" to="/tasks?status=PENDING_REVIEW" />
          <Stat label="Hoàn thành" value={s?.DONE ?? 0} icon={CheckCircle2} tone="tone-green" to="/tasks?status=DONE" />
          <Stat label="Sắp đến hạn (3 ngày)" value={data?.dueSoon} icon={AlarmClock} tone="tone-amber" />
          <Stat label="Quá hạn" value={data?.overdue} icon={TriangleAlert} tone="tone-rose" />
        </div>

        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
          <Panel title="Việc cần chú ý" extra={<Link to="/tasks" className="muted">Xem tất cả →</Link>}>
            {upcoming.isLoading ? (
              <Skeleton active />
            ) : (
              <ItemList
                items={attention}
                rowKey={(t) => t.id}
                emptyText="Không có việc nào đang chờ xử lý"
                renderItem={(t) => (
                  <ItemRow
                    title={<Link to={`/tasks/${t.id}`} className="task-link">{t.title}</Link>}
                    description={`Hạn ${dayjs(t.dueDate).format(DATE_FORMAT)} · Giao bởi ${t.createdBy.fullName}`}
                    actions={
                      <>
                        {t.overdue && <OverduePill />}
                        <StatusPill status={t.status} />
                      </>
                    }
                  />
                )}
              />
            )}
          </Panel>

          {!!data?.byUnit.length && (
            <Panel title="Tình hình theo đơn vị">
              <ItemList
                items={data.byUnit}
                rowKey={(u) => u.unitId}
                renderItem={(u) => (
                  <ItemRow
                    title={u.name}
                    description={
                      <>
                        {u.done}/{u.total} việc hoàn thành
                        {u.overdue > 0 && <span style={{ color: '#e11d48', fontWeight: 600 }}> · {u.overdue} quá hạn</span>}
                        <Progress percent={Math.round((u.done / u.total) * 100)} size="small" strokeColor="#2563eb" />
                      </>
                    }
                  />
                )}
              />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
