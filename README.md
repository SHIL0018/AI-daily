# Activity Daily

Activity Daily 是一个面向个人时间复盘的桌面活动记录与 AI 日报系统。它会把 Windows 本地电脑活动整理成结构化记录、可视化看板和 AI 生成的每日总结，帮助用户回顾一天的时间投入、应用使用和专注状态。

系统由三个部分组成：Windows 本地客户端、Spring Boot 服务端和 Vue 3 Web 前端。客户端尽量在本地完成屏幕采集、视觉模型识图、隐私过滤和缓存同步；服务端负责账号、设备、活动记录、日报聚合、API Key 管理和 AI 分析任务；Web 前端负责展示首页看板、记录管理和用户配置。

> Activity Daily 的定位是个人复盘与自我管理工具，不是员工监控系统。

## 功能亮点

- **本地优先采集**：Windows 11 Electron 客户端定时采集活动窗口和屏幕上下文。
- **本地视觉模型识图**：屏幕内容先在本地通过视觉模型生成摘要，减少原始截图外传需求。
- **重复画面跳过**：通过截图相似度/hash 判断画面是否变化，画面没变时不重复调用本地模型。
- **隐私保护流程**：客户端可过滤敏感窗口，服务端 AI 分析只处理脱敏后的结构化活动摘要。
- **离线缓存与同步队列**：客户端使用 SQLite 保存本地记录，网络恢复后再同步到服务端。
- **账号与设备体系**：Spring Security + JWT 认证，支持多设备上报活动数据。
- **用户自有 API Key**：服务端不内置默认 DeepSeek Key，用户需要在 Web 端自行配置。
- **API Key 加密保存**：后端加密保存用户 Key，接口只返回脱敏后的 Key 提示。
- **AI 日报分析**：生成每日摘要、重点、时间线点评、专注分析、建议和风险提示。
- **可视化 Web 看板**：Vue 3 + ECharts 展示分类占比、应用统计、近期活动和 AI 分析状态。
- **Ubuntu 部署支持**：提供 systemd、Nginx、Docker Compose 和部署脚本参考。

## 系统架构

```text
Windows 11 本地客户端
  Electron + React + TypeScript
  屏幕采集 / 活动窗口识别
  本地视觉模型服务
  本地 SQLite 缓存与同步队列
              |
              | HTTP/HTTPS API
              v
Spring Boot 服务端
  Spring Boot 3 + Java 17
  Spring Security + JWT
  JDBC + Flyway
  生产环境 PostgreSQL / 本地开发 H2
  DeepSeek-compatible AI 分析任务
              |
              v
Vue Web 前端
  Vue 3 + TypeScript + Vite
  Pinia + Vue Router
  ECharts 可视化看板
  生产环境由 Nginx 托管静态文件
```

## 目录结构

```text
.
|-- desktop-client/          Windows 桌面客户端，Electron + React
|-- server-spring/           主服务端，Spring Boot 3 + Java 17
|   |-- src/main/java/       Controller、Service、安全、AI 和业务模块
|   `-- src/main/resources/  application.yml 与 Flyway 数据库迁移
|-- web-vue/                 Web 前端，Vue 3 + Vite + TypeScript
|   |-- src/views/           首页、记录管理、API 管理和登录注册页面
|   |-- src/stores/          Pinia 状态管理
|   `-- src/api.ts           API 请求封装
|-- deploy/                  systemd 与 Nginx 部署配置
|-- scripts/                 Ubuntu 部署辅助脚本
|-- server/                  旧 FastAPI MVP，保留作迁移参考
|-- web/                     旧静态 Web MVP，保留作迁移参考
|-- Dockerfile               Spring Boot + Vue 构建入口
|-- docker-compose.yml       Spring Boot + PostgreSQL 本地编排
|-- .env.example             环境变量模板
`-- LICENSE                  MIT License
```

私有设计文档、本地模型文件、构建产物、数据库和日志文件都已通过 `.gitignore` 排除，不会进入 Git 仓库。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 桌面客户端 | Electron, React, TypeScript, Vite, better-sqlite3 |
| 服务端 | Spring Boot 3.3, Java 17, Spring Security, JDBC, Flyway |
| 数据库 | 生产环境 PostgreSQL，本地开发 H2 |
| Web 前端 | Vue 3, TypeScript, Vite, Pinia, Vue Router, ECharts |
| 部署 | Ubuntu, systemd, Nginx, Docker Compose |
| AI 分析 | DeepSeek-compatible Chat Completion API |

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/SHIL0018/AI-daily.git
cd AI-daily
```

