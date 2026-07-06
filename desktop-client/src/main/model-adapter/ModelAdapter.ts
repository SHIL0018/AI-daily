import type { ModelHealth, ModelSummary, ScreenSummaryInput } from "../../shared/types";

export interface ModelAdapter {
  healthCheck(): Promise<ModelHealth>;
  summarize(input: ScreenSummaryInput): Promise<ModelSummary>;
}
