#!/usr/bin/env bash
# Chạy thử toàn bộ hệ thống trên máy cá nhân bằng một lệnh: CSDL + hộp thư giả (Docker), API, web.
#   infra/scripts/dev-local.sh            # API cổng 3100, web cổng 5173
#   API_PORT=3200 WEB_PORT=5180 infra/scripts/dev-local.sh
# Bấm Ctrl+C để dừng API và web (CSDL vẫn chạy; tắt bằng: docker compose -f infra/docker-compose.dev.yml stop).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API_PORT="${API_PORT:-3100}"
WEB_PORT="${WEB_PORT:-5173}"

# Node 24 (Homebrew) nếu máy có nhiều bản Node
[ -d /opt/homebrew/opt/node@24/bin ] && export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
node -v | grep -q '^v24\.' || { echo "Cần Node.js 24 (đang dùng $(node -v))"; exit 1; }

# Docker: máy dùng Colima thì khởi động nếu chưa chạy
if ! docker info >/dev/null 2>&1; then
  if command -v colima >/dev/null; then
    echo "→ Khởi động Colima (Docker)..."
    colima start
  else
    echo "Docker chưa chạy: mở Docker Desktop hoặc chạy 'colima start'"; exit 1
  fi
fi

[ -f "$ROOT/apps/api/.env" ] || { echo "Chưa có apps/api/.env: xem docs/chay-thu-tren-may.md, mục Cài đặt lần đầu"; exit 1; }

echo "→ CSDL, hộp thư giả (Mailpit)"
# Cổng CSDL lấy theo DATABASE_URL trong apps/api/.env
DB_PORT="$(grep '^DATABASE_URL=' "$ROOT/apps/api/.env" | sed -E 's#.*@[^:/]+:([0-9]+)/.*#\1#')"
DEV_DB_PORT="$DB_PORT" docker compose -f "$ROOT/infra/docker-compose.dev.yml" up -d

for p in "$API_PORT" "$WEB_PORT"; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Cổng $p đang bị chương trình khác dùng. Đổi cổng: API_PORT=... WEB_PORT=... $0"; exit 1
  fi
done

echo "→ Cập nhật cấu trúc CSDL"
(cd "$ROOT/apps/api" && npx prisma migrate deploy >/dev/null && npx prisma generate >/dev/null)

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "→ API: http://localhost:$API_PORT/api"
(cd "$ROOT/apps/api" && PORT="$API_PORT" APP_ORIGIN="http://localhost:$WEB_PORT" LOGIN_RATE_LIMIT=100 npm run dev) &

echo "→ Web: http://localhost:$WEB_PORT"
(cd "$ROOT/apps/web" && API_PORT="$API_PORT" npx vite --port "$WEB_PORT" --strictPort) &

sleep 8
cat <<EOF

========================================================
  Mở trình duyệt:  http://localhost:$WEB_PORT
  Hộp thư giả:     http://localhost:8025  (thư nhắc việc)
  Tài khoản mẫu:   lanhdao, truongkhoa, canbo, truongphongdt... (mật khẩu: DEMO_PASSWORD trong apps/api/.env)
  Dừng:            Ctrl+C
========================================================

EOF
wait
