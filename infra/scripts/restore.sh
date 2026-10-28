#!/usr/bin/env bash
# Khôi phục CSDL + tệp đính kèm từ một bản sao lưu restic.
#   restic snapshots --tag task-manager          # xem danh sách
#   ./restore.sh latest                          # hoặc ./restore.sh <snapshot-id>
# CẢNH BÁO: ghi đè dữ liệu hiện tại. Nên diễn tập trên máy thử trước.
set -euo pipefail

SNAPSHOT="${1:?Cách dùng: restore.sh <snapshot-id|latest>}"
: "${RESTIC_REPOSITORY:?Chưa đặt RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD_FILE:?Chưa đặt RESTIC_PASSWORD_FILE}"

cd "$(dirname "$0")/.."
STAGING="${BACKUP_STAGING:-/var/backups/task-manager}"
TARGET="$(mktemp -d)"
trap 'rm -rf "$TARGET"' EXIT

restic restore "$SNAPSHOT" --tag task-manager --target "$TARGET"
SRC="$TARGET$STAGING"
[ -f "$SRC/db.dump" ] || { echo "Không tìm thấy db.dump trong bản sao lưu"; exit 1; }

read -r -p "Ghi đè toàn bộ dữ liệu hiện tại bằng bản sao lưu '$SNAPSHOT'? Gõ YES để tiếp tục: " answer
[ "$answer" = "YES" ] || { echo "Đã hủy"; exit 1; }

EXPECTED=$(ls "$SRC/uploads" 2>/dev/null | wc -l | tr -d ' ')

docker compose stop api
docker compose exec -T db pg_restore -U taskmanager -d taskmanager --clean --if-exists --no-owner < "$SRC/db.dump"
# Chép tệp đính kèm qua luồng tar (không gắn thư mục máy chủ vào container, không đổi chủ sở hữu tệp:
# container API chạy không có quyền hệ thống).
COPYFILE_DISABLE=1 tar -C "$SRC/uploads" -cf - . | docker compose run --rm -T --no-deps --entrypoint sh api \
  -c 'rm -rf /data/uploads/* && tar -C /data/uploads -xf - -o'
RESTORED=$(docker compose run --rm -T --no-deps --entrypoint sh api -c 'ls /data/uploads | wc -l' | tr -d ' \r')
docker compose start api
[ "$RESTORED" = "$EXPECTED" ] || { echo "LỖI: khôi phục được $RESTORED/$EXPECTED tệp đính kèm"; exit 1; }
echo "Khôi phục xong: CSDL và $RESTORED tệp đính kèm"
