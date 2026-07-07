# Activity Daily

Activity Daily is a personal activity review system that turns local desktop activity into structured records, visual dashboards, and AI-generated daily reports.

It is built around three parts: a Windows desktop client, a Spring Boot backend, and a Vue 3 web console. The desktop client keeps screen capture and visual summarization local first. The backend handles authentication, device sync, records, reports, API key management, and AI analysis jobs. The web console gives users a clean dashboard for daily review.

> Activity Daily is designed for personal reflection and productivity review, not employee surveillance.

## Highlights

- **Local-first desktop capture**: Windows 11 Electron client records active windows and screen context.
- **Local vision model support**: screenshots are summarized locally before structured records are synced.
- **Duplicate-screen skipping**: screenshot similarity/hash checks avoid repeated local model calls when the screen has not changed.
- **Privacy-aware workflow**: sensitive windows can be filtered locally, and AI analysis uses sanitized activity summaries.
- **Offline cache and sync queue**: local SQLite storage keeps records available even when the network is unavailable.
- **User-owned AI API key**: no default server key is bundled; each user configures their own DeepSeek API key.
- **Encrypted key storage**: API keys are encrypted by the Spring Boot backend and only masked hints are returned.
- **AI daily reports**: daily summaries include highlights, timeline commentary, focus analysis, suggestions, and risk flags.
- **Modern web console**: Vue 3, Pinia, Vue Router, and ECharts power the dashboard and management pages.
- **Ubuntu deployment ready**: systemd, Nginx, Docker Compose, and deployment scripts are included.

## Architecture

```text
Windows 11 Desktop Client
  Electron + React + TypeScript
  Screen capture / active window detection
  Local vision model service
  Local SQLite cache and sync queue
              |
              | HTTP/HTTPS API
              v
Spring Boot Server
  Spring Boot 3 + Java 17
  Spring Security + JWT
  JDBC + Flyway
  PostgreSQL in production / H2 for local development
  DeepSeek-compatible AI analysis jobs
              |
              v
Vue Web Console
  Vue 3 + TypeScript + Vite
  Pinia + Vue Router
  ECharts dashboards
  Nginx static hosting in production
```

## Repository Layout

