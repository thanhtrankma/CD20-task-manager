import { useQuery } from '@tanstack/react-query';
import { Button, Dropdown, Input, Spin } from 'antd';
import dayjs from 'dayjs';
import { BellOff, Building2, MessageSquarePlus, Search, ShieldAlert, User, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { ConversationItem } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/Avatar';
import { PageHeader } from '../../layouts/shell';
import { NewChatModal, type NewChatKind } from './NewChat';
import { Thread } from './Thread';

const shortTime = (iso: string) => {
  const d = dayjs(iso);
  if (d.isSame(dayjs(), 'day')) return d.format('HH:mm');
  if (d.isAfter(dayjs().subtract(6, 'day'), 'day')) return d.format('dd');
  return d.format('DD/MM');
};

const lastName = (fullName: string) => fullName.trim().split(/\s+/).at(-1);

function preview(c: ConversationItem, meId?: number) {
  const m = c.lastMessage;
  if (!m) return 'Chưa có tin nhắn';
  if (m.kind === 'SYSTEM') return <i>{m.body}</i>;
  const who = m.sender?.id === meId ? 'Tôi: ' : c.type !== 'DIRECT' && m.sender ? `${lastName(m.sender.fullName)}: ` : '';
  return m.deletedAt ? <i>{who}Tin nhắn đã được thu hồi</i> : `${who}${m.body}`;
}

function ConversationIcon({ c }: { c: ConversationItem }) {
  if (c.type === 'DIRECT') return <Avatar name={c.name} url={c.peer?.avatarUrl} id={c.peer?.id} size={42} />;
  return (
    <span className={c.type === 'UNIT' ? 'chat-group-icon unit' : 'chat-group-icon'} style={{ width: 42, height: 42 }}>
      {c.type === 'UNIT' ? <Building2 size={19} /> : <Users size={19} />}
    </span>
  );
}

export function ChatPage() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const id = Number(useParams().id) || null;
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState<NewChatKind | null>(null);

  const list = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: () => api.get<ConversationItem[]>('/chat/conversations'),
  });
  const shown = (list.data ?? []).filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const canUnitGroup = me?.role === 'LEADER' || me?.role === 'UNIT_HEAD';

  const newMenu = {
    items: [
      { key: 'direct', icon: <User size={15} />, label: 'Nhắn riêng' },
      { key: 'group', icon: <Users size={15} />, label: 'Tạo nhóm' },
      ...(canUnitGroup ? [{ key: 'unit', icon: <Building2 size={15} />, label: 'Nhóm theo đơn vị' }] : []),
    ],
    onClick: ({ key }: { key: string }) => setCreating(key as NewChatKind),
  };

  return (
    <>
      <PageHeader
        title="Trò chuyện"
        subtitle="Nhắn riêng, nhóm tự tạo, nhóm theo đơn vị"
        actions={
          <Dropdown menu={newMenu} trigger={['click']}>
            <Button type="primary" icon={<MessageSquarePlus size={16} />}>
              Mới
            </Button>
          </Dropdown>
        }
      />
      <div className="shell-content">
        <div className="chat-notice">
          <ShieldAlert size={15} />
          <span>Không trao đổi thông tin thuộc bí mật nhà nước qua trò chuyện.</span>
        </div>
        <div className={id ? 'chat-layout has-thread' : 'chat-layout'}>
          <aside className="chat-list">
            <div className="chat-list-search">
              <Input
                allowClear
                prefix={<Search size={15} />}
                placeholder="Tìm cuộc trò chuyện"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            {list.isLoading && <Spin style={{ margin: 32, display: 'block' }} />}
            {list.data && !list.data.length && (
              <div className="chat-empty">
                Chưa có cuộc trò chuyện nào.
                <br />
                Bấm <b>Mới</b> để nhắn riêng hoặc tạo nhóm.
              </div>
            )}
            {shown.map((c) => (
              <Link key={c.id} to={`/chat/${c.id}`} className={c.id === id ? 'chat-item active' : 'chat-item'}>
                <ConversationIcon c={c} />
                <div className="chat-item-main">
                  <div className="chat-item-top">
                    <span className={c.unread ? 'chat-name unread' : 'chat-name'}>{c.name}</span>
                    <span className="chat-item-time">{c.lastMessageAt && shortTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="chat-item-bottom">
                    <span className={c.unread ? 'chat-preview unread' : 'chat-preview'}>{preview(c, me?.id)}</span>
                    {c.muted && <BellOff size={13} className="muted-icon" />}
                    {!!c.unread && <span className={c.muted ? 'chat-count muted' : 'chat-count'}>{c.unread > 99 ? '99+' : c.unread}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </aside>
          <section className="chat-main">
            {id ? (
              <Thread key={id} id={id} />
            ) : (
              <div className="chat-placeholder">
                <MessageSquarePlus size={40} strokeWidth={1.4} />
                <div>Chọn một cuộc trò chuyện hoặc bắt đầu cuộc mới</div>
              </div>
            )}
          </section>
        </div>
      </div>
      <NewChatModal
        kind={creating}
        onClose={() => setCreating(null)}
        onCreated={(c) => {
          setCreating(null);
          navigate(`/chat/${c.id}`);
        }}
      />
    </>
  );
}