### 2. 启动服务端

Spring Boot 服务端本地开发默认使用 H2 文件数据库，可以不安装 PostgreSQL。

```bash
cd server-spring
mvn spring-boot:run
```

默认服务地址：

```text
http://127.0.0.1:8080
```

Swagger UI：

```text
http://127.0.0.1:8080/swagger-ui.html
```

构建后端 jar：

```bash
cd server-spring
mvn -DskipTests package
```

### 3. 启动 Web 前端

```bash
cd web-vue
npm install
npm run dev
```

默认开发地址：

```text
http://127.0.0.1:5174
```

生产构建：

```bash
cd web-vue
npm run build
```

### 4. 启动 Windows 本地客户端

普通用户可以直接从 [GitHub Releases](https://github.com/SHIL0018/AI-daily/releases/latest) 下载 Windows 安装包。安装时可以自行选择安装位置；安装完成后，从桌面或开始菜单启动，命令行窗口会先检查 Python、本地模型与模型服务，准备完成后自动进入客户端并关闭命令行窗口。

安装版默认从以下目录读取本地模型：

```text
%APPDATA%\Activity Daily Client\local-models\ollama\Qwen3.5-0.8B
```

从源码运行时：

```powershell
cd desktop-client
npm install
npm run typecheck
npm run build
```

一键启动脚本：

```powershell
cd desktop-client
.\start-client.cmd
```

本地视觉模型建议放在：

```text
desktop-client/local-models/ollama/Qwen3.5-0.8B
```

客户端默认连接本地 OpenAI-compatible 视觉模型服务：

```text
http://127.0.0.1:8001/v1
```

## 环境变量

生产部署前复制环境变量模板：

```bash
cp .env.example .env
```

常用配置：

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

本地开发可以直接使用 H2；生产环境建议使用 PostgreSQL，并务必修改默认密钥和数据库密码。

## 部署

### Ubuntu + systemd + Nginx

部署脚本会安装运行依赖，构建 Spring Boot jar 和 Vue 前端，并配置 systemd 与 Nginx。

```bash
bash scripts/deploy_ubuntu.sh
```

常用服务命令：

```bash
sudo systemctl status activity-daily
sudo journalctl -u activity-daily -f
sudo systemctl restart activity-daily
sudo nginx -t
```

生产环境建议让 Spring Boot 只监听本机端口，由 Nginx 托管 `web-vue/dist` 并反向代理 `/api/` 到后端服务。公网部署前请配置域名和 HTTPS。

### Docker Compose

```bash
cp .env.example .env
# 先修改 APP_TOKEN_SECRET、APP_API_KEY_SECRET 和 APP_DATABASE_PASSWORD
docker compose up -d --build
```

Compose 会启动 PostgreSQL 和 Spring Boot API。对公网提供 Web 页面时，仍推荐使用 Nginx 托管 Vue 构建产物。

## DeepSeek API Key

Activity Daily 不提供默认服务端 API Key。用户登录 Web 前端后，需要在 **API 管理** 页面自行添加 DeepSeek API Key。

- Key 会在 Spring Boot 后端加密保存。
- 接口只返回脱敏后的 Key 提示，不返回明文 Key。
- 如果用户还没有配置 Key，点击 AI 分析会返回 `API_KEY_REQUIRED`，前端会提示先配置 API Key。

## 验证命令

后端：

```bash
cd server-spring
mvn -DskipTests package
```

前端：

```bash
cd web-vue
npm run build
```

桌面客户端：

```powershell
cd desktop-client
npm run typecheck
npm run build
```

## 隐私说明

- 原始截图默认应保留在本地，除非你明确扩展上传逻辑。
- AI 分析使用脱敏后的结构化活动记录，而不是敏感原始内容。
- `.env`、数据库文件、日志文件和本地模型文件不要提交到 Git。
- 公网部署时请使用 HTTPS。

## Roadmap

- 自动化 HTTPS 与域名部署流程。
- 桌面客户端自动更新机制。
- 更系统的 AI 提示词评估与结果质量检查。
- 可选的截图留存策略和本地加密归档。
- 周报、月报和更多长期复盘视图。

## License

本项目基于 [MIT License](LICENSE) 开源。
