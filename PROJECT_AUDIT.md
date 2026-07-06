# 项目文件与 5 份文档核对报告

## 结论

当前项目已经按 `文档/` 中 5 份设计文档拆成两端：

- Windows 11 本地客户端：`desktop-client/`
- Ubuntu 远程服务端与 Web：`server/`、`web/`、`deploy/`、`scripts/`

已删除不属于正式方案的 Python 命令行客户端模拟器、临时运行数据和缓存目录。客户端主路径已按你的修正改为“截图交给本地视觉大模型识图”，不是 OCR 管线。

## 文件归属

| 路径 | 归属文档 | 说明 |
|---|---|---|
| `desktop-client/` | 客户端详细设计、技术方案、需求说明 | Electron + React + TypeScript Windows 11 本地客户端 |
| `desktop-client/start-client.cmd` | 客户端安装与运行 | Windows 双击一键启动入口 |
| `desktop-client/scripts/start-client.ps1` | 客户端运行环境检查 | 检查 Node.js、npm、Ollama、本地模型目录、依赖并启动客户端 |
| `desktop-client/local-models/` | 本地模型部署 | 存放本地视觉模型运行文件；启动器会把 Ollama 模型目录指到这里 |
| `desktop-client/src/main/capture/` | FR-C-002 | 屏幕采集 Provider 与 CaptureService |
| `desktop-client/src/main/active-window/` | 客户端活动窗口采集 | 活动窗口 Provider 与服务封装 |
| `desktop-client/src/main/privacy/` | FR-C-004、隐私验收 | 隐私规则、脱敏、上传前字段控制 |
| `desktop-client/src/main/model-adapter/` | FR-C-003、本地模型适配层 | Ollama / Local HTTP 视觉模型适配、Prompt、JSON 解析、兜底 |
| `desktop-client/src/main/storage/` | SQLite 本地设计 | 本地活动记录、session、settings 仓储 |
| `desktop-client/src/main/sync/` | FR-C-005 | 批量上传、重试、状态流转 |
| `desktop-client/src/renderer/` | 客户端 UI 设计 | 开始、暂停、恢复、停止、登录、设置、本地记录列表 |
| `server/` | 后端接口设计、技术方案 | FastAPI API、认证、设备、记录、日报、AI 分析 |
| `web/` | Web 前端功能 | 日报页面、统计、AI 分析入口、编辑删除 |
| `deploy/`、`scripts/` | Ubuntu 部署方案 | systemd 服务和 Ubuntu 部署脚本 |
| `Dockerfile`、`docker-compose.yml` | Ubuntu/Docker 部署 | 服务端容器化部署 |
| `tests/smoke_test.py` | 测试方案 | 服务端核心 API smoke test |
| `文档/` | 原始设计文档 | 5 份需求和设计文档 |

## 已对齐项

- 已实现本地客户端开始、暂停、恢复、停止状态机。
- 已实现 Electron `desktopCapturer` 屏幕采集和 `active-win` 活动窗口采集。
- 已实现本地隐私过滤，命中隐私应用/标题关键词时不调用模型。
- 已实现本地视觉模型适配，客户端把截图作为 `imageBase64` 交给本地 Ollama 或本地 HTTP 模型识图并生成结构化摘要。
- 已实现模型异常降级，不影响本地记录。
- 已实现本地 SQLite 队列和同步状态。
- 已实现服务端认证、设备、活动记录批量上传、幂等去重、规则日报和 AI 分析任务。
- DeepSeek API Key 只在 Ubuntu 服务端环境变量中使用，不进入客户端和浏览器。
- 默认不上传原始截图、OCR 原文、键盘输入、鼠标轨迹、音频或摄像头内容。
- 已补 Windows 一键启动器和项目内本地模型目录。

## 当前仍是 MVP 的偏差项

1. 服务端当前使用 SQLite 持久化，文档推荐生产使用 PostgreSQL + Alembic。
2. AI 分析任务当前使用 FastAPI BackgroundTasks，文档推荐 Redis + Celery/RQ。
3. 客户端屏幕采集已实现 Electron `desktopCapturer`，但尚未完整实现图像最长边缩放和多屏精细匹配。
4. 客户端不走 OCR 管线，而是把截图直接传给本地视觉模型识图；这是按你的最新确认调整后的主路径。
5. 客户端没有实现开机自启动配置 UI，但已有双击一键启动文件。
6. 周报、月报、PDF、复杂成本控制属于文档后续项，当前未实现。
7. 服务端 API Key 加密表 `ai_provider_settings` 尚未实现，当前只支持环境变量注入 DeepSeek Key。

## 保留文件说明

- `desktop-client/`：正式 Windows 11 客户端，保留。
- `desktop-client/local-models/`：本地模型目录，保留目录说明，实际模型文件被 `.gitignore` 忽略。
- `server/`、`web/`：Ubuntu 远程服务端和 Web，保留。
- `deploy/`、`scripts/`：Ubuntu 部署，保留。
- `tests/`：服务端 smoke test，保留。
- `local_client/`：已删除，因为它是临时 Python 模拟器，不属于正式文档方案。
- `data/`、`tmp-dev-data/`、`__pycache__`：已删除，因为它们是本地运行生成物。