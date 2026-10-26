import { BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });

export const verifyPassword = (hash: string, password: string) =>
  argon2.verify(hash, password).catch(() => false);

let dummyHash: Promise<string> | undefined;
/** Băm giả để thời gian phản hồi như nhau khi tài khoản không tồn tại. */
export const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing'));

export function assertStrongPassword(password: string) {
  if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw new BadRequestException('Mật khẩu phải có ít nhất 10 ký tự, gồm cả chữ và số');
  }
}
