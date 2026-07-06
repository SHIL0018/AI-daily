# 本地模型目录

这个目录用于存放 Windows 11 客户端使用的本地大模型运行文件。

默认启动脚本会把 Ollama 的模型目录设置为：

```text
desktop-client/local-models/ollama
```

模型文件通常很大，不应该提交到 Git。当前启动器会优先检测：

```text
desktop-client/local-models/ollama/Qwen3.5-0.8B
```

如果目录为空，再通过模型运行时重新拉取或导入模型，例如：

```powershell
ollama pull qwen3.5:0.8b
```

如果你改用了其它本地模型，请在客户端设置页里同步修改模型名称。
