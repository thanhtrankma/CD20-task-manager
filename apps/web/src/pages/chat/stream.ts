import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../../api/client';
import type { ChatMessage } from '../../api/types';

export type ChatStreamEvent =
  | { type: 'message'; data: ChatMessage }
  | { type: 'message_deleted'; data: { conversationId: number; id: number } }
  | { type: 'conversation'; data: { id: number } }
  | { type: 'read'; data: { conversationId: number; userId: number; messageId: number } };

const listeners = new Set<(e: ChatStreamEvent) => void>();

/** Màn trò chuyện đang mở đăng ký nhận sự kiện để thêm tin mới vào khung tin nhắn. */
export function useChatEvents(handler: (e: ChatStreamEvent) => void) {
  useEffect(() => {
    listeners.add(handler);
    return () => void listeners.delete(handler);
  }, [handler]);
}

export const useChatUnread = (enabled: boolean) =>
  useQuery({
    queryKey: ['chat-unread'],
    queryFn: () => api.get<{ count: number }>('/chat/unread'),
    enabled,
    // Dự phòng khi luồng sự kiện bị chặn (proxy, mạng): vẫn cập nhật số chưa đọc mỗi phút.
    refetchInterval: 60_000,
  });

/**
 * Giữ một luồng Server-Sent Events cho cả ứng dụng khi đã đăng nhập (không dùng cho quản trị).
 * EventSource tự nối lại khi rớt mạng; máy chủ trả lỗi (hết phiên...) thì thử lại sau 15 giây.
 */
export function useChatStream(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const refreshLists = () => {
      void qc.invalidateQueries({ queryKey: ['chat-unread'] });
      void qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    };
    const dispatch = (type: ChatStreamEvent['type']) => (ev: MessageEvent<string>) => {
      const event = { type, data: JSON.parse(ev.data) } as ChatStreamEvent;
      listeners.forEach((l) => l(event));
      refreshLists();
      if (event.type === 'conversation') void qc.invalidateQueries({ queryKey: ['chat-conversation', event.data.id] });
      if (event.type === 'read') {
        void qc.invalidateQueries({ queryKey: ['chat-conversation', event.data.conversationId] });
      }
    };

    const connect = () => {
      source = new EventSource('/api/chat/stream');
      (['message', 'message_deleted', 'conversation', 'read'] as const).forEach((t) =>
        source!.addEventListener(t, dispatch(t) as EventListener),
      );
      // Nối lại sau khi rớt: có thể đã lỡ tin trong lúc mất kết nối.
      source.onopen = refreshLists;
      source.onerror = () => {
        if (source?.readyState === EventSource.CLOSED && !stopped) retry = setTimeout(connect, 15_000);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      source?.close();
    };
  }, [enabled, qc]);
}
