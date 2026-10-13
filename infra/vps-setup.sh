#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu/Debian VPS (run as root). Safe to re-run.
#   ssh root@host 'bash -s' < infra/vps-setup.sh
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/tahaif}

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
apt-get install -y -qq rsync ufw >/dev/null

# Building the web image needs ~2 GB; add swap on small machines.
if [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 3500 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Only SSH and the web ports are reachable; the data services publish nothing.
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443 >/dev/null
ufw --force enable >/dev/null

mkdir -p "$APP_DIR"
echo "Ready: $(docker --version), app dir $APP_DIR"
