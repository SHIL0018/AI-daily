import { app } from "electron";
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ClientSettings } from "../../shared/types";
import { logger } from "../logs/logger";
import { SettingsRepository } from "../storage/SettingsRepository";

const execFileAsync = promisify(execFile);

type PythonRuntime = {
  command: string;
  argsPrefix: string[];
};

export class RuntimeBootstrap {
  private readonly modelHost = "127.0.0.1";
  private readonly modelPort = 8001;

  constructor(private readonly settingsRepository: SettingsRepository) {}

  async ensure(): Promise<void> {
    const runtimeRoot = app.getPath("userData");
    const logsDir = path.join(runtimeRoot, "logs");
    const modelRoot = path.join(runtimeRoot, "local-models");
    const ollamaModelRoot = path.join(modelRoot, "ollama");
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(ollamaModelRoot, { recursive: true });

    logger.info("Runtime bootstrap started", { runtimeRoot, modelRoot });
    this.migrateModelPathIfAvailable(runtimeRoot);

    const modelsUrl = `http://${this.modelHost}:${this.modelPort}/v1/models`;
    if (await this.testHttp(modelsUrl, 3000)) {
      logger.info("Local Transformers service already available", { modelsUrl });
      return;
    }

    const modelPath = this.findQwenModelPath(runtimeRoot);
    if (!modelPath) {
      logger.warn("Qwen3.5-0.8B model files not found", {
        expectedPath: path.join(ollamaModelRoot, "Qwen3.5-0.8B")
      });
      return;
    }

    this.settingsRepository.set("modelProvider", "transformers");
    this.settingsRepository.set("modelBaseUrl", `http://${this.modelHost}:${this.modelPort}/v1`);
    this.settingsRepository.set("modelName", modelPath);

    const python = await this.findPython();
    if (!python) {
      logger.warn("Python runtime not found. Install Python 3.11 to auto-start the local model service.");
      return;
    }

    const runtime = await this.ensureModelVenv(runtimeRoot, python);
    if (!runtime) return;

    await this.startTransformersService(runtimeRoot, runtime.transformersExe, modelPath, logsDir, modelsUrl);
  }

  private migrateModelPathIfAvailable(runtimeRoot: string): void {
    const settings = this.settingsRepository.getAll() as ClientSettings;
    const raw = settings.modelName?.trim();
    if (raw && path.isAbsolute(raw) && fs.existsSync(path.join(raw, "config.json"))) return;
    const modelPath = this.findQwenModelPath(runtimeRoot);
    if (modelPath) this.settingsRepository.set("modelName", modelPath);
  }

  private findQwenModelPath(runtimeRoot: string): string | undefined {
    const candidates = [
      path.join(runtimeRoot, "local-models", "ollama", "Qwen3.5-0.8B"),
      path.join(runtimeRoot, "local-models", "Qwen3.5-0.8B"),
      path.join(runtimeRoot, "local-models", "Qwen", "Qwen3.5-0.8B"),
      ...this.resourcePathCandidates("local-models", "ollama", "Qwen3.5-0.8B"),
      path.join(process.cwd(), "local-models", "ollama", "Qwen3.5-0.8B"),
      path.join(process.cwd(), "local-models", "Qwen3.5-0.8B"),
      path.join(process.cwd(), "local-models", "Qwen", "Qwen3.5-0.8B")
    ];
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(path.join(candidate, "config.json"))) return candidate;
    }
    return undefined;
  }

  private resourcePathCandidates(...segments: string[]): string[] {
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    return resourcesPath ? [path.join(resourcesPath, ...segments)] : [];
  }

  private async findPython(): Promise<PythonRuntime | undefined> {
    const candidates: PythonRuntime[] = [
      { command: "py", argsPrefix: ["-3.11"] },
      { command: "py", argsPrefix: ["-3"] },
      { command: "python", argsPrefix: [] }
    ];
    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate.command, [...candidate.argsPrefix, "--version"], { timeout: 10000 });
        logger.info("Python runtime detected", candidate);
        return candidate;
      } catch {
        // Try next candidate.
      }
    }
    return undefined;
  }

  private async ensureModelVenv(runtimeRoot: string, python: PythonRuntime): Promise<{ pythonExe: string; transformersExe: string } | undefined> {
    const venvPath = path.join(runtimeRoot, ".venv-model");
    const pythonExe = path.join(venvPath, "Scripts", "python.exe");
    const transformersExe = path.join(venvPath, "Scripts", "transformers.exe");

    if (!fs.existsSync(pythonExe)) {
      logger.info("Creating model Python environment", { venvPath });
      try {
        await execFileAsync(python.command, [...python.argsPrefix, "-m", "venv", venvPath], { timeout: 120000 });
      } catch (error) {
        logger.warn("Failed to create model Python environment", error);
        return undefined;
      }
    }

    if (fs.existsSync(transformersExe) && await this.hasRequiredPythonPackages(pythonExe)) {
      logger.info("Model Python environment is ready", { venvPath });
      return { pythonExe, transformersExe };
    }

    logger.info("Installing model service dependencies. This can take several minutes on first launch.");
    try {
      await execFileAsync(pythonExe, ["-m", "pip", "install", "-U", "pip"], { timeout: 300000, maxBuffer: 20 * 1024 * 1024 });
      await execFileAsync(pythonExe, ["-m", "pip", "install", "transformers[serving]", "torch", "torchvision", "pillow", "accelerate", "safetensors", "openai", "requests"], { timeout: 1800000, maxBuffer: 20 * 1024 * 1024 });
    } catch (error) {
      logger.warn("Failed to install model service dependencies", error);
      return undefined;
    }

    if (!fs.existsSync(transformersExe)) {
      logger.warn("transformers.exe was not found after dependency installation", { transformersExe });
      return undefined;
    }
    return { pythonExe, transformersExe };
  }

  private async hasRequiredPythonPackages(pythonExe: string): Promise<boolean> {
    const code = "import transformers, requests, torch, PIL, accelerate, safetensors, openai";
    try {
      await execFileAsync(pythonExe, ["-c", code], { timeout: 60000 });
      return true;
    } catch {
      return false;
    }
  }

  private async startTransformersService(runtimeRoot: string, transformersExe: string, modelPath: string, logsDir: string, modelsUrl: string): Promise<void> {
    const modelLog = path.join(logsDir, "model-service.log");
    const modelErrLog = path.join(logsDir, "model-service.err.log");
    logger.info("Starting local Transformers service", { modelsUrl, modelPath, modelLog });

    const stdout = fs.openSync(modelLog, "a");
    const stderr = fs.openSync(modelErrLog, "a");
    const child = spawn(transformersExe, ["serve", modelPath, "--host", this.modelHost, "--port", String(this.modelPort), "--model-timeout", "-1"], {
      cwd: runtimeRoot,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", stdout, stderr]
    });
    child.unref();

    if (await this.waitHttp(modelsUrl, 120000)) {
      logger.info("Local Transformers service is ready", { modelsUrl });
    } else {
      logger.warn("Local Transformers service did not become ready in time", { modelsUrl, modelLog, modelErrLog });
    }
  }

  private async testHttp(url: string, timeoutMs: number): Promise<boolean> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async waitHttp(url: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.testHttp(url, 3000)) return true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
  }
}
