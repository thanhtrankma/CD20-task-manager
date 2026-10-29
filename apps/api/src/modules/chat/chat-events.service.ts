import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../common/types';
import { env } from '../../env';
import { SessionService } from '../auth/session.service';

export type ChatEvent = 'message' | 'message_deleted' | 'conversation' | 'read';

interface Stream {
  res: Response;
  sessionId: string;
  openedAt: number;
}

const PING_MS = 25_000;
const MAX_STREAMS_PER_USER = 5;

/**
 * Luồng sự kiện trò chuyện (Server-Sent Events) giữ trong bộ nhớ tiến trình API (chạy một tiến trình).
 * Đăng xuất, khóa tài khoản, đổi vai trò: đóng luồng ngay; mỗi phút kiểm tra lại phiên hết hạn.
 */
@Injectable()
export class ChatEventsService implements OnModuleDestroy {
  private readonly streams = new Map<number, Set<Stream>>();
  private readonly ping = setInterval(() => this.broadcastRaw(': ping\n\n'), PING_MS);
  private readonly check = setInterval(() => void this.checkSessions(), env.chatSessionCheckMs);

  constructor(private readonly sessions: SessionService) {
    this.ping.unref();
    this.check.unref();
    sessions.onRevoked(({ sessionId, userId, exceptSessionId }) => {
      if (sessionId) this.closeSession(sessionId);
      if (userId) this.streams.get(userId)?.forEach((s) => s.sessionId !== exceptSessionId && s.res.end());
    });
  }

  open(user: AuthUser, req: Request, res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');

    const set = this.streams.get(user.id) ?? new Set<Stream>();
    // Quá nhiều tab, máy cùng mở: đóng luồng cũ nhất.
    if (set.size >= MAX_STREAMS_PER_USER) {
      const oldest = [...set].sort((a, b) => a.openedAt - b.openedAt)[0];
      oldest.res.end();
      set.delete(oldest);
    }
    const stream: Stream = { res, sessionId: user.sessionId, openedAt: Date.now() };
    set.add(stream);
    this.streams.set(user.id, set);

    req.on('close', () => {
      set.delete(stream);
      if (!set.size) this.streams.delete(user.id);
    });
  }

  emit(userIds: Iterable<number>, event: ChatEvent, data: unknown) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const id of new Set(userIds)) this.streams.get(id)?.forEach((s) => s.res.write(frame));
  }

  /** Đóng mọi luồng của một phiên (đăng xuất). */
  closeSession(sessionId: string) {
    for (const set of this.streams.values()) {
      for (const s of set) if (s.sessionId === sessionId) s.res.end();
    }
  }

  onModuleDestroy() {
    clearInterval(this.ping);
    clearInterval(this.check);
    for (const set of this.streams.values()) set.forEach((s) => s.res.end());
  }

  private broadcastRaw(frame: string) {
    for (const set of this.streams.values()) set.forEach((s) => s.res.write(frame));
  }

  private async checkSessions() {
    const ids = new Set<string>();
    for (const set of this.streams.values()) set.forEach((s) => ids.add(s.sessionId));
    const dead = new Set<string>();
    for (const id of ids) if (!(await this.sessions.isAlive(id))) dead.add(id);
    for (const id of dead) this.closeSession(id);
  }
}
