import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../api.js';

export function useMemories() {
  const [snapshot, setSnapshot] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const alive = useRef(false);
  const load = useCallback(async signal => {
    const data = await request('/api/companion/memories', { signal });
    if (alive.current) { setSnapshot(data); setSelected([]); }
  }, []);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    load(controller.signal).catch(value => { if (!controller.signal.aborted) setError(value.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { alive.current = false; controller.abort(); };
  }, [load]);
  async function action(entries, clear = false) {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(''); setSelected([]);
    try {
      if (entries === undefined) await load();
      else {
        const data = await request('/api/companion/memories', { method: clear ? 'DELETE' : 'PUT',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: snapshot.revision, ...(clear ? {} : { entries }) }) });
        if (alive.current) setSnapshot(data);
      }
      return true;
    } catch (value) {
      if (alive.current) setError(`${value.message}。结果未确认时请先复制草稿并重新读取，避免重复或覆盖。`);
      return false;
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  return { snapshot, selected, setSelected, busy, error, action };
}
