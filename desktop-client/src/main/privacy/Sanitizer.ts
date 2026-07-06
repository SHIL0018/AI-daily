const SECRET_PATTERNS = [
  /(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi,
  /\b1[3-9]\d{9}\b/g,
  /\b\d{15,18}\b/g,
  /\b\d{13,19}\b/g,
  /[\w.+-]+@[\w-]+\.[\w.-]+/g
];

export class Sanitizer {
  static text(value?: string): string | undefined {
    if (!value) return value;
    let result = value;
    for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, "[已脱敏]");
    return result.slice(0, 600);
  }
}
