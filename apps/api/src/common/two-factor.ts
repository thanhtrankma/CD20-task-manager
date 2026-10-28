import { env } from '../env';

/** Vai trò bắt buộc dùng xác thực hai lớp (không được tắt). */
export const twoFactorMandatory = (role: string) => env.require2faRoles.includes(role);

/** Vai trò này bắt buộc bật xác thực hai lớp nhưng tài khoản chưa bật. */
export const twoFactorMissing = (u: { role: string; totpEnabled: boolean }) =>
  twoFactorMandatory(u.role) && !u.totpEnabled;
