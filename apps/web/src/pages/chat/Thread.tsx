import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Popconfirm, Spin } from 'antd';
import dayjs from 'dayjs';
import { ArrowLeft, BellOff, Info, SendHorizontal, Undo2, Users } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { ChatMessage, ConversationDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/Avatar';
import { InfoDrawer } from './InfoDrawer';
import { useChatEvents, type ChatStreamEvent } from './stream';

const PAGE = 30;
const RECALL_MS = 24 * 3600 * 1000;

const dayLabel = (d: dayjs.Dayjs) =>
  d.isSame(dayjs(), 'day') ? 'Hôm nay' : d.isSame(dayjs().subtract(1, 'day'), 'day') ? 'Hôm qua' : d.format('dddd, DD/MM/YYYY');

/** Khung tin nhắn của một cuộc trò chuyện. Tin lưu ở state (cũ → mới); tin mới đến qua luồng sự kiện. */
export function Thread({ id }: { id: number }) {
  const { me } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const keepOffset = useRef<number | null>(null);

  const detail = useQuery({
    queryKey: ['chat-conversation', id],
    queryFn: () => api.get<ConversationDetail>(`/chat/conversations/${id}`),
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    stickToBottom.current = true;
    api
      .get<{ items: ChatMessage[]; hasMore: boolean }>(`/chat/conversations/${id}/messages?limit=${PAGE}`)
      .then((r) => {
        if (cancelled) return;
        setMessages([...r.items].reverse());
        setHasMore(r.hasMore);
      })
      .catch((e: Error) => !cancelled && message.error(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, message]);

  const loadOlder = async () => {
    if (!messages.length || loadingOlder) return;
    setLoadingOlder(true);
    const el = scroller.current!;
    keepOffset.current = el.scrollHeight - el.scrollTop;
    try {
      const r = await api.get<{ items: ChatMessage[]; hasMore: boolean }>(
        `/chat/conversations/${id}/messages?limit=${PAGE}&before=${messages[0].id}`,
      );
      setMessages((m) => [...[...r.items].reverse(), ...m]);
      setHasMore(r.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Giữ vị trí cuộn: thêm tin cũ ở trên thì không nhảy; đang ở cuối thì theo tin mới.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepOffset.current !== null) {
      el.scrollTop = el.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const onEvent = useCallback(
    (e: ChatStreamEvent) => {
      if (e.type === 'message' && e.data.conversationId === id) {
        setMessages((m) => (m.some((x) => x.id === e.data.id) ? m : [...m, e.data]));
      }
      if (e.type === 'message_deleted' && e.data.conversationId === id) {
        setMessages((m) =>
          m.map((x) => (x.id === e.data.id ? { ...x, body: '', deletedAt: new Date().toISOString() } : x)),
        );
      }
    },
    [id],
  );
  useChatEvents(onEvent);

  // Đánh dấu đã đọc khi đang xem tin mới nhất của người khác.
  const lastOther = [...messages].reverse().find((m) => m.kind === 'TEXT' && m.sender?.id !== me?.id);
  const myRow = detail.data?.members.find((m) => m.id === me?.id);
  useEffect(() => {
    if (!lastOther || document.visibilityState !== 'visible') return;
    if (myRow && myRow.lastReadMessageId >= lastOther.id) return;
    void api.post(`/chat/conversations/${id}/read`, { messageId: lastOther.id }).then(() => {
      void qc.invalidateQueries({ queryKey: ['chat-unread'] });
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    });
  }, [id, lastOther?.id, myRow?.lastReadMessageId, qc]);

  const send = useMutation({
    mutationFn: (body: string) => api.post<ChatMessage>(`/chat/conversations/${id}/messages`, { body }),
    onSuccess: (m) => {
      stickToBottom.current = true;
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      setDraft('');
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const submit = () => {
    const body = draft.trim();
    if (body && !send.isPending) send.mutate(body);
  };

  const recall = useMutation({
    mutationFn: (messageId: number) => api.del(`/chat/messages/${messageId}`),
    onError: (e: Error) => message.error(e.message),
  });

  const conv = detail.data;
  const isGroup = conv && conv.type !== 'DIRECT';
  const peerRead = conv?.type === 'DIRECT' ? (conv.members.find((m) => m.id !== me?.id)?.lastReadMessageId ?? 0) : 0;
  const myLast = [...messages].reverse().find((m) => m.sender?.id === me?.id && !m.deletedAt);

  if (detail.isError) {
    return (
      <div className="chat-placeholder">
        <div>Không tìm thấy cuộc trò chuyện, hoặc đồng chí không còn trong nhóm.</div>
        <Link to="/chat">Quay lại danh sách</Link>
      </div>
    );
  }

  return (
    <div className="chat-thread">
      <div className="chat-thread-head">
        <Link to="/chat" className="icon-btn chat-back" aria-label="Quay lại danh sách">
          <ArrowLeft size={20} />
        </Link>
        {conv ? (
          <button type="button" className="chat-thread-title" onClick={() => setInfoOpen(true)}>
            {conv.type === 'DIRECT' ? (
              <Avatar name={conv.name} url={conv.peer?.avatarUrl} id={conv.peer?.id} size={36} />
            ) : (
              <span className="chat-group-icon">
                <Users size={18} />
              </span>
            )}
            <span style={{ minWidth: 0, textAlign: 'left' }}>
              <span className="chat-name">
                {conv.name} {conv.muted && <BellOff size={13} className="muted-icon" />}
              </span>
              <span className="chat-sub">
                {conv.type === 'DIRECT'
                  ? [conv.peer?.position, conv.peer?.unit.name].filter(Boolean).join(' · ')
                  : `${conv.memberCount} thành viên${conv.type === 'UNIT' ? ' · nhóm đơn vị' : ''}`}
              </span>
            </span>
          </button>
        ) : (
          <Spin size="small" />
        )}
        <button type="button" className="icon-btn" onClick={() => setInfoOpen(true)} aria-label="Thông tin">
          <Info size={19} />
        </button>
      </div>

      <div
        className="chat-messages"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (el.scrollTop < 40 && hasMore && !loadingOlder) void loadOlder();
        }}
      >
        {loading && <Spin style={{ margin: '40px auto', display: 'block' }} />}
        {hasMore && !loading && (
          <div style={{ textAlign: 'center' }}>
            <Button size="small" type="text" loading={loadingOlder} onClick={loadOlder}>
              Xem tin cũ hơn
            </Button>
          </div>
        )}
        {!loading && !messages.length && <div className="chat-empty">Chưa có tin nhắn. Hãy gửi lời chào!</div>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const day = dayjs(m.createdAt);
          const newDay = !prev || !dayjs(prev.createdAt).isSame(day, 'day');
          const separator = newDay && <div className="chat-day">{dayLabel(day)}</div>;
          if (m.kind === 'SYSTEM') {
            return (
              <div key={m.id}>
                {separator}
                <div className="chat-system">{m.body}</div>
              </div>
            );
          }
          const mine = m.sender?.id === me?.id;
          const grouped = !newDay && prev?.kind === 'TEXT' && prev.sender?.id === m.sender?.id;
          const canRecall = mine && !m.deletedAt && Date.now() - day.valueOf() < RECALL_MS;
          return (
            <div key={m.id}>
              {separator}
              <div className={`chat-row${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}`}>
                {!mine && isGroup && (
                  <span className="chat-row-avatar">
                    {!grouped && m.sender && <Avatar name={m.sender.fullName} url={m.sender.avatarUrl} id={m.sender.id} size={30} />}
                  </span>
                )}
                <div className="chat-bubble-wrap">
                  {!mine && isGroup && !grouped && <div className="chat-sender">{m.sender?.fullName}</div>}
                  <div className={m.deletedAt ? 'chat-bubble recalled' : 'chat-bubble'}>
                    {m.deletedAt ? 'Tin nhắn đã được thu hồi' : m.body}
                    <span className="chat-time">{day.format('HH:mm')}</span>
                  </div>
                  {canRecall && (
                    <Popconfirm
                      title="Thu hồi tin nhắn này?"
                      description="Mọi người sẽ không xem được nội dung nữa."
                      okText="Thu hồi"
                      cancelText="Không"
                      onConfirm={() => recall.mutate(m.id)}
                    >
                      <button type="button" className="chat-recall" aria-label="Thu hồi">
                        <Undo2 size={14} />
                      </button>
                    </Popconfirm>
                  )}
                  {mine && myLast?.id === m.id && peerRead >= m.id && <div className="chat-seen">Đã xem</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="chat-compose">
        <Input.TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Nhập tin nhắn…"
          title="Enter để gửi, Shift + Enter để xuống dòng"
          autoSize={{ minRows: 1, maxRows: 6 }}
          maxLength={4000}
          aria-label="Nội dung tin nhắn"
        />
        <Button
          type="primary"
          icon={<SendHorizontal size={17} />}
          onClick={submit}
          loading={send.isPending}
          disabled={!draft.trim()}
          aria-label="Gửi"
        />
      </div>

      {conv && <InfoDrawer conv={conv} open={infoOpen} onClose={() => setInfoOpen(false)} />}
    </div>
  );
}
