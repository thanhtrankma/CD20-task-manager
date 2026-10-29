import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { avatarUrl } from '../../common/avatar-url';
import type { AuthUser } from '../../common/types';
import { Prisma, type Conversation, type ConversationMember } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UnitsService } from '../units/units.service';
import { ChatEventsService } from './chat-events.service';
import {
  CreateGroupDto,
  CreateUnitGroupDto,
  DirectoryQuery,
  ListMessagesQuery,
  UpdateConversationDto,
} from './chat.dto';

const BRIEF = {
  id: true,
  fullName: true,
  rank: true,
  position: true,
  avatarFile: true,
  unit: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;
type BriefRow = Prisma.UserGetPayload<{ select: typeof BRIEF }>;

const MESSAGE_INCLUDE = { sender: { select: { id: true, fullName: true, avatarFile: true } } } satisfies Prisma.MessageInclude;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

/** Thành viên trò chuyện: tài khoản đang hoạt động, không phải quản trị. */
const CHAT_USER = { isActive: true, role: { not: 'ADMIN' } } satisfies Prisma.UserWhereInput;
const MAX_GROUP_MEMBERS = 200;
const RECALL_WINDOW_MS = 24 * 3600 * 1000;
const PUSH_GAP_MS = 2 * 60 * 1000;
const PUSH_TEXT = 'Đồng chí có tin nhắn mới';

const brief = ({ avatarFile, ...u }: BriefRow) => ({ ...u, avatarUrl: avatarUrl({ id: u.id, avatarFile }) });

export const toMessage = (m: MessageRow) => ({
  id: m.id,
  conversationId: m.conversationId,
  kind: m.kind,
  body: m.deletedAt ? '' : m.body,
  sender: m.sender
    ? { id: m.sender.id, fullName: m.sender.fullName, avatarUrl: avatarUrl(m.sender) }
    : null,
  createdAt: m.createdAt,
  deletedAt: m.deletedAt,
});

@Injectable()
export class ChatService {
  /** Lần gửi thông báo đẩy gần nhất theo "người:cuộc trò chuyện", để không đẩy dồn dập. */
  private readonly lastPush = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly units: UnitsService,
    private readonly events: ChatEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- Danh bạ ----------

  async directory(user: AuthUser, query: DirectoryQuery) {
    const rows = await this.prisma.user.findMany({
      where: {
        ...CHAT_USER,
        id: { not: user.id },
        unitId: query.unitId,
        fullName: query.q ? { contains: query.q.trim(), mode: 'insensitive' } : undefined,
      },
      select: BRIEF,
      orderBy: { fullName: 'asc' },
      take: 50,
    });
    return rows.map(brief);
  }

  // ---------- Quyền ----------

  /** Đơn vị tính là thành viên của nhóm theo đơn vị. */
  private async unitScope(c: Pick<Conversation, 'unitId' | 'includeSubunits'>) {
    if (!c.unitId) return [];
    return c.includeSubunits ? this.units.descendantIds(c.unitId) : [c.unitId];
  }

  private async visibleWhere(user: AuthUser): Promise<Prisma.ConversationWhereInput> {
    const ancestors = await this.units.ancestorIds(user.unitId);
    return {
      OR: [
        { type: { in: ['DIRECT', 'GROUP'] }, members: { some: { userId: user.id } } },
        { type: 'UNIT', unitId: user.unitId },
        { type: 'UNIT', includeSubunits: true, unitId: { in: ancestors } },
      ],
    };
  }

  /** Cuộc trò chuyện người dùng đang tham gia; không tham gia thì báo không tìm thấy (không lộ là có). */
  private async findVisible(user: AuthUser, id: number) {
    const conv = await this.prisma.conversation.findFirst({ where: { AND: [{ id }, await this.visibleWhere(user)] } });
    if (!conv) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    return conv;
  }

  private async memberRow(conversationId: number, userId: number) {
    return this.prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
  }

  private async canManage(user: AuthUser, conv: Conversation, row?: ConversationMember | null) {
    if (conv.type === 'GROUP') return (row ?? (await this.memberRow(conv.id, user.id)))?.role === 'OWNER';
    if (conv.type === 'UNIT') return this.canManageUnit(user, conv.unitId!) || conv.createdById === user.id;
    return false;
  }

  /** Ban Giám hiệu: mọi đơn vị; chỉ huy đơn vị: đơn vị mình và trực thuộc. */
  private async canManageUnit(user: AuthUser, unitId: number) {
    if (user.role === 'LEADER') return true;
    if (user.role === 'UNIT_HEAD') return (await this.units.descendantIds(user.unitId)).includes(unitId);
    return false;
  }

  /** Mã người nhận sự kiện, thông báo của một cuộc trò chuyện. */
  private async memberIds(conv: Conversation): Promise<number[]> {
    if (conv.type !== 'UNIT') {
      const rows = await this.prisma.conversationMember.findMany({
        where: { conversationId: conv.id, user: CHAT_USER },
        select: { userId: true },
      });
      return rows.map((r) => r.userId);
    }
    const users = await this.prisma.user.findMany({
      where: { ...CHAT_USER, unitId: { in: await this.unitScope(conv) } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  // ---------- Danh sách, chi tiết ----------

  async list(user: AuthUser) {
    const convs = await this.prisma.conversation.findMany({
      where: await this.visibleWhere(user),
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
    });
    return this.toItems(user, convs);
  }

  async unreadTotal(user: AuthUser) {
    const convs = await this.prisma.conversation.findMany({ where: await this.visibleWhere(user), select: { id: true } });
    const unread = await this.unreadCounts(user, convs.map((c) => c.id));
    const muted = new Set(
      (
        await this.prisma.conversationMember.findMany({
          where: { userId: user.id, muted: true, conversationId: { in: convs.map((c) => c.id) } },
          select: { conversationId: true },
        })
      ).map((r) => r.conversationId),
    );
    let count = 0;
    for (const [id, n] of unread) if (!muted.has(id)) count += n;
    return { count };
  }

  async detail(user: AuthUser, id: number) {
    const conv = await this.findVisible(user, id);
    const [item] = await this.toItems(user, [conv]);
    const rows = await this.prisma.conversationMember.findMany({ where: { conversationId: id } });
    const byUser = new Map(rows.map((r) => [r.userId, r]));
    const people =
      conv.type === 'UNIT'
        ? await this.prisma.user.findMany({
            where: { ...CHAT_USER, unitId: { in: await this.unitScope(conv) } },
            select: BRIEF,
            orderBy: { fullName: 'asc' },
          })
        : await this.prisma.user.findMany({
            where: { id: { in: rows.map((r) => r.userId) } },
            select: BRIEF,
            orderBy: { fullName: 'asc' },
          });
    const mine = byUser.get(user.id);
    const manage = await this.canManage(user, conv, mine);
    return {
      ...item,
      members: people.map((p) => ({
        ...brief(p),
        role: byUser.get(p.id)?.role ?? 'MEMBER',
        lastReadMessageId: byUser.get(p.id)?.lastReadMessageId ?? 0,
      })),
      canManage: manage,
      canAddMembers: conv.type === 'GROUP' && manage,
      canLeave: conv.type === 'GROUP',
    };
  }

  private async unreadCounts(user: AuthUser, ids: number[]) {
    if (!ids.length) return new Map<number, number>();
    const rows = await this.prisma.$queryRaw<{ conversation_id: number; n: number }[]>`
      select m.conversation_id, count(*)::int as n
      from messages m
      left join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = ${user.id}
      where m.conversation_id = any(${ids}::int[])
        and m.id > coalesce(cm.last_read_message_id, 0)
        and m.kind = 'TEXT' and m.deleted_at is null and m.sender_id <> ${user.id}
      group by m.conversation_id`;
    return new Map(rows.map((r) => [r.conversation_id, r.n]));
  }

  private async toItems(user: AuthUser, convs: Conversation[]) {
    const ids = convs.map((c) => c.id);
    if (!ids.length) return [];
    const lastIds = await this.prisma.$queryRaw<{ id: number }[]>`
      select distinct on (conversation_id) id from messages
      where conversation_id = any(${ids}::int[]) order by conversation_id, id desc`;
    const [lastMessages, unread, mine, directPeers, memberCounts] = await Promise.all([
      this.prisma.message.findMany({ where: { id: { in: lastIds.map((r) => r.id) } }, include: MESSAGE_INCLUDE }),
      this.unreadCounts(user, ids),
      this.prisma.conversationMember.findMany({ where: { userId: user.id, conversationId: { in: ids } } }),
      this.prisma.conversationMember.findMany({
        where: { conversationId: { in: convs.filter((c) => c.type === 'DIRECT').map((c) => c.id) }, userId: { not: user.id } },
        include: { user: { select: BRIEF } },
      }),
      this.prisma.conversationMember.groupBy({
        by: ['conversationId'],
        where: { conversationId: { in: ids }, user: CHAT_USER },
        _count: true,
      }),
    ]);
    const lastBy = new Map(lastMessages.map((m) => [m.conversationId, m]));
    const mineBy = new Map(mine.map((r) => [r.conversationId, r]));
    const peerBy = new Map(directPeers.map((r) => [r.conversationId, r.user]));
    const countBy = new Map(memberCounts.map((r) => [r.conversationId, r._count]));

    return Promise.all(
      convs.map(async (c) => {
        const peer = peerBy.get(c.id);
        const last = lastBy.get(c.id);
        const memberCount =
          c.type === 'UNIT'
            ? await this.prisma.user.count({ where: { ...CHAT_USER, unitId: { in: await this.unitScope(c) } } })
            : (countBy.get(c.id) ?? 0);
        return {
          id: c.id,
          type: c.type,
          name: c.type === 'DIRECT' ? (peer?.fullName ?? 'Cán bộ') : (c.name ?? ''),
          unitId: c.unitId,
          includeSubunits: c.includeSubunits,
          memberCount,
          peer: peer ? brief(peer) : null,
          lastMessage: last ? toMessage(last) : null,
          unread: unread.get(c.id) ?? 0,
          muted: mineBy.get(c.id)?.muted ?? false,
          lastMessageAt: c.lastMessageAt,
          createdAt: c.createdAt,
        };
      }),
    );
  }

  // ---------- Tạo ----------

  /** Kiểm tra danh sách người được thêm: tồn tại, đang hoạt động, không phải quản trị. */
  private async validUsers(ids: number[], except: number) {
    const unique = [...new Set(ids)].filter((id) => id !== except);
    const found = await this.prisma.user.findMany({ where: { ...CHAT_USER, id: { in: unique } }, select: { id: true, fullName: true } });
    if (found.length !== unique.length) throw new BadRequestException('Có người không tồn tại hoặc không tham gia trò chuyện được');
    return found;
  }

  async openDirect(user: AuthUser, userId: number) {
    if (userId === user.id) throw new BadRequestException('Không thể nhắn cho chính mình');
    await this.validUsers([userId], user.id);
    const directKey = [user.id, userId].sort((a, b) => a - b).join(':');
    let conv = await this.prisma.conversation.findUnique({ where: { directKey } });
    if (!conv) {
      try {
        conv = await this.prisma.conversation.create({
          data: {
            type: 'DIRECT',
            directKey,
            createdById: user.id,
            members: { create: [{ userId: user.id }, { userId }] },
          },
        });
      } catch (err) {
        // Hai người cùng mở cùng lúc
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
        conv = await this.prisma.conversation.findUniqueOrThrow({ where: { directKey } });
      }
    }
    return (await this.toItems(user, [conv]))[0];
  }

  async createGroup(user: AuthUser, dto: CreateGroupDto) {
    const others = await this.validUsers(dto.memberIds, user.id);
    if (!others.length) throw new BadRequestException('Nhóm cần ít nhất một người khác');
    const conv = await this.prisma.conversation.create({
      data: {
        type: 'GROUP',
        name: dto.name,
        createdById: user.id,
        members: {
          create: [{ userId: user.id, role: 'OWNER' }, ...others.map((o) => ({ userId: o.id }))],
        },
      },
    });
    await this.system(conv, `${user.fullName} đã tạo nhóm`);
    this.events.emit([user.id, ...others.map((o) => o.id)], 'conversation', { id: conv.id });
    return (await this.toItems(user, [conv]))[0];
  }

  async createUnitGroup(user: AuthUser, dto: CreateUnitGroupDto) {
    const unit = await this.prisma.unit.findUnique({ where: { id: dto.unitId } });
    if (!unit || !unit.isActive) throw new NotFoundException('Không tìm thấy đơn vị');
    if (!(await this.canManageUnit(user, unit.id))) {
      throw new ForbiddenException('Chỉ Ban Giám hiệu, chỉ huy đơn vị được tạo nhóm cho đơn vị này');
    }
    let conv: Conversation;
    try {
      conv = await this.prisma.conversation.create({
        data: {
          type: 'UNIT',
          name: unit.name,
          unitId: unit.id,
          includeSubunits: dto.includeSubunits ?? false,
          createdById: user.id,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Đơn vị này đã có nhóm');
      }
      throw err;
    }
    await this.system(conv, `${user.fullName} đã tạo nhóm đơn vị`);
    this.events.emit([user.id, ...(await this.memberIds(conv))], 'conversation', { id: conv.id });
    return (await this.toItems(user, [conv]))[0];
  }

  // ---------- Quản lý nhóm ----------

  async update(user: AuthUser, id: number, dto: UpdateConversationDto) {
    const conv = await this.findVisible(user, id);
    if (!(await this.canManage(user, conv))) throw new ForbiddenException('Không có quyền quản lý cuộc trò chuyện này');
    if (dto.includeSubunits !== undefined && conv.type !== 'UNIT') {
      throw new BadRequestException('Chỉ nhóm theo đơn vị mới chọn được đơn vị trực thuộc');
    }
    const before = await this.memberIds(conv);
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: { name: dto.name, includeSubunits: dto.includeSubunits },
    });
    if (dto.name && dto.name !== conv.name) await this.system(updated, `${user.fullName} đã đổi tên nhóm thành “${dto.name}”`);
    this.events.emit([...before, ...(await this.memberIds(updated))], 'conversation', { id });
    return (await this.toItems(user, [updated]))[0];
  }

  async addMembers(user: AuthUser, id: number, userIds: number[]) {
    const conv = await this.findVisible(user, id);
    if (conv.type !== 'GROUP') throw new BadRequestException('Chỉ thêm người vào nhóm tự tạo');
    if (!(await this.canManage(user, conv))) throw new ForbiddenException('Chỉ người quản lý nhóm được thêm người');
    const existing = new Set(
      (await this.prisma.conversationMember.findMany({ where: { conversationId: id }, select: { userId: true } })).map(
        (r) => r.userId,
      ),
    );
    const added = (await this.validUsers(userIds, user.id)).filter((u) => !existing.has(u.id));
    if (!added.length) return;
    if (existing.size + added.length > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(`Nhóm tối đa ${MAX_GROUP_MEMBERS} người`);
    }
    await this.prisma.conversationMember.createMany({ data: added.map((u) => ({ conversationId: id, userId: u.id })) });
    await this.system(conv, `${user.fullName} đã thêm ${added.map((u) => u.fullName).join(', ')}`);
    this.events.emit(await this.memberIds(conv), 'conversation', { id });
  }

  async removeMember(user: AuthUser, id: number, userId: number) {
    const conv = await this.findVisible(user, id);
    if (conv.type !== 'GROUP') throw new BadRequestException('Chỉ rời, bớt người ở nhóm tự tạo');
    const target = await this.memberRow(id, userId);
    if (!target) throw new NotFoundException('Người này không ở trong nhóm');
    const self = userId === user.id;
    if (!self && !(await this.canManage(user, conv))) throw new ForbiddenException('Chỉ người quản lý nhóm được bớt người');

    const before = await this.memberIds(conv);
    await this.prisma.conversationMember.delete({ where: { conversationId_userId: { conversationId: id, userId } } });
    const left = await this.prisma.conversationMember.findMany({ where: { conversationId: id }, orderBy: { joinedAt: 'asc' } });
    if (!left.length) {
      await this.prisma.conversation.delete({ where: { id } });
      this.events.emit(before, 'conversation', { id });
      return;
    }
    // Người quản lý cuối cùng rời nhóm: người vào nhóm sớm nhất nhận quyền quản lý.
    if (!left.some((r) => r.role === 'OWNER')) {
      await this.prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId: id, userId: left[0].userId } },
        data: { role: 'OWNER' },
      });
    }
    const name = self
      ? user.fullName
      : (await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } })).fullName;
    await this.system(conv, self ? `${name} đã rời nhóm` : `${user.fullName} đã mời ${name} ra khỏi nhóm`);
    this.events.emit(before, 'conversation', { id });
  }

  async mute(user: AuthUser, id: number, muted: boolean) {
    await this.findVisible(user, id);
    await this.prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      create: { conversationId: id, userId: user.id, muted },
      update: { muted },
    });
  }

  // ---------- Tin nhắn ----------

  async messages(user: AuthUser, id: number, query: ListMessagesQuery) {
    await this.findVisible(user, id);
    const limit = query.limit ?? 30;
    const rows = await this.prisma.message.findMany({
      where: { conversationId: id, id: query.before ? { lt: query.before } : undefined },
      include: MESSAGE_INCLUDE,
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    return { items: rows.slice(0, limit).map(toMessage), hasMore: rows.length > limit };
  }

  async send(user: AuthUser, id: number, body: string) {
    const conv = await this.findVisible(user, id);
    if (conv.type === 'DIRECT') {
      const peers = await this.memberIds(conv);
      if (!peers.some((p) => p !== user.id)) throw new ForbiddenException('Người nhận không còn sử dụng hệ thống');
    }
    const message = await this.prisma.message.create({
      data: { conversationId: id, senderId: user.id, body },
      include: MESSAGE_INCLUDE,
    });
    await Promise.all([
      this.prisma.conversation.update({ where: { id }, data: { lastMessageAt: message.createdAt } }),
      this.prisma.conversationMember.upsert({
        where: { conversationId_userId: { conversationId: id, userId: user.id } },
        create: { conversationId: id, userId: user.id, lastReadMessageId: message.id },
        update: { lastReadMessageId: message.id },
      }),
    ]);
    const out = toMessage(message);
    const members = await this.memberIds(conv);
    this.events.emit(members, 'message', out);
    void this.pushToRecipients(conv.id, members.filter((m) => m !== user.id));
    return out;
  }

  /** Thông báo đẩy câu chung, bỏ người đã tắt thông báo; mỗi người tối đa một lần mỗi 2 phút mỗi cuộc trò chuyện. */
  private async pushToRecipients(conversationId: number, userIds: number[]) {
    if (!userIds.length) return;
    const muted = new Set(
      (
        await this.prisma.conversationMember.findMany({
          where: { conversationId, muted: true, userId: { in: userIds } },
          select: { userId: true },
        })
      ).map((r) => r.userId),
    );
    const now = Date.now();
    const targets = userIds.filter((u) => {
      if (muted.has(u)) return false;
      const key = `${u}:${conversationId}`;
      if (now - (this.lastPush.get(key) ?? 0) < PUSH_GAP_MS) return false;
      this.lastPush.set(key, now);
      return true;
    });
    if (this.lastPush.size > 50_000) this.lastPush.clear();
    this.notifications.deliverPush(targets, { title: PUSH_TEXT, link: `/chat/${conversationId}` });
  }

  async markRead(user: AuthUser, id: number, messageId: number) {
    const conv = await this.findVisible(user, id);
    const message = await this.prisma.message.findFirst({ where: { id: messageId, conversationId: id }, select: { id: true } });
    if (!message) throw new NotFoundException('Không tìm thấy tin nhắn');
    const row = await this.memberRow(id, user.id);
    if (row && row.lastReadMessageId >= messageId) return;
    await this.prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      create: { conversationId: id, userId: user.id, lastReadMessageId: messageId },
      update: { lastReadMessageId: messageId },
    });
    // Nhóm đơn vị đông người: không phát "đã xem" cho cả đơn vị; chỉ báo các máy của chính mình (để cập nhật số chưa đọc).
    const to = conv.type === 'UNIT' ? [user.id] : await this.memberIds(conv);
    this.events.emit(to, 'read', { conversationId: id, userId: user.id, messageId });
  }

  async recall(user: AuthUser, messageId: number) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Không tìm thấy tin nhắn');
    const conv = await this.findVisible(user, message.conversationId);
    if (message.senderId !== user.id || message.kind !== 'TEXT') throw new ForbiddenException('Chỉ thu hồi được tin của mình');
    if (Date.now() - message.createdAt.getTime() > RECALL_WINDOW_MS) {
      throw new ForbiddenException('Chỉ thu hồi được tin trong 24 giờ');
    }
    if (message.deletedAt) return;
    await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date(), body: '' } });
    this.events.emit(await this.memberIds(conv), 'message_deleted', { conversationId: conv.id, id: messageId });
  }

  /** Dòng thông báo trong nhóm (tạo nhóm, thêm, bớt người...). */
  private async system(conv: Conversation, body: string) {
    const message = await this.prisma.message.create({
      data: { conversationId: conv.id, kind: 'SYSTEM', body },
      include: MESSAGE_INCLUDE,
    });
    await this.prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: message.createdAt } });
    this.events.emit(await this.memberIds(conv), 'message', toMessage(message));
  }
}
