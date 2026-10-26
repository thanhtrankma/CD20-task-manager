import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../generated/prisma/client';
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, ROLES } from '../../common/decorators';
import type { AuthRequest } from '../../common/types';
import { SESSION_COOKIE, SessionService } from './session.service';

/**
 * Guard toàn cục: mặc định mọi route đều phải đăng nhập (trừ @Public),
 * kiểm tra vai trò (@Roles) và chặn tài khoản chưa đổi mật khẩu lần đầu.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const user = await this.sessions.resolve(req.cookies?.[SESSION_COOKIE]);
    if (!user) throw new UnauthorizedException('Chưa đăng nhập hoặc phiên đã hết hạn');
    req.user = user;

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets)
    ) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Cần đổi mật khẩu trước khi sử dụng',
      });
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException('Không có quyền thực hiện chức năng này');
    }
    return true;
  }
}
