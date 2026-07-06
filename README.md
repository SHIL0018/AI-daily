# 屏幕活动记录与 AI 日报生成系统

项目分为三个运行边界：

- Windows 11 本地客户端：`desktop-client/`
- Ubuntu 远程服务端：`server/`
- Web 日报前端：`web/`，由 FastAPI 直接挂载静态文件

本地客户端负责屏幕采集、本地视觉模型识图摘要、隐私过滤、本地 SQLite 缓存和同步队列。远程服务端负责认证、设备、活动记录、规则日报、用户 DeepSeek API Key 管理、AI 分析任务和 Web 展示。

## 目录结构

```text
.
├── desktop-client/          Windows Electron 本地客户端
│   ├── src/main/            主进程：采集、模型适配、SQLite、同步、托盘
│   ├── src/renderer/        客户端界面：index.html、main.tsx、styles.css
│   ├── src/shared/          主进程和渲染进程共享类型、常量、IPC 名称
│   ├── scripts/             Windows 一键启动脚本
│   ├── local-models/        本地模型放置目录，实际模型文件不进入仓库
│   └── start-client.cmd     Windows 一键启动入口
├── server/                  FastAPI 服务端
│   └── app/                 配置、数据库初始化、接口、安全、业务服务
├── web/                     静态 Web 前端
├── deploy/                  systemd 等部署配置
├── scripts/                 Ubuntu 部署脚本
├── tests/                   服务端 smoke test
├── 文档/                    5 份项目设计文档
├── Dockerfile               服务端 + Web 容器构建入口
├── docker-compose.yml       单服务部署编排
├── requirements.txt         服务端 Python 依赖
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
server/app/__pycache__/
data/
```

## Windows 11 本地客户端

一键启动：

```powershell
cd desktop-client
.\start-client.cmd
```

也可以直接双击：

```text
desktop-client/start-client.cmd
```

启动器会检查并按需处理：

- Node.js 和 npm
- `node_modules`
- Electron native 模块重编译
- 本地模型目录 `local-models/ollama/Qwen3.5-0.8B`
- Transformers / OpenAI-compatible 本地模型服务 `http://127.0.0.1:8001/v1`
- Vite 渲染进程服务
- Electron 客户端

本地模型文件放在：

```text
desktop-client/local-models/ollama/Qwen3.5-0.8B
```

默认通过 Transformers / OpenAI-compatible 服务加载本地模型：

```text
http://127.0.0.1:8001/v1
```

开发启动：

```powershell
cd desktop-client
npm install
npm run dev:web
```

另开一个终端：

```powershell
cd desktop-client
npm run dev:electron
```

## Ubuntu 远程服务端

### Docker Compose 部署

```bash
cp .env.example .env
# 修改 APP_TOKEN_SECRET；DeepSeek API Key 由用户登录 Web 后在 API 管理页自行保存
sudo docker compose up -d --build
```

默认监听：

```text
http://<服务器IP>:8000
```

### systemd 部署

```bash
bash scripts/deploy_ubuntu.sh
```

常用命令：

```bash
sudo systemctl status activity-daily
sudo journalctl -u activity-daily -f
sudo systemctl restart activity-daily
```

生产环境建议使用 Nginx / Caddy 提供 HTTPS 反向代理。

## DeepSeek API Key

当前实现不提供服务端默认 Key。每个用户登录 Web 后，在“API 管理”页面自行填写 DeepSeek API Key。

服务端 `.env` 只保留 DeepSeek API 地址、模型名和超时等通用配置：

```bash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_DEFAULT_MODEL=deepseek-v4-flash
DEEPSEEK_DEEP_ANALYSIS_MODEL=deepseek-v4-pro
DEEPSEEK_TIMEOUT_SECONDS=120
DEEPSEEK_MAX_RETRIES=2
```

未配置 Key 时，点击 AI 分析会提示先配置 API Key，后端返回 `API_KEY_REQUIRED`。

## 验证

服务端 smoke test：

```bash
python -B tests/smoke_test.py
```

客户端检查：

```powershell
cd desktop-client
npm run typecheck
npm run build
```

启动器只检查环境：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File desktop-client/scripts/start-client.ps1 -CheckOnly -SkipInstall
```

## 许可证

本项目基于 MIT License 开源，详见 [LICENSE](LICENSE)。
