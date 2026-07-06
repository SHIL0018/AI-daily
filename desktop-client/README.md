# Electron 本地客户端

这是 Windows 11 本地桌面客户端，负责本地屏幕采集、本地大模型识图摘要、本地 SQLite 缓存，并把最小化后的活动记录同步到远程 Ubuntu 服务端。

## 一键启动

双击运行：

```text
start-client.cmd
```

或在 PowerShell 中运行：

```powershell
cd <项目目录>\desktop-client
.\start-client.cmd
```

启动器会自动检查并处理：

- Windows 环境
- Node.js 和 npm
- `node_modules`，不存在时自动 `npm install`
- Electron native 模块重编译
- 本地模型目录 `local-models/ollama/Qwen3.5-0.8B`
- Transformers / OpenAI-compatible 本地模型服务 `http://127.0.0.1:8001/v1`
- Vite 渲染进程服务
- Electron 客户端

如果 `http://127.0.0.1:8001/v1/models` 没有响应，启动器会自动尝试启动本地模型服务。

启动成功后，cmd 窗口会自动关闭；如果启动失败，窗口会停留并提示查看 `logs/start-client.log`。


## 关闭窗口

点击客户端右上角关闭按钮时，会弹出选择：

- 后台运行：隐藏主窗口，采集和同步继续运行，可以从系统托盘重新打开。
- 直接退出：停止记录并退出客户端。
- 取消：保持当前窗口打开。

## 本地模型服务

默认使用：

```text
Provider: transformers
模型服务地址: http://127.0.0.1:8001/v1
模型路径: local-models/ollama/Qwen3.5-0.8B
```

模型文件需要放在：

```text
local-models/ollama/Qwen3.5-0.8B
```

启动器会使用项目内的 Python 环境：

```text
.venv-model/
```

如果 `.venv-model` 不存在，且没有传入 `-SkipInstall`，启动器会自动创建它并安装模型服务依赖：

```text
transformers[serving] torch torchvision pillow accelerate safetensors openai requests
```

模型服务日志：

```text
logs/model-service.log
logs/model-service.err.log
```

客户端启动日志：

```text
logs/start-client.log
logs/client.log
```

## 常用启动参数

只检查环境，不启动模型服务和客户端：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-client.ps1 -CheckOnly -SkipInstall
```

跳过自动安装依赖：

```powershell
.\start-client.cmd -SkipInstall
```

跳过自动启动模型服务：

```powershell
.\start-client.cmd -SkipModelService
```

指定模型路径：

```powershell
.\start-client.cmd -TransformersModelPath "local-models/ollama/Qwen3.5-0.8B"
```

指定模型服务端口：

```powershell
.\start-client.cmd -TransformersPort 8001
```

## 远程 Ubuntu 服务端

启动客户端后，在设置页把“服务端地址”改成你的远程 Ubuntu 服务端地址，例如：

```text
http://你的服务器IP:8000
```

或 HTTPS 域名：

```text
https://your-domain.example.com
```

然后使用 Web 端注册过的账号登录，并点击“登录并注册设备”。

## 本地记录内容很泛怎么办

如果本地记录只显示类似“使用电脑，具体内容不明确”，通常是模型服务不可用或模型没有正常返回 JSON。

请先检查：

```powershell
curl http://127.0.0.1:8001/v1/models
```

再看：

```text
logs/model-service.err.log
logs/client.log
```

如果模型服务已启动但摘要仍然很泛，需要确认当前 `Qwen3.5-0.8B` 是否支持图片输入。纯文本模型不能真正看截图，只能生成兜底摘要。

## 开发启动

```powershell
npm install
npm run dev:web
```

另开一个终端：

```powershell
npm run dev:electron
```

也可以使用一键启动器：

```powershell
npm run start:windows
```

