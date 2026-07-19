export function formatDuration(value: number): string {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return hours ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}

export function formatInferenceTime(valueMs: number): string {
  if (valueMs < 1000) return `${valueMs} ms`;
  return `${(valueMs / 1000).toFixed(valueMs >= 10000 ? 1 : 2)} 秒`;
}

export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim() || "操作失败";
}
