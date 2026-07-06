import { ACTIVITY_CATEGORIES } from "../../shared/constants";
import type { ActivityCategory, ModelSummary } from "../../shared/types";
import { Sanitizer } from "../privacy/Sanitizer";

export class ModelOutputParser {
  parse(requestId: string, raw: string, fallbackApp?: string, fallbackTitle?: string): ModelSummary {
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      const json = JSON.parse(raw.slice(start, end + 1));
      const category = ACTIVITY_CATEGORIES.includes(json.category) ? json.category : "其他";
      const confidence = Math.min(1, Math.max(0, Number(json.confidence ?? 0.5)));
      return {
        requestId,
        summary: Sanitizer.text(String(json.summary ?? "使用电脑，具体内容不明确")) ?? "使用电脑，具体内容不明确",
        category: category as ActivityCategory,
        confidence,
        sensitive: Boolean(json.sensitive),
        reason: Sanitizer.text(json.reason)
      };
    } catch {
      return this.fallback(requestId, fallbackApp, fallbackTitle);
    }
  }

  fallback(requestId: string, appName?: string, windowTitle?: string): ModelSummary {
    const cleanAppName = Sanitizer.text(appName);
    const cleanTitle = Sanitizer.text(windowTitle);
    const lowered = cleanAppName?.toLowerCase() ?? "";
    const category: ActivityCategory = lowered.includes("code") || lowered.includes("cursor") || lowered.includes("visual studio")
      ? "编程开发"
      : lowered.includes("chrome") || lowered.includes("edge") || lowered.includes("firefox")
        ? "信息检索"
        : "其他";
    const summary = cleanAppName && cleanTitle
      ? `使用 ${cleanAppName}：${cleanTitle}`
      : cleanAppName
        ? `使用 ${cleanAppName}`
        : cleanTitle
          ? `查看 ${cleanTitle}`
          : "使用电脑，具体内容不明确";

    return {
      requestId,
      summary,
      category,
      confidence: cleanAppName || cleanTitle ? 0.45 : 0.35,
      sensitive: false,
      reason: "模型不可用或输出非合法 JSON，使用应用/窗口信息生成兜底摘要"
    };
  }
}