```text
.
|-- desktop-client/          Windows desktop client, Electron + React
|-- server-spring/           Main backend, Spring Boot 3 + Java 17
|   |-- src/main/java/       Controllers, services, security, AI and business modules
|   `-- src/main/resources/  application.yml and Flyway migrations
|-- web-vue/                 Web console, Vue 3 + Vite + TypeScript
|   |-- src/views/           Home, records, API key and auth pages
|   |-- src/stores/          Pinia stores
|   `-- src/api.ts           API request wrapper
|-- deploy/                  systemd and Nginx deployment config
|-- scripts/                 Ubuntu deployment helper scripts
|-- server/                  Legacy FastAPI MVP, kept as migration reference
|-- web/                     Legacy static web MVP, kept as migration reference
|-- Dockerfile               Spring Boot + Vue build entry
|-- docker-compose.yml       Spring Boot + PostgreSQL local deployment
|-- .env.example             Environment variable template
`-- LICENSE                  MIT License
```

Private design documents, local model files, build outputs, databases, and logs are intentionally ignored by Git.

## Tech Stack

| Area | Stack |
| --- | --- |
| Desktop client | Electron, React, TypeScript, Vite, better-sqlite3 |
| Backend | Spring Boot 3.3, Java 17, Spring Security, JDBC, Flyway |
| Database | PostgreSQL for production, H2 for local development |
| Web frontend | Vue 3, TypeScript, Vite, Pinia, Vue Router, ECharts |
| Deployment | Ubuntu, systemd, Nginx, Docker Compose |
| AI analysis | DeepSeek-compatible chat completion API |

## Quick Start

### 1. Clone

```bash
git clone https://github.com/SHIL0018/AI-daily.git
cd AI-daily
```

### 2. Backend

The Spring Boot backend can run locally with the default H2 file database.

```bash
cd server-spring
mvn spring-boot:run
```

Default backend URL:

```text
http://127.0.0.1:8080
```

Swagger UI:

```text
http://127.0.0.1:8080/swagger-ui.html
```

Build the backend jar:

```bash
cd server-spring
mvn -DskipTests package
```

### 3. Web Frontend

```bash
cd web-vue
npm install
npm run dev
```

Default frontend development URL:

```text
http://127.0.0.1:5174
```

Production build:

```bash
cd web-vue
npm run build
```

### 4. Windows Desktop Client

```powershell
cd desktop-client
npm install
npm run typecheck
npm run build
```

One-click Windows startup script:

```powershell
cd desktop-client
.\start-client.cmd
```

Place the local vision model here:

```text
desktop-client/local-models/ollama/Qwen3.5-0.8B
```

The desktop client expects a local OpenAI-compatible vision service by default:

```text
http://127.0.0.1:8001/v1
```

## Configuration

Copy the example environment file before production deployment:

```bash
cp .env.example .env
```

Important variables:

```text
SERVER_PORT=8080
APP_TOKEN_SECRET=change-me
APP_API_KEY_SECRET=change-me-too
APP_DATABASE_URL=jdbc:postgresql://127.0.0.1:5432/activity_daily
APP_DATABASE_USERNAME=activitydaily
APP_DATABASE_PASSWORD=change-me
APP_DATABASE_DRIVER=org.postgresql.Driver
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_DEFAULT_MODEL=deepseek-v4-flash
DEEPSEEK_DEEP_ANALYSIS_MODEL=deepseek-v4-pro
```

For local development, the backend can run without PostgreSQL and will use an H2 file database. PostgreSQL is recommended for production.

## Deployment

### Ubuntu + systemd + Nginx

The deployment helper installs runtime dependencies, builds the Spring Boot jar and Vue frontend, then configures systemd and Nginx.

```bash
bash scripts/deploy_ubuntu.sh
```

Useful service commands:

```bash
sudo systemctl status activity-daily
sudo journalctl -u activity-daily -f
sudo systemctl restart activity-daily
sudo nginx -t
```

In production, put Nginx in front of the Spring Boot service. The backend should listen on localhost, and Nginx should serve `web-vue/dist` while proxying `/api/` to Spring Boot.

### Docker Compose

```bash
cp .env.example .env
# Edit APP_TOKEN_SECRET, APP_API_KEY_SECRET and APP_DATABASE_PASSWORD first.
docker compose up -d --build
```

The compose file starts PostgreSQL and the Spring Boot API. For public web access, serving the built Vue files with Nginx is still recommended.

## DeepSeek API Key

Activity Daily does not ship with a default server-side API key. Each user signs in to the web console and adds their own DeepSeek API key on the API management page.

- The key is encrypted before being stored by the Spring Boot backend.
- API responses only expose a masked key hint.
- If no key is configured, AI analysis returns `API_KEY_REQUIRED` and the frontend asks the user to configure a key first.

## Verification

Backend:

```bash
cd server-spring
mvn -DskipTests package
```

Frontend:

```bash
cd web-vue
npm run build
```

Desktop client:

```powershell
cd desktop-client
npm run typecheck
npm run build
```

## Privacy Notes

- Raw screenshots should stay on the local machine unless the system is explicitly extended to upload them.
- AI analysis uses sanitized structured activity records rather than sensitive raw content.
- Keep `.env`, database files, logs, and local model files out of Git.
- Use HTTPS before exposing the service on the public internet.

## Roadmap

- HTTPS automation and domain-based production deployment.
- More robust desktop packaging and auto-update flow.
- Better AI prompt evaluation and result quality checks.
- Optional screenshot retention policy and encrypted local archive.
- More dashboard views for weekly and monthly review.

## License

This project is open-sourced under the [MIT License](LICENSE).
