import { useEffect, useState } from "react";
export function usePetCompanion({ character, motion, state, activity = 'idle', propSettings }) {
  const [warning, setWarning] = useState("");
  useEffect(() => {
    const bridge = typeof window !== "undefined" ? window.daymateDesktop : null;
    if (!bridge?.publishCompanion) return;
    let active = true;
    bridge.publishCompanion({ character, motion, state, activity, propSettings }).then(() => { if (active) setWarning(""); },
      () => { if (active) setWarning("桌宠状态暂未同步，可尝试隐藏后重新显示桌宠。"); });
    return () => { active = false; };
  }, [character, motion, state, activity, propSettings]);
  return warning;
}
