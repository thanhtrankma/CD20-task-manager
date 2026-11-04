import { BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';

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

/** Mật khẩu tạm 12 ký tự, bỏ các ký tự dễ nhầm (0/O, 1/l/I), luôn có chữ và số. */
export function generateTemporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
  while (chars.length < 12) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
