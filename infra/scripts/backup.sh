#!/usr/bin/env bash
# Sao lưu CSDL + tệp đính kèm vào kho restic (mã hóa, chống trùng lặp, giữ nhiều phiên bản).
#
# Chuẩn bị một lần:
#   apt install restic
#   export RESTIC_REPOSITORY=/mnt/backup/task-manager   # hoặc sftp:user@may-sao-luu:/duong-dan
#   export RESTIC_PASSWORD_FILE=/root/.restic-password   # chmod 600, sao lưu file này riêng
#   restic init
#
# Chạy hằng ngày bằng cron (crontab -e):
#   30 1 * * * RESTIC_REPOSITORY=... RESTIC_PASSWORD_FILE=... /opt/task-manager/infra/scripts/backup.sh >> /var/log/task-manager-backup.log 2>&1
#
# Đổi dự án Compose (vd. diễn tập trên máy thử): COMPOSE_PROJECT_NAME=..., COMPOSE_ENV_FILES=/duong-dan/.env
set -euo pipefail

: "${RESTIC_REPOSITORY:?Chưa đặt RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD_FILE:?Chưa đặt RESTIC_PASSWORD_FILE}"

cd "$(dirname "$0")/.."
STAGING="${BACKUP_STAGING:-/var/backups/task-manager}"

now() { date "+%Y-%m-%dT%H:%M:%S%z"; }
echo "[$(now)] Bắt đầu sao lưu"
rm -rf "$STAGING" && mkdir -p "$STAGING" && chmod 700 "$STAGING"

docker compose exec -T db pg_dump -U taskmanager -d taskmanager --format=custom > "$STAGING/db.dump"
docker compose cp api:/data/uploads "$STAGING/uploads"

[ -s "$STAGING/db.dump" ] || { echo "Sao lưu CSDL thất bại (db.dump rỗng)"; exit 1; }
restic backup "$STAGING" --tag task-manager
restic forget --tag task-manager --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune

FILES=$(ls "$STAGING/uploads" 2>/dev/null | wc -l | tr -d ' ')
rm -rf "$STAGING"
echo "[$(now)] Sao lưu xong: CSDL và $FILES tệp đính kèm"
