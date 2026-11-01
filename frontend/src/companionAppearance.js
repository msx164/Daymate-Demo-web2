export const APPEARANCE_KEY = "daymate.companionAppearance.v1";
import { activitySelection } from './companionActivities.js';
import { sceneId } from './companionScenes.js';
export const DEFAULT_APPEARANCE = Object.freeze({ scene: "day", character: "day", motion: true, activity: 'idle' });
export function validAppearance(value) {
  return !!value && typeof value.scene==='string' && sceneId(value.scene)===value.scene
    && ["day", "robot", "custom"].includes(value.character) && typeof value.motion === "boolean"
    && (value.activity === undefined || activitySelection(value.activity) === value.activity);
}
export function readAppearance(storage) {
  try {
    const raw = storage?.getItem(APPEARANCE_KEY);
    if (!raw) return { settings: { ...DEFAULT_APPEARANCE }, warning: "" };
    const value = JSON.parse(raw);
    if (value.version !== 1 || !validAppearance(value.settings)) throw Error("Invalid appearance");
    const { scene, character, motion } = value.settings;
    return { settings: { scene, character, motion, activity: activitySelection(value.settings.activity) }, warning: "" };
  } catch { return { settings: { ...DEFAULT_APPEARANCE }, warning: "显示设置无法读取，已使用默认场景。" }; }
}
export function writeAppearance(storage, settings) {
  try {
    if (!storage || !validAppearance(settings)) throw Error("Unavailable settings");
    const { scene, character, motion } = settings;
    storage.setItem(APPEARANCE_KEY, JSON.stringify({ version: 1, settings: { scene, character, motion, activity: activitySelection(settings.activity) } }));
    return "";
  } catch { return "显示设置未能保存，本次切换仍然有效，重启后可能恢复默认。"; }
}
export function companionState({ hasFocus, isFocusing, isSaving, timeLeft, replying, speaking }) {
  if (isSaving) return "saving";
  if (hasFocus && timeLeft === 0) return "ended";
  if (hasFocus) return isFocusing ? "focus" : "paused";
  return replying ? "thinking" : speaking ? "speaking" : "idle";
}
export const COMPANION_STATES = Object.freeze({
  idle: { label: "陪伴中", message: "从一个小目标开始，我陪你慢慢来。" },
  focus: { label: "专注中", message: "安心做眼前的事，我们一步一步来。" },
  paused: { label: "已暂停", message: "休息一下，准备好后再继续。" },
  ended: { label: "本轮到时", message: "本轮计时已结束，记得保存专注记录。" },
  saving: { label: "保存中", message: "正在保存，请稍等一下。" },
  thinking: { label: "正在回复", message: "正在整理回复，请稍等一下。" },
  speaking: { label: "朗读中", message: "正在朗读选中的回复，可随时停止。" },
});
