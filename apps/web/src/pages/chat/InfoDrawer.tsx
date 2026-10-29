import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Form, Input, Popconfirm, Switch, Tag } from 'antd';
import { LogOut, UserMinus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { ConversationDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/Avatar';
import { PersonSelect } from './NewChat';

/** Thông tin cuộc trò chuyện: thành viên, đổi tên, thêm bớt người, tắt thông báo, rời nhóm. */
export function InfoDrawer({ conv, open, onClose }: { conv: ConversationDetail; open: boolean; onClose: () => void }) {
  const { me } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [adding, setAdding] = useState<number[]>([]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['chat-conversation', conv.id] });
    void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    void qc.invalidateQueries({ queryKey: ['chat-unread'] });
  };
  const onError = (e: Error) => message.error(e.message);

  const update = useMutation({
    mutationFn: (body: { name?: string; includeSubunits?: boolean }) => api.patch(`/chat/conversations/${conv.id}`, body),
    onSuccess: () => {
      refresh();
      message.success('Đã cập nhật');
    },
    onError,
  });
  const mute = useMutation({
    mutationFn: (muted: boolean) => api.post(`/chat/conversations/${conv.id}/mute`, { muted }),
    onSuccess: refresh,
    onError,
  });
  const add = useMutation({
    mutationFn: (userIds: number[]) => api.post(`/chat/conversations/${conv.id}/members`, { userIds }),
    onSuccess: () => {
      setAdding([]);
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (userId: number) => api.del(`/chat/conversations/${conv.id}/members/${userId}`),
    onSuccess: (_, userId) => {
      refresh();
      if (userId === me?.id) {
        onClose();
        navigate('/chat');
      }
    },
    onError,
  });

  return (
    <Drawer open={open} onClose={onClose} title={conv.type === 'DIRECT' ? 'Thông tin' : 'Thông tin nhóm'} size={380}>
      <div className="chat-info">
        {conv.canManage && (
          <Form
            layout="vertical"
            key={conv.name}
            initialValues={{ name: conv.name }}
            onFinish={(v: { name: string }) => update.mutate({ name: v.name.trim() })}
          >
            <Form.Item name="name" label="Tên nhóm" rules={[{ required: true, whitespace: true, message: 'Nhập tên nhóm' }]}>
              <Input
                maxLength={100}
                suffix={
                  <Button size="small" type="link" htmlType="submit" loading={update.isPending}>
                    Lưu
                  </Button>
                }
              />
            </Form.Item>
          </Form>
        )}

        <label className="chat-switch">
          <span>Tắt thông báo cuộc trò chuyện này</span>
          <Switch checked={conv.muted} loading={mute.isPending} onChange={(v) => mute.mutate(v)} />
        </label>
        {conv.type === 'UNIT' && (
          <label className="chat-switch">
            <span>Gồm cả cán bộ đơn vị trực thuộc</span>
            <Switch
              checked={conv.includeSubunits}
              disabled={!conv.canManage}
              loading={update.isPending}
              onChange={(v) => update.mutate({ includeSubunits: v })}
            />
          </label>
        )}
        {conv.type === 'UNIT' && (
          <p className="chat-hint">Thành viên tự cập nhật theo đơn vị của tài khoản: chuyển đơn vị là tự vào, ra nhóm.</p>
        )}

        {conv.canAddMembers && (
          <div className="chat-add">
            <PersonSelect multiple value={adding} onChange={(v) => setAdding(v as number[])} exclude={conv.members.map((m) => m.id)} />
            <Button
              icon={<UserPlus size={15} />}
              disabled={!adding.length}
              loading={add.isPending}
              onClick={() => add.mutate(adding)}
            >
              Thêm
            </Button>
          </div>
        )}

        <div className="chat-members-title">{conv.members.length} thành viên</div>
        <div className="chat-members">
          {conv.members.map((m) => (
            <div key={m.id} className="chat-member">
              <Avatar name={m.fullName} url={m.avatarUrl} id={m.id} size={34} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="person-name">
                  {m.fullName} {m.id === me?.id && <span className="person-meta">(tôi)</span>}
                </div>
                <div className="person-meta">{[m.rank, m.position, m.unit.name].filter(Boolean).join(' · ')}</div>
              </div>
              {conv.type === 'GROUP' && m.role === 'OWNER' && <Tag color="blue">Quản lý</Tag>}
              {conv.type === 'GROUP' && conv.canManage && m.id !== me?.id && (
                <Popconfirm
                  title={`Mời ${m.fullName} ra khỏi nhóm?`}
                  okText="Đồng ý"
                  cancelText="Không"
                  onConfirm={() => remove.mutate(m.id)}
                >
                  <button type="button" className="icon-btn" aria-label={`Bớt ${m.fullName}`}>
                    <UserMinus size={16} />
                  </button>
                </Popconfirm>
              )}
            </div>
          ))}
        </div>

        {conv.canLeave && (
          <Popconfirm
            title="Rời nhóm này?"
            description="Đồng chí sẽ không xem được tin nhắn của nhóm nữa."
            okText="Rời nhóm"
            cancelText="Không"
            onConfirm={() => me && remove.mutate(me.id)}
          >
            <Button danger block icon={<LogOut size={15} />} style={{ marginTop: 16 }}>
              Rời nhóm
            </Button>
          </Popconfirm>
        )}
      </div>
    </Drawer>
  );
}
