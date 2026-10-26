import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Chống CSRF lớp thứ hai (lớp thứ nhất là cookie SameSite=Strict):
 * request ghi dữ liệu có header Origin thì Origin phải đúng địa chỉ của hệ thống.
 */
export function originCheck(allowedOrigin: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!SAFE_METHODS.has(req.method) && origin && origin !== allowedOrigin) {
      res.status(403).json({ statusCode: 403, message: 'Nguồn truy cập không hợp lệ' });
      return;
    }
    next();
  };
}

export const requestMeta = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get('user-agent')?.slice(0, 255),
});
