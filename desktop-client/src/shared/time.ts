const SHANGHAI_OFFSET_MINUTES = 8 * 60;

export function toShanghaiIso(date = new Date()): string {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MINUTES * 60 * 1000);
  return shifted.toISOString().replace("Z", "+08:00");
}

export function shanghaiDate(date = new Date()): string {
  return toShanghaiIso(date).slice(0, 10);
}

export function formatShanghaiTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
