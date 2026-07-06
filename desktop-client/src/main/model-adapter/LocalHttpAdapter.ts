import type { ClientSettings, ModelHealth, ModelSummary, ScreenSummaryInput } from "../../shared/types";
import type { ModelAdapter } from "./ModelAdapter";
import { ModelOutputParser } from "./ModelOutputParser";

export class LocalHttpAdapter implements ModelAdapter {
  private readonly parser = new ModelOutputParser();

  constructor(private readonly settings: ClientSettings) {}

  async healthCheck(): Promise<ModelHealth> {
    try {
      const response = await fetch(`${this.settings.modelBaseUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { status: "ok", provider: "local_http", modelName: this.settings.modelName, supportsImage: true };
    } catch (error) {
      return { status: "unavailable", provider: "local_http", modelName: this.settings.modelName, supportsImage: true, message: String(error) };
    }
  }

  async summarize(input: ScreenSummaryInput): Promise<ModelSummary> {
    try {
      const response = await fetch(`${this.settings.modelBaseUrl.replace(/\/$/, "")}/v1/screen-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(this.settings.modelTimeoutSeconds * 1000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return this.parser.parse(input.requestId, JSON.stringify(data), input.appName, input.windowTitle);
    } catch {
      return this.parser.fallback(input.requestId, input.appName, input.windowTitle);
    }
  }
}

