import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tap } from 'rxjs';
import { AuditService } from '../modules/audit/audit.service';
import { SKIP_AUDIT } from './decorators';
import { requestMeta } from './origin-check';
import type { AuthRequest } from './types';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Ghi nhật ký mọi request ghi dữ liệu: ai, route nào, đối tượng nào, kết quả.
 * Không ghi body để tránh lưu mật khẩu, mã OTP hay nội dung công việc vào nhật ký.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!MUTATING.has(req.method) || skip) return next.handle();

    const id = req.params?.id ?? req.params?.taskId;
    const write = (result: string) =>
      void this.audit.log({
        userId: req.user?.id,
        action: `${req.method} ${req.route?.path ?? req.path}`,
        entity: ctx.getClass().name.replace(/Controller$/, ''),
        entityId: id === undefined ? undefined : String(id),
        ...requestMeta(req),
        detail: { result },
      });

    return next.handle().pipe(
      tap({
        next: () => write('ok'),
        error: (err: { status?: number }) => write(`error:${err?.status ?? 500}`),
      }),
    );
  }
}
