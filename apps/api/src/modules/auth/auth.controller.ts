import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AllowPendingPassword, CurrentUser, Public, SkipAudit } from '../../common/decorators';
import { requestMeta } from '../../common/origin-check';
import type { AuthUser } from '../../common/types';
import { env } from '../../env';
import { ChangePasswordDto, DisableOtpDto, LoginDto, OtpCodeDto } from './auth.dto';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @SkipAudit()
  @Throttle({ default: { limit: env.loginRateLimit, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.login(dto, requestMeta(req));
    res.cookie(SESSION_COOKIE, token, this.sessions.cookieOptions());
    return user;
  }

  @AllowPendingPassword()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.sessions.destroy(user.sessionId);
    res.clearCookie(SESSION_COOKIE, this.sessions.cookieOptions());
  }

  @AllowPendingPassword()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @AllowPendingPassword()
  @Post('change-password')
  @HttpCode(204)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }

  @Post('2fa/setup')
  setupOtp(@CurrentUser() user: AuthUser) {
    return this.auth.setupOtp(user);
  }

  @Post('2fa/enable')
  @HttpCode(204)
  enableOtp(@CurrentUser() user: AuthUser, @Body() dto: OtpCodeDto) {
    return this.auth.enableOtp(user, dto.code);
  }

  @Post('2fa/disable')
  @HttpCode(204)
  disableOtp(@CurrentUser() user: AuthUser, @Body() dto: DisableOtpDto) {
    return this.auth.disableOtp(user, dto);
  }
}
