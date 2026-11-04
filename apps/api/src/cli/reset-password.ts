/**
 * Đặt lại mật khẩu một tài khoản từ dòng lệnh, khi không còn tài khoản quản trị nào đăng nhập được
 * (quên mật khẩu quản trị, mất điện thoại xác thực hai lớp của quản trị).
 *   Dev:        npm run reset-password -- <tên đăng nhập> [--reset-2fa]
 *   Production: docker compose exec api node dist/cli/reset-password.js <tên đăng nhập> [--reset-2fa]
 * In mật khẩu tạm ra màn hình (một lần); người dùng phải đổi ở lần đăng nhập sau. Mọi phiên bị thu hồi, ghi nhật ký.
 */
import '../env';
import { generateTemporaryPassword, hashPassword } from '../common/password';
import { createPrismaClient } from '../prisma/prisma.service';

const prisma = createPrismaClient();

async function main() {
  const username = process.argv.slice(2).find((a) => !a.startsWith('--'))?.toLowerCase();
  if (!username) throw new Error('Cách dùng: reset-password <tên đăng nhập> [--reset-2fa]');
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error(`Không có tài khoản "${username}"`);

  const resetTwoFactor = process.argv.includes('--reset-2fa');
  const temporaryPassword = generateTemporaryPassword();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
        ...(resetTwoFactor ? { totpEnabled: false, totpSecret: null } : {}),
      },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CLI_RESET_PASSWORD',
        entity: 'User',
        entityId: String(user.id),
        detail: { resetTwoFactor },
      },
    }),
  ]);
  console.log(`✔ Đã đặt lại mật khẩu "${username}"${resetTwoFactor ? ', tắt xác thực hai lớp' : ''}.`);
  console.log(`  Mật khẩu tạm (phải đổi ở lần đăng nhập sau): ${temporaryPassword}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
