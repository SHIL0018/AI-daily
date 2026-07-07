# 屏幕活动记录与 AI 日报生成系统

项目分为三个运行边界：

- Windows 11 本地客户端：`desktop-client/`
- Ubuntu 远程服务端：`server-spring/`，Spring Boot 3 + Java 17
- Web 日报前端：`web-vue/`，Vue 3 + Vite + TypeScript，由 Nginx 托管

本地客户端负责屏幕采集、本地视觉模型识图摘要、隐私过滤、本地 SQLite 缓存和同步队列。远程服务端负责认证、设备、活动记录、规则日报、用户 DeepSeek API Key 管理和 AI 分析任务。Web 前端负责首页、记录管理、API 管理、顶部栏、侧边栏和用户操作。

原 `server/` 与 `web/` 是 FastAPI + 静态 Web 的旧 MVP 实现，已保留作迁移参考；新部署默认使用 `server-spring/` 与 `web-vue/`。

## 目录结构

```text
.
├── desktop-client/          Windows Electron 本地客户端
├── server-spring/           Spring Boot 3 服务端
│   ├── src/main/java/       Controller、Service、安全、AI、业务模块
│   └── src/main/resources/  application.yml、Flyway 迁移脚本
├── web-vue/                 Vue 3 Web 前端
│   ├── src/views/           首页、记录管理、API 管理、登录注册
│   ├── src/stores/          Pinia 状态
│   └── src/api.ts           API 请求封装
├── deploy/                  systemd 与 Nginx 配置
├── scripts/                 Ubuntu 部署脚本
├── server/                  旧 FastAPI MVP 实现，迁移参考
├── web/                     旧静态 Web MVP 实现，迁移参考
├── tests/                   旧服务端 smoke test
├── Dockerfile               Spring Boot + Vue 构建入口
├── docker-compose.yml       Spring Boot + PostgreSQL 编排
└── .env.example             服务端环境变量模板
```

以下目录是本地运行或构建产物，不属于源码架构，已在 `.gitignore` 中忽略：

```text
desktop-client/node_modules/
desktop-client/dist/
desktop-client/release/
desktop-client/.venv-model/
desktop-client/logs/
desktop-client/local-models/ollama/Qwen3.5-0.8B/
web-vue/node_modules/
web-vue/dist/
server-spring/target/
data/
文档/
```

## Windows 11 本地客户端

一键启动：

```powershell
cd desktop-client
.\start-client.cmd
```

本地模型文件放在：

```text
desktop-client/local-models/ollama/Qwen3.5-0.8B
```

默认通过 Transformers / OpenAI-compatible 服务加载本地模型：

```text
http://127.0.0.1:8001/v1
```

## Spring Boot 服务端开发

本地构建：

```powershell
cd server-spring
mvn -DskipTests package
```

本地运行默认使用 H2 文件库：

```powershell
cd server-spring
mvn spring-boot:run
```

服务端默认监听：

```text
http://127.0.0.1:8080
```

Swagger：

```text
http://127.0.0.1:8080/swagger-ui.html
```

## Vue 前端开发

```powershell
cd web-vue
npm install
npm run dev
```

开发服务器默认监听：

```text
http://127.0.0.1:5174
```

生产构建：

```powershell
cd web-vue
npm run build
```

## Ubuntu 远程部署

部署脚本会安装 OpenJDK 17、Maven、Node.js/npm、Nginx、PostgreSQL，构建 Spring Boot jar 和 Vue dist，并配置 systemd + Nginx。

```bash
bash scripts/deploy_ubuntu.sh
```

部署后访问：

```text
http://<服务器IP>/
```

后端只监听本机：

```text
http://127.0.0.1:8080
```

常用命令：

```bash
sudo systemctl status activity-daily
sudo journalctl -u activity-daily -f
sudo systemctl restart activity-daily
sudo nginx -t
```

生产环境建议继续接入域名和 HTTPS 证书，例如使用 Caddy 或 Certbot。

## Docker Compose

```bash
cp .env.example .env
# 修改 APP_TOKEN_SECRET、APP_API_KEY_SECRET、APP_DATABASE_PASSWORD
sudo docker compose up -d --build
```

Compose 默认启动 PostgreSQL 与 Spring Boot API，Web 前端构建产物会被打入镜像；如需对外提供 Vue 页面，推荐仍使用 Nginx 托管 `web-vue/dist`。

## DeepSeek API Key

服务端不提供默认 Key。每个用户登录 Web 后，在“API 管理”页面自行填写 DeepSeek API Key。Key 在 Spring Boot 版本中使用 AES-GCM 加密后保存，接口只返回脱敏 hint。

未配置 Key 时，点击 AI 分析会提示先配置 API Key，后端返回：

```json
{
  "detail": {
    "code": "API_KEY_REQUIRED",
    "message": "请先在 API 管理中配置 DeepSeek API Key"
  }
}
```

## 验证

后端：

```powershell
cd server-spring
mvn -DskipTests package
```

前端：

```powershell
cd web-vue
npm run build
```

客户端：

```powershell
cd desktop-client
npm run typecheck
npm run build
```

## 许可证

本项目基于 MIT License 开源，详见 [LICENSE](LICENSE)。