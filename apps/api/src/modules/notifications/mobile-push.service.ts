import { Injectable, Logger } from '@nestjs/common';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect } from 'node:http2';
import { env } from '../../env';
import { PrismaService } from '../../prisma/prisma.service';
import type { DeliveryMessage } from './notifications.service';

/** Tối đa số điện thoại nhận thông báo của một người (thêm máy mới thì bỏ máy lâu không dùng nhất). */
export const MAX_DEVICES_PER_USER = 10;
const TIMEOUT_MS = 10_000;
const TITLE = 'Giao nhiệm vụ';

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64url');
const jwt = (header: object, claims: object, signer: (data: Buffer) => Buffer) => {
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  return `${data}.${b64url(signer(Buffer.from(data)))}`;
};

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

type Device = { id: number; userId: number; platform: 'ANDROID' | 'IOS'; provider: 'FCM' | 'APNS'; token: string };
/** Kết quả gửi: gone = thiết bị đã gỡ ứng dụng / mã không còn hiệu lực → xóa. */
type Result = 'ok' | 'gone' | 'error';

/**
 * Thông báo đẩy về ứng dụng di động. Nội dung gửi qua máy chủ Google, Apple chỉ có câu nhắc chung và đường dẫn,
 * KHÔNG có tên, nội dung nhiệm vụ.
 */
@Injectable()
export class MobilePushService {
  private readonly logger = new Logger(MobilePushService.name);
  private readonly fcm?: { account: ServiceAccount; key: KeyObject };
  private readonly apnsKey?: KeyObject;
  private fcmToken?: { value: string; expiresAt: number };
  private apnsJwt?: { value: string; issuedAt: number };

  constructor(private readonly prisma: PrismaService) {
    try {
      if (env.fcm.serviceAccountFile) {
        const account = JSON.parse(readFileSync(env.fcm.serviceAccountFile, 'utf8')) as ServiceAccount;
        this.fcm = { account, key: createPrivateKey(account.private_key) };
      }
      if (env.apns.keyFile && env.apns.keyId && env.apns.teamId) {
        this.apnsKey = createPrivateKey(readFileSync(env.apns.keyFile, 'utf8'));
      }
    } catch (err) {
      this.logger.error(`Cấu hình thông báo đẩy ứng dụng không hợp lệ: ${(err as Error).message}`);
    }
    if (!this.enabled) this.logger.warn('Chưa cấu hình FCM/APNs: tắt thông báo đẩy về ứng dụng di động');
  }

  get enabled() {
    return Boolean(this.fcm || this.apnsKey);
  }

  async sendToUsers(userIds: number[], message: DeliveryMessage) {
    if (!this.enabled || !userIds.length) return;
    const devices = await this.prisma.device.findMany({
      where: { userId: { in: userIds }, user: { isActive: true } },
      select: { id: true, userId: true, platform: true, provider: true, token: true },
    });
    if (!devices.length) return;

    // Số trên biểu tượng ứng dụng (iOS) = số thông báo chưa đọc.
    const unread = new Map(
      (
        await this.prisma.notification.groupBy({
          by: ['userId'],
          where: { userId: { in: [...new Set(devices.map((d) => d.userId))] }, readAt: null },
          _count: true,
        })
      ).map((r) => [r.userId, r._count]),
    );

    const results = await Promise.all(
      devices.map(async (d) => {
        const badge = unread.get(d.userId) ?? 0;
        const r = d.provider === 'FCM' ? await this.sendFcm(d, message, badge) : await this.sendApns(d, message, badge);
        return [d, r] as const;
      }),
    );
    const gone = results.filter(([, r]) => r === 'gone').map(([d]) => d.id);
    const ok = results.filter(([, r]) => r === 'ok').map(([d]) => d.id);
    if (gone.length) await this.prisma.device.deleteMany({ where: { id: { in: gone } } });
    if (ok.length) await this.prisma.device.updateMany({ where: { id: { in: ok } }, data: { lastSeenAt: new Date() } });
  }

