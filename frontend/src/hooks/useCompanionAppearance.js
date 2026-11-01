import { userStorage } from '../web2/session.js';
import { useState } from "react";
import { readAppearance, validAppearance, writeAppearance } from "../companionAppearance.js";
function storage() {
  try { return userStorage('local'); } catch { return null; }
}
export function useCompanionAppearance() {
  const [view, setView] = useState(() => readAppearance(storage()));
  function update(patch) {
    const settings = { ...view.settings, ...patch };
    if (!validAppearance(settings)) return;
    const warning = writeAppearance(storage(), settings);
    setView({ settings, warning });
  }
  return { ...view, update };
}
