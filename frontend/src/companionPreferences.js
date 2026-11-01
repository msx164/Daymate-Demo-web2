export function preferencePreview(value) {
  if (!value) return "";
  return `【本次主动分享的偏好，仅作参考】\n称呼：${value.nickname || "未设置"}\n交流风格：${value.tone === "direct" ? "直接简洁" : "温和鼓励"}\n近期目标：${value.goal || "未设置"}`;
}
export function withPreferences(text, preferences, share) {
  return share && preferences ? `${text}\n\n${preferencePreview(preferences)}` : text;
}
