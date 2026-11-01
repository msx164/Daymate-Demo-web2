import { userStorage } from '../web2/session.js';
import { useEffect, useState, useSyncExternalStore } from "react";
import { createSpeechController } from "../speechController.js";
export function useSpeech(messages, busy) {
  const [controller] = useState(() => {
    let storage;
    try { storage = userStorage('local'); } catch { storage = null; }
    return createSpeechController({ bridge: window.daymateDesktop, storage });
  });
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.connect(); return () => controller.dispose(); }, [controller]);
  useEffect(() => { controller.syncMessages(messages, busy); }, [controller, messages, busy]);
  return { ...view, getSnapshot: controller.getSnapshot, subscribe: controller.subscribe, loadVoices: controller.loadVoices, speak: controller.speak, speakSegment: controller.speakSegment, stop: controller.stop,
    chooseVoice: controller.chooseVoice, chooseRate: controller.chooseRate };
}
