import path from "node:path";
import type { ClientSettings, ModelHealth, ModelSummary, ScreenSummaryInput } from "../../shared/types";
import { PromptBuilder } from "./PromptBuilder";
import { ModelOutputParser } from "./ModelOutputParser";
import type { ModelAdapter } from "./ModelAdapter";
import { errorMessage, logger } from "../logs/logger";

type OpenAiModelList = {
  data?: Array<{ id?: string }>;
};

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
    text?: string;
  }>;
  output_text?: string;
};

export class OpenAiCompatibleAdapter implements ModelAdapter {
  private readonly promptBuilder = new PromptBuilder();
  private readonly parser = new ModelOutputParser();

  constructor(private readonly settings: ClientSettings) {}

  async healthCheck(): Promise<ModelHealth> {
    try {
      const response = await fetch(this.endpoint("models"), { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json().catch(() => ({}))) as OpenAiModelList;
      const modelName = this.resolveServedModelName(data);
      return { status: "ok", provider: "transformers", modelName, supportsImage: true };
    } catch (error) {
      const message = errorMessage(error);
      logger.warn("OpenAI-compatible model health check failed", { endpoint: this.endpoint("models"), modelName: this.resolveConfiguredModelName(), error: message });
      return { status: "unavailable", provider: "transformers", modelName: this.resolveConfiguredModelName(), supportsImage: true, message };
    }
  }

  async summarize(input: ScreenSummaryInput): Promise<ModelSummary> {
    try {
      const content: Array<Record<string, unknown>> = [
        { type: "text", text: this.promptBuilder.build(input) }
      ];
      if (input.imageBase64) {
        content.push({ type: "image_url", image_url: { url: this.toDataImageUrl(input.imageBase64) } });
      }

      const response = await fetch(this.endpoint("chat/completions"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer EMPTY" },
        body: JSON.stringify({
          model: this.resolveConfiguredModelName(),
          messages: [{ role: "user", content }],
          temperature: 0.7,
          top_p: 0.8,
          presence_penalty: 1.5,
          max_tokens: 256,
          stream: false
        }),
        signal: AbortSignal.timeout(this.settings.modelTimeoutSeconds * 1000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => "")}`);
      const data = (await response.json()) as OpenAiChatResponse;
      return this.parser.parse(input.requestId, this.extractText(data), input.appName, input.windowTitle);
    } catch (error) {
      logger.error("OpenAI-compatible summarize failed", { endpoint: this.endpoint("chat/completions"), modelName: this.resolveConfiguredModelName(), error: errorMessage(error) });
      return this.parser.fallback(input.requestId, input.appName, input.windowTitle);
    }
  }

  private endpoint(pathname: "models" | "chat/completions"): string {
    const base = this.settings.modelBaseUrl.replace(/\/$/, "");
    const apiBase = base.endsWith("/v1") ? base : `${base}/v1`;
    return `${apiBase}/${pathname}`;
  }

  private resolveConfiguredModelName(): string {
    const raw = this.settings.modelName.trim() || "local-models/ollama/Qwen3.5-0.8B";
    if (path.isAbsolute(raw)) return raw;
    if (raw.startsWith(".") || raw.startsWith("local-models") || raw.includes("\\")) {
      return path.resolve(process.cwd(), raw);
    }
    return raw;
  }

  private resolveServedModelName(data: OpenAiModelList): string {
    const configured = this.resolveConfiguredModelName();
    const served = data.data?.find((item) => item.id === configured)?.id ?? data.data?.[0]?.id;
    return served ?? configured;
  }

  private extractText(data: OpenAiChatResponse): string {
    if (data.output_text) return data.output_text;
    const choice = data.choices?.[0];
    if (!choice) return "";
    if (choice.text) return choice.text;
    const content = choice.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("\n");
    return "";
  }

  private toDataImageUrl(imageBase64: string): string {
    return imageBase64.startsWith("data:") ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  }
}
