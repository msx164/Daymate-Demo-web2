const initial = () => ({ video: { status: 'off', stream: null, error: '' }, audio: { status: 'off', stream: null, error: '' } });
export function mediaError(error) {
  if (['NotAllowedError', 'SecurityError'].includes(error?.name)) return '设备授权被拒绝，请检查浏览器或 Windows 隐私设置后重试。';
  if (error?.name === 'NotFoundError') return '未找到设备，请连接摄像头或麦克风后重试。';
  if (error?.name === 'NotReadableError') return '设备暂时无法使用，可能正被其他应用占用。';
  return '无法开启设备，请检查连接后重试。';
}

export function createLocalMedia({ capture, authorize = async () => true }) {
  let snapshot = initial();
  const revisions = { video: 0, audio: 0 }, listeners = new Set();
  const update = (kind, value) => { snapshot = { ...snapshot, [kind]: value }; listeners.forEach(fn => fn()); };
  const release = stream => stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
  const revoke = kind => { Promise.resolve(authorize(kind, false)).catch(() => {}); };
  function stop(kind, error = '') {
    revisions[kind]++;
    release(snapshot[kind].stream);
    revoke(kind);
    update(kind, { status: 'off', stream: null, error });
  }
  async function start(kind) {
    if (!['video', 'audio'].includes(kind) || snapshot[kind].status !== 'off') return;
    const revision = ++revisions[kind];
    update(kind, { status: 'pending', stream: null, error: '' });
    try {
      await authorize(kind, true);
      if (revision !== revisions[kind]) return;
      const stream = await capture(kind === 'video'
        ? { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }
        : { video: false, audio: { echoCancellation: true, noiseSuppression: true } });
      if (revision !== revisions[kind]) { release(stream); return; }
      if (!stream.getTracks().length || stream.getTracks().some(track => track.readyState !== 'live')) {
        release(stream); throw Error('Device ended');
      }
      stream.getTracks().forEach(track => { track.onended = () => stop(kind, '设备已断开，可重新开启。'); });
      update(kind, { status: 'on', stream, error: '' });
    } catch (error) {
      if (revision === revisions[kind]) stop(kind, mediaError(error));
    }
  }
  return {
    start, stop, stopAll() { stop('video'); stop('audio'); },
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
