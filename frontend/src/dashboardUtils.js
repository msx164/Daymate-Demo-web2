export function chinaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (name) => parts.find((part) => part.type === name).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function formatFocusDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}小时 ${minutes}分 ${secs}秒`;
  if (minutes > 0) return `${minutes}分 ${secs}秒`;
  return `${secs}秒`;
}

export function chartHeight(seconds, week) {
  const maximum = Math.max(...week.map((day) => day.seconds), 1);
  return seconds === 0 ? 0 : Math.max(4, (seconds / maximum) * 120);
}
