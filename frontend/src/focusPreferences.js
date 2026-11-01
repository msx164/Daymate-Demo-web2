export const DEFAULT_FOCUS_MINUTES = 25;
const STORAGE_KEY = "daymate.focusMinutes";

export function validFocusMinutes(value) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 240;
}

export function readFocusMinutes(storage) {
  try {
    const stored = storage.getItem(STORAGE_KEY);
    return stored !== null && validFocusMinutes(stored) ? Number(stored) : DEFAULT_FOCUS_MINUTES;
  } catch {
    return DEFAULT_FOCUS_MINUTES;
  }
}

export function writeFocusMinutes(storage, minutes) {
  if (!validFocusMinutes(minutes)) return false;
  try { storage.setItem(STORAGE_KEY, String(minutes)); return true; } catch { return false; }
}
