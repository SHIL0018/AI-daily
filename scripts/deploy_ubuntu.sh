#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

APP_DIR="/opt/activity-daily"
WEB_DIR="/var/www/activity-daily"
APP_USER="activitydaily"
DB_NAME="activity_daily"
DB_USER="activitydaily"

sudo apt-get update
sudo apt-get install -y openjdk-17-jre-headless maven nginx postgresql postgresql-contrib rsync openssl curl ca-certificates gnupg
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  sudo useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

sudo mkdir -p "$APP_DIR" "$WEB_DIR"
sudo rsync -a --delete \
  --exclude '.git' \
  --exclude 'desktop-client/node_modules' \
  --exclude 'desktop-client/dist' \
  --exclude 'desktop-client/local-models/ollama' \
  --exclude 'desktop-client/.venv-model' \
  --exclude 'desktop-client/logs' \
  --exclude 'data' \
  --exclude '.env' \
  --exclude '.venv' \
  --exclude '文档' \
  ./ "$APP_DIR/"

if [ ! -f "$APP_DIR/.env" ]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  TOKEN_SECRET="$(openssl rand -hex 32)"
  API_KEY_SECRET="$(openssl rand -hex 32)"
  sudo tee "$APP_DIR/.env" >/dev/null <<ENV
SERVER_PORT=8080
APP_TOKEN_SECRET=$TOKEN_SECRET
APP_API_KEY_SECRET=$API_KEY_SECRET
APP_DATABASE_URL=jdbc:postgresql://127.0.0.1:5432/$DB_NAME
APP_DATABASE_USERNAME=$DB_USER
APP_DATABASE_PASSWORD=$DB_PASSWORD
APP_DATABASE_DRIVER=org.postgresql.Driver
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_DEFAULT_MODEL=deepseek-v4-flash
DEEPSEEK_DEEP_ANALYSIS_MODEL=deepseek-v4-pro
DEEPSEEK_TIMEOUT_SECONDS=120
DEEPSEEK_MAX_RETRIES=2
ENV
fi

DB_PASSWORD="$(sudo awk -F= '/^APP_DATABASE_PASSWORD=/{print $2}' "$APP_DIR/.env")"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

cd "$APP_DIR/web-vue"
sudo npm ci
sudo npm run build
sudo rsync -a --delete dist/ "$WEB_DIR/"

cd "$APP_DIR/server-spring"
sudo mvn -q -DskipTests package
sudo cp target/activity-daily-server-*.jar activity-daily-server.jar

sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo chown -R www-data:www-data "$WEB_DIR"
sudo cp "$APP_DIR/deploy/activity-daily.service" /etc/systemd/system/activity-daily.service
sudo cp "$APP_DIR/deploy/nginx/activity-daily.conf" /etc/nginx/sites-available/activity-daily.conf
sudo ln -sf /etc/nginx/sites-available/activity-daily.conf /etc/nginx/sites-enabled/activity-daily.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable activity-daily
sudo systemctl restart activity-daily
sudo systemctl reload nginx
sudo systemctl status activity-daily --no-pager