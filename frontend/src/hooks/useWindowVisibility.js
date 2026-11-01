import { useEffect, useState } from 'react';

export function useWindowVisibility() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const bridge = window.daymatePet || window.daymateDesktop;
    let alive = true, received = false, native = false;
    const accept = value => { if (alive && typeof value === 'boolean') { native = true; setVisible(value); } };
    const unsubscribe = bridge?.onVisibility?.(value => { received = true; accept(value); });
    bridge?.getVisibility?.().then(value => { if (!received) accept(value); }, () => {});
    const sync = () => { if (!native) setVisible(!document.hidden); };
    document.addEventListener('visibilitychange', sync);
    return () => { alive = false; unsubscribe?.(); document.removeEventListener('visibilitychange', sync); };
  }, []);
  return visible;
}
