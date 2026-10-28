import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '../generated/prisma/client';
import type { AuthRequest, AuthUser } from './types';

export const IS_PUBLIC = 'isPublic';
/** Không cần đăng nhập. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Chỉ các vai trò được liệt kê mới gọi được. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const ALLOW_PENDING_PASSWORD = 'allowPendingPassword';
/** Cho phép gọi khi tài khoản còn phải đổi mật khẩu (me, logout, change-password). */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

export const ALLOW_PENDING_2FA = 'allowPending2fa';
/** Cho phép gọi khi vai trò bắt buộc xác thực hai lớp nhưng chưa bật (me, logout, bật 2FA). */
export const AllowPendingTwoFactor = () => SetMetadata(ALLOW_PENDING_2FA, true);

export const SKIP_AUDIT = 'skipAudit';
/** Bỏ qua AuditInterceptor (route tự ghi nhật ký, ví dụ đăng nhập). */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT, true);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<AuthRequest>().user!,
);
