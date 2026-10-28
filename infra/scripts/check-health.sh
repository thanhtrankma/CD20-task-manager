#!/usr/bin/env bash
# Kiểm tra sức khỏe máy chủ, báo về Uptime Kuma (monitor kiểu "Push"). Chạy mỗi 15 phút bằng cron:
#   */15 * * * * KUMA_PUSH_URL=https://kuma.../api/push/<mã> RESTIC_REPOSITORY=... RESTIC_PASSWORD_FILE=... \
#     /opt/task-manager/infra/scripts/check-health.sh >> /var/log/task-manager-health.log 2>&1
#
# Kiểm tra: API trả lời /api/health (gồm kết nối CSDL); ổ đĩa còn trống; bản sao lưu gần nhất không quá 26 giờ;
# chứng chỉ HTTPS còn hạn trên 14 ngày. Lỗi nào cũng báo "down" kèm lý do; Uptime Kuma gửi cảnh báo cho quản trị.
# Không có KUMA_PUSH_URL: chỉ in kết quả (dùng để kiểm tra bằng tay).
set -uo pipefail

SITE="${SITE_URL:-https://127.0.0.1}"            # Địa chỉ HTTPS của hệ thống (vd. https://giaoviec.ten-truong.edu.vn)
DISK_MAX="${DISK_MAX_PERCENT:-85}"
BACKUP_MAX_HOURS="${BACKUP_MAX_HOURS:-26}"
CERT_MIN_DAYS="${CERT_MIN_DAYS:-14}"
problems=()

# 1. API và CSDL
if ! curl -fsS -k --max-time 10 "$SITE/api/health" >/dev/null; then
  problems+=("API không trả lời /api/health")
fi

# 2. Ổ đĩa (thư mục dữ liệu Docker)
used=$(df -P /var/lib/docker 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')
[ -n "${used:-}" ] && [ "$used" -ge "$DISK_MAX" ] && problems+=("Ổ đĩa đã dùng ${used}%")

# 3. Bản sao lưu gần nhất
if [ -n "${RESTIC_REPOSITORY:-}" ]; then
  last=$(restic snapshots --tag task-manager --latest 1 --json 2>/dev/null | grep -o '"time":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -z "$last" ]; then
    problems+=("Không đọc được bản sao lưu")
  else
    age_h=$(( ($(date +%s) - $(date -d "$last" +%s 2>/dev/null || echo 0)) / 3600 ))
    [ "$age_h" -gt "$BACKUP_MAX_HOURS" ] && problems+=("Bản sao lưu gần nhất cách đây ${age_h} giờ")
  fi
fi

# 4. Chứng chỉ HTTPS
host=$(echo "$SITE" | sed -E 's#https?://([^/:]+).*#\1#')
end=$(echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$end" ]; then
  days=$(( ($(date -d "$end" +%s 2>/dev/null || echo 0) - $(date +%s)) / 86400 ))
  [ "$days" -lt "$CERT_MIN_DAYS" ] && problems+=("Chứng chỉ HTTPS còn ${days} ngày")
fi

if [ ${#problems[@]} -eq 0 ]; then status=up; msg="OK"; else status=down; msg=$(IFS='; '; echo "${problems[*]}"); fi
echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] $status: $msg"
if [ -n "${KUMA_PUSH_URL:-}" ]; then
  curl -fsS --max-time 10 -G "$KUMA_PUSH_URL" --data-urlencode "status=$status" --data-urlencode "msg=$msg" >/dev/null \
    || echo "Không gửi được về Uptime Kuma"
fi
[ "$status" = up ]
