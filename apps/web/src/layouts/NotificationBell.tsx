import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Popover } from 'antd';
import dayjs from 'dayjs';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Notification } from '../api/types';
import { ItemList, ItemRow } from '../components/ItemList';
import { DATETIME_FORMAT } from '../constants';

export function NotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const { data: items } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notification[]>('/notifications'),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const open = async (n: Notification) => {
    await api.post(`/notifications/${n.id}/read`);
    await refresh();
    if (n.link) navigate(n.link);
  };
  const readAll = async () => {
    await api.post('/notifications/read-all');
    await refresh();
  };

  const content = (
    <div style={{ width: 'min(340px, calc(100vw - 48px))' }}>
      <ItemList
        items={items ?? []}
        rowKey={(n) => n.id}
        emptyText="Không có thông báo"
        maxHeight={400}
        renderItem={(n) => (
          <ItemRow
            onClick={() => open(n)}
            muted={!!n.readAt}
            title={n.title}
            description={
              <>
                {n.body && <div>{n.body}</div>}
                {dayjs(n.createdAt).format(DATETIME_FORMAT)}
              </>
            }
          />
        )}
      />
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Thông báo</span>
          {!!unread?.count && (
            <button
              type="button"
              onClick={readAll}
              style={{ border: 0, background: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 12, fontWeight: 600, display: 'inline-flex', gap: 4, alignItems: 'center' }}
            >
              <CheckCheck size={14} /> Đánh dấu đã đọc
            </button>
          )}
        </div>
      }
    >
      <button type="button" className="icon-btn" aria-label="Thông báo">
        <Badge count={unread?.count ?? 0} size="small" offset={[2, -2]}>
          <Bell size={18} color="currentColor" />
        </Badge>
      </button>
    </Popover>
  );
}
