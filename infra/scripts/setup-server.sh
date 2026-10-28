#!/usr/bin/env bash
# Chuẩn bị VPS Ubuntu 24.04 LTS cho hệ thống giao nhiệm vụ. Chạy MỘT LẦN bằng root ngay sau khi nhận VPS:
#
#   ADMIN_USER=quantri SSH_PUBKEY_FILE=/root/quantri.pub bash setup-server.sh
#
# SSH_PUBKEY_FILE: khóa công khai SSH của cán bộ quản trị (tạo trên máy quản trị: ssh-keygen -t ed25519).
# Script làm:
#   - Cập nhật hệ điều hành, đặt múi giờ, bật tự động cập nhật bản vá bảo mật
#   - Tạo tài khoản quản trị (sudo), chỉ đăng nhập SSH bằng khóa; tắt đăng nhập root, đăng nhập bằng mật khẩu
#   - Tường lửa: chỉ mở 80, 443 (web), 51820/udp (WireGuard), 22 (SSH, sẽ đóng sau khi có VPN)
#   - fail2ban chặn dò mật khẩu SSH
#   - Cài Docker (kho chính thức), WireGuard, restic (sao lưu)
# Sau khi chạy: làm tiếp theo docs/van-hanh.md (mục "Triển khai lần đầu").
#
# CẢNH BÁO: trước khi đóng phiên root hiện tại, mở một cửa sổ mới, thử đăng nhập bằng ADMIN_USER và khóa SSH.
set -euo pipefail

ADMIN_USER="${ADMIN_USER:?Đặt ADMIN_USER (tên tài khoản quản trị, vd. quantri)}"
SSH_PUBKEY_FILE="${SSH_PUBKEY_FILE:?Đặt SSH_PUBKEY_FILE (đường dẫn khóa công khai SSH của quản trị)}"
WG_PORT="${WG_PORT:-51820}"

[ "$(id -u)" -eq 0 ] || { echo "Phải chạy bằng root"; exit 1; }
. /etc/os-release
[ "$ID" = "ubuntu" ] || { echo "Script viết cho Ubuntu (đang là $ID)"; exit 1; }
grep -qE '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-)' "$SSH_PUBKEY_FILE" || { echo "$SSH_PUBKEY_FILE không phải khóa công khai SSH"; exit 1; }

step() { echo; echo "==> $*"; }
export DEBIAN_FRONTEND=noninteractive

step "Cập nhật hệ điều hành, cài công cụ"
apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl gnupg ufw fail2ban unattended-upgrades wireguard restic git
timedatectl set-timezone Asia/Ho_Chi_Minh

step "Tự động cài bản vá bảo mật"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

step "Tài khoản quản trị $ADMIN_USER (đăng nhập bằng khóa SSH)"
id "$ADMIN_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$ADMIN_USER"
usermod -aG sudo "$ADMIN_USER"
install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
install -m 600 -o "$ADMIN_USER" -g "$ADMIN_USER" "$SSH_PUBKEY_FILE" "/home/$ADMIN_USER/.ssh/authorized_keys"
echo "Đặt mật khẩu cho $ADMIN_USER (dùng cho sudo, không dùng để đăng nhập SSH):"
passwd "$ADMIN_USER"

step "Khóa SSH: không đăng nhập root, không đăng nhập bằng mật khẩu"
cat > /etc/ssh/sshd_config.d/10-giaoviec.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers $ADMIN_USER
MaxAuthTries 3
X11Forwarding no
EOF
sshd -t
systemctl reload ssh

step "Tường lửa"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH (dong sau khi co WireGuard)'
ufw allow 80/tcp comment 'HTTP -> HTTPS'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTP/3'
ufw allow "$WG_PORT"/udp comment 'WireGuard'
ufw --force enable
# Lưu ý: Docker tự mở cổng của container qua iptables, không qua ufw. Bộ triển khai chỉ mở 80, 443 (Caddy);
# CSDL, API không mở cổng ra ngoài. Không thêm "ports:" cho db, api trong docker-compose.yml.

step "fail2ban: chặn IP dò mật khẩu SSH"
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

step "Docker (kho chính thức của Docker)"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker
# Thành viên nhóm docker có quyền tương đương root: chỉ thêm tài khoản quản trị.
usermod -aG docker "$ADMIN_USER"

step "Thư mục triển khai"
install -d -m 750 -o "$ADMIN_USER" -g "$ADMIN_USER" /opt/task-manager
install -d -m 700 /var/backups/task-manager

echo
echo "XONG. Việc tiếp theo (docs/van-hanh.md):"
echo "  1. Mở cửa sổ mới, thử: ssh $ADMIN_USER@<IP-VPS>  (đừng đóng phiên root cho tới khi đăng nhập được)"
echo "  2. Cấu hình WireGuard, rồi đóng cổng 22 ra Internet: ufw delete allow 22/tcp && ufw allow in on wg0 to any port 22 proto tcp"
echo "  3. Lấy mã nguồn vào /opt/task-manager, cấu hình infra/.env, chạy docker compose up -d --build"