  // ---------- FCM (HTTP v1) ----------

  private async fcmAccessToken() {
    if (this.fcmToken && this.fcmToken.expiresAt > Date.now() + 60_000) return this.fcmToken.value;
    const { account, key } = this.fcm!;
    const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt(
      { alg: 'RS256', typ: 'JWT' },
      {
        iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      },
      (data) => sign('RSA-SHA256', data, key),
    );
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Không lấy được mã truy cập FCM: ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.fcmToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return this.fcmToken.value;
  }

  private async sendFcm(d: Device, m: DeliveryMessage, badge: number): Promise<Result> {
    if (!this.fcm) return 'error';
    try {
      const link = m.link ?? '/';
      const res = await fetch(`${env.fcm.baseUrl}/v1/projects/${this.fcm.account.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.fcmAccessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: d.token,
            notification: { title: TITLE, body: m.title },
            data: { link },
            android: { priority: 'HIGH', notification: { channel_id: 'nhac_viec', tag: link } },
            apns: { payload: { aps: { badge, sound: 'default', 'thread-id': link } } },
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return 'ok';
      const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: { errorCode?: string }[] } };
      const code = err.error?.details?.find((x) => x.errorCode)?.errorCode ?? err.error?.status;
      if (res.status === 404 || code === 'UNREGISTERED' || (res.status === 400 && code === 'INVALID_ARGUMENT')) return 'gone';
      if (res.status === 401) this.fcmToken = undefined;
      this.logger.warn(`Gửi FCM thất bại (thiết bị ${d.id}): ${res.status} ${code ?? ''}`);
      return 'error';
    } catch (e) {
      this.logger.warn(`Gửi FCM thất bại (thiết bị ${d.id}): ${(e as Error).message}`);
      return 'error';
    }
  }

  // ---------- APNs (HTTP/2, xác thực bằng khóa .p8) ----------

  private apnsToken() {
    // Apple yêu cầu làm mới JWT sau 20–60 phút.
    if (this.apnsJwt && Date.now() - this.apnsJwt.issuedAt < 40 * 60_000) return this.apnsJwt.value;
    const value = jwt(
      { alg: 'ES256', kid: env.apns.keyId },
      { iss: env.apns.teamId, iat: Math.floor(Date.now() / 1000) },
      (data) => sign('sha256', data, { key: this.apnsKey!, dsaEncoding: 'ieee-p1363' }),
    );
    this.apnsJwt = { value, issuedAt: Date.now() };
    return value;
  }

  private sendApns(d: Device, m: DeliveryMessage, badge: number): Promise<Result> {
    if (!this.apnsKey) return Promise.resolve('error');
    const link = m.link ?? '/';
    const payload = JSON.stringify({
      aps: { alert: { title: TITLE, body: m.title }, badge, sound: 'default', 'thread-id': link },
      link,
    });
    return new Promise((resolve) => {
      const client = connect(`https://${env.apns.host}`);
      const done = (r: Result, why?: string) => {
        if (why) this.logger.warn(`Gửi APNs thất bại (thiết bị ${d.id}): ${why}`);
        client.close();
        resolve(r);
      };
      client.on('error', (e) => done('error', e.message));
      client.setTimeout(TIMEOUT_MS, () => done('error', 'quá thời gian'));
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${d.token}`,
        authorization: `bearer ${this.apnsToken()}`,
        'apns-topic': env.apns.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 86_400),
      });
      let status = 0;
      let body = '';
      req.on('response', (h) => (status = Number(h[':status'])));
      req.on('data', (c: Buffer) => (body += c));
      req.on('end', () => {
        if (status === 200) return done('ok');
        const reason = (() => {
          try {
            return (JSON.parse(body) as { reason?: string }).reason;
          } catch {
            return undefined;
          }
        })();
        if (status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') return done('gone');
        done('error', `${status} ${reason ?? ''}`);
      });
      req.on('error', (e) => done('error', e.message));
      req.end(payload);
    });
  }
}
