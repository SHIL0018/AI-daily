import type { ActiveWindowInfo, ClientSettings } from "../../shared/types";

export interface PrivacyDecision {
  action: "allow" | "skip" | "private_duration" | "app_only";
  reason?: string;
  matchedRule?: string;
}

export class PrivacyRuleEngine {
  decide(info: ActiveWindowInfo, settings: ClientSettings): PrivacyDecision {
    const appName = info.appName?.toLowerCase() ?? "";
    const title = info.windowTitle?.toLowerCase() ?? "";
    for (const app of settings.privacyAppBlacklist) {
      if (appName.includes(app.toLowerCase())) {
        return { action: "private_duration", reason: "命中隐私应用黑名单", matchedRule: app };
      }
    }
    for (const keyword of settings.privacyTitleKeywords) {
      if (title.includes(keyword.toLowerCase())) {
        return { action: "private_duration", reason: "命中隐私标题关键词", matchedRule: keyword };
      }
    }
    return { action: "allow" };
  }
}
