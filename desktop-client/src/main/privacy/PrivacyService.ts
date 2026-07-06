import type { ActiveWindowInfo, ActivityRecord, ClientSettings } from "../../shared/types";
import { PrivacyRuleEngine, type PrivacyDecision } from "./PrivacyRuleEngine";
import { Sanitizer } from "./Sanitizer";

export class PrivacyService {
  private readonly engine = new PrivacyRuleEngine();

  shouldSkipCapture(info: ActiveWindowInfo, settings: ClientSettings): PrivacyDecision {
    return this.engine.decide(info, settings);
  }

  sanitizeWindowTitle(title?: string): string | undefined {
    return Sanitizer.text(title);
  }

  sanitizeSummary(summary: string): string {
    return Sanitizer.text(summary) ?? "使用电脑，具体内容不明确";
  }

  sanitizeBeforeUpload(record: ActivityRecord, settings: ClientSettings): ActivityRecord {
    return {
      ...record,
      appName: Sanitizer.text(record.appName),
      windowTitle: settings.uploadWindowTitle ? Sanitizer.text(record.windowTitle) : undefined,
      processName: Sanitizer.text(record.processName),
      summary: this.sanitizeSummary(record.summary),
      metadata: {
        ...(record.metadata ?? {}),
        raw_screenshot_uploaded: false
      }
    };
  }
}
