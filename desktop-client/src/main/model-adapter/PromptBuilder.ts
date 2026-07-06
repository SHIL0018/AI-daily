import { ACTIVITY_CATEGORIES } from "../../shared/constants";
import type { ScreenSummaryInput } from "../../shared/types";

export class PromptBuilder {
  build(input: ScreenSummaryInput): string {
    return `你是一个本地屏幕活动识图总结助手。请根据当前屏幕截图、应用名称和窗口标题，判断用户此刻正在做什么。

请严格遵守以下要求：
1. 只输出 JSON，不要输出 Markdown，不要输出解释文字。
2. 必须优先分析当前截图，不要复述历史摘要，也不要沿用上一条记录的内容。
3. summary 使用中文，长度控制在 10 到 40 个中文字符。
4. 如果当前截图内容与上一条活动不同，summary 必须描述当前截图，而不是上一条活动。
5. 不要输出密码、验证码、身份证号、银行卡号、手机号、邮箱、Token、API Key 等敏感信息。
6. 请直接基于截图识图，不要要求 OCR 文本；如果屏幕内容疑似包含隐私内容，sensitive 设为 true，summary 输出“隐私内容，已跳过分析”。
7. category 必须从以下类别中选择：${ACTIVITY_CATEGORIES.join("、")}。

输出 JSON 格式：
{"summary":"...","category":"...","confidence":0.0,"sensitive":false,"reason":"..."}

当前应用：${input.appName ?? "未知"}
当前窗口标题：${input.windowTitle ?? "未知"}
当前采集时间：${input.timestamp}`;
  }
}
