import type { ClientSettings, ModelHealth, ModelSummary, ScreenSummaryInput } from "../../shared/types";
import { PromptBuilder } from "./PromptBuilder";
import { ModelOutputParser } from "./ModelOutputParser";
import type { ModelAdapter } from "./ModelAdapter";

export class OllamaAdapter implements ModelAdapter {
  private readonly promptBuilder = new PromptBuilder();
  private readonly parser = new ModelOutputParser();

  constructor(private readonly settings: ClientSettings) {}

  async healthCheck(): Promise<ModelHealth> {
    try {
      const response = await fetch(`${this.settings.modelBaseUrl.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { status: "ok", provider: "ollama", modelName: this.settings.modelName, supportsImage: true };
    } catch (error) {
      return { status: "unavailable", provider: "ollama", modelName: this.settings.modelName, supportsImage: true, message: String(error) };
    }
  }

  async summarize(input: ScreenSummaryInput): Promise<ModelSummary> {
    try {
      const response = await fetch(`${this.settings.modelBaseUrl.replace(/\/$/, "")}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.settings.modelName,
          prompt: this.promptBuilder.build(input),
          images: input.imageBase64 ? [input.imageBase64] : undefined,
          stream: false,
          options: { temperature: 0.2, top_p: 0.8, num_predict: 256 }
        }),
        signal: AbortSignal.timeout(this.settings.modelTimeoutSeconds * 1000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { response?: string };
      return this.parser.parse(input.requestId, data.response ?? "", input.appName, input.windowTitle);
    } catch {
      return this.parser.fallback(input.requestId, input.appName, input.windowTitle);
    }
  }
}

