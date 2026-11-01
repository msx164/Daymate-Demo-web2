import { useEffect, useState, useSyncExternalStore } from "react";
import { createDashboardStore } from "../dashboardStore.js";
import { chinaDate } from "../dashboardUtils.js";

export function useDashboard() {
  const [store] = useState(() => createDashboardStore());
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.refresh();
    let currentDay = chinaDate();
    const checkDay = () => {
      const day = chinaDate();
      if (day !== currentDay) { currentDay = day; void store.refresh(); }
    };
    const timer = setInterval(checkDay, 30000);
    document.addEventListener("visibilitychange", checkDay);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", checkDay);
      store.dispose();
    };
  }, [store]);
  return { ...view, refresh: store.refresh, updateTasks: store.updateTasks };
}
