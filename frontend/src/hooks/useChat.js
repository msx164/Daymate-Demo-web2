import { userStorage } from '../web2/session.js';
import { useEffect, useState, useSyncExternalStore } from "react";
import { createChatController } from "../chatController.js";

export function useChat() {
  const [controller] = useState(() => {
    let storage;
    try { storage = typeof window === "undefined" ? null : userStorage('session'); } catch { storage = null; }
    return createChatController({ storage });
  });
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    void controller.refreshStatus();
    const checkpoint = () => { if (controller.getSnapshot().messages.length) controller.checkpoint(); };
    const timer = setInterval(() => { if (controller.getSnapshot().busy) controller.checkpoint(); }, 1000);
    window.addEventListener("pagehide", checkpoint);
    document.addEventListener("visibilitychange", checkpoint);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", checkpoint);
      document.removeEventListener("visibilitychange", checkpoint);
      controller.dispose();
    };
  }, [controller]);
  return { ...view, getSnapshot: controller.getSnapshot, subscribe: controller.subscribe, send: controller.send, retry: controller.retry, cancel: controller.cancel,
    clear: controller.clear, refreshStatus: controller.refreshStatus, submit: controller.submit, restoreMessages: controller.restoreMessages };
}
