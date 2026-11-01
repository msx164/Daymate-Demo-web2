const PRESENTATIONS = Object.freeze({
  idle: { pose: "default", expression: "smile", action: "breathe", cue: "陪伴", symbol: "♡" },
  focus: { pose: "focused", expression: "attentive", action: "breathe", cue: "认真专注", symbol: "◎" },
  paused: { pose: "default", expression: "rest", action: "still", cue: "休息一下", symbol: "Ⅱ" },
  ended: { pose: "speaking", expression: "happy", action: "greet", cue: "本轮到时，等待保存", symbol: "☆" },
  saving: { pose: "focused", expression: "attentive", action: "still", cue: "等待保存", symbol: "…" },
  thinking: { pose: "focused", expression: "thoughtful", action: "tilt", cue: "思考回复", symbol: "…" },
  speaking: { pose: "speaking", expression: "talk", action: "nod", cue: "正在朗读", symbol: "♫" },
});

export function companionPresentation(state = "idle") {
  const known = Object.hasOwn(PRESENTATIONS, state) ? state : "idle";
  return { state: known, ...PRESENTATIONS[known] };
}

export function avatarPose(pose, failed = []) {
  const known = ["default", "focused", "speaking"].includes(pose) ? pose : "default";
  if (!failed.includes(known)) return known;
  return failed.includes("default") ? "robot" : "default";
}
