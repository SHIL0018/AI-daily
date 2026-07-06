#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/activity-daily"
APP_USER="activitydaily"

if ! id "$APP_USER" >/dev/null 2>&1; then
  sudo useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

sudo mkdir -p "$APP_DIR/data"
sudo rsync -a --delete \
  --exclude '.git' \
  --exclude 'data' \
  --exclude '__pycache__' \
  ./ "$APP_DIR/"

cd "$APP_DIR"
sudo python3 -m venv .venv
sudo .venv/bin/pip install --upgrade pip
sudo .venv/bin/pip install -r requirements.txt

if [ ! -f "$APP_DIR/.env" ]; then
  sudo cp .env.example .env
  sudo sed -i "s/APP_TOKEN_SECRET=change-me/APP_TOKEN_SECRET=$(openssl rand -hex 32)/" .env
fi

sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo cp deploy/activity-daily.service /etc/systemd/system/activity-daily.service
sudo systemctl daemon-reload
sudo systemctl enable activity-daily
sudo systemctl restart activity-daily
sudo systemctl status activity-daily --no-pager
