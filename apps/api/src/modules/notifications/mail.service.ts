import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { env } from '../../env';
import { PrismaService } from '../../prisma/prisma.service';
import type { DeliveryMessage } from './notifications.service';

/** Thư nhắc việc. Nội dung chỉ là lời nhắc chung kèm đường dẫn, không chứa thông tin nhiệm vụ. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;

  constructor(private readonly prisma: PrismaService) {
    this.transport = env.smtp.host
      ? createTransport({
          host: env.smtp.host,
          port: env.smtp.port,
          secure: env.smtp.secure,
          auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
        })
      : null;
    if (!this.transport) this.logger.warn('Chưa cấu hình SMTP_HOST: tắt thư nhắc việc');
  }

  get enabled() {
    return this.transport !== null;
  }

  async sendToUsers(userIds: number[], message: DeliveryMessage) {
    if (!this.transport || !userIds.length) return;
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true, email: { not: null } },
      select: { email: true, fullName: true },
    });
    const url = `${env.appOrigin}${message.link ?? '/'}`;

    for (const user of users) {
      try {
        await this.transport.sendMail({
          from: env.smtp.from,
          to: user.email!,
          subject: `[Nhắc việc] ${message.title}`,
          text:
            `Kính gửi đồng chí ${user.fullName},\n\n` +
            `${message.title}.\n` +
            `Đồng chí đăng nhập hệ thống để xem chi tiết: ${url}\n\n` +
            `Đây là thư tự động, đề nghị không trả lời thư này.`,
        });
      } catch (err) {
        this.logger.warn(`Gửi thư nhắc việc thất bại: ${(err as Error).message}`);
      }
    }
  }
}
