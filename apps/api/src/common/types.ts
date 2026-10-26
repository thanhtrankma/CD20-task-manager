import type { Role } from '../generated/prisma/client';
import type { Request } from 'express';

/** Người dùng đã đăng nhập, gắn vào request bởi AuthGuard. */
export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  unitId: number;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  sessionId: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
