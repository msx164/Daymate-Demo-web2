import { request, API_URL } from '../api.js';
import { session } from './session.js';
export const get = path => request('/api/web2' + path);
const uncertain = new Map();
export async function post(path, data, key) {
  const fingerprint = JSON.stringify([session()?.user?.id, path, data]);
  const requestKey = key || uncertain.get(fingerprint) || crypto.randomUUID();
  try {
    const result = await request('/api/web2' + path, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'Idempotency-Key': requestKey,
    }, body: JSON.stringify(data) });
    uncertain.delete(fingerprint);
    return result;
  } catch (error) {
    if (!error.status) uncertain.set(fingerprint, requestKey);
    else uncertain.delete(fingerprint);
    throw error;
  }
}
export const command = (op, data) => post('/commands/' + op, data);
export function liveRoom(id, onState, onConnection) {
  let stopped = false, socket, retry;
  function connect() {
    if (stopped) return;
    onConnection('connecting');
    const url = new URL(API_URL); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/api/web2/live/' + id;
    socket = new WebSocket(url);
    socket.onopen = () => { socket.send(JSON.stringify({ token: session()?.token })); onConnection('connected'); };
    socket.onmessage = event => { try { onState(JSON.parse(event.data)); } catch { /* A malformed event cannot overwrite state. */ } };
    socket.onclose = event => {
      if (stopped) return;
      onConnection(event.code === 1008 ? 'denied' : 'reconnecting');
      if (event.code !== 1008) retry = setTimeout(connect, 2000);
    };
  }
  connect();
  return () => { stopped = true; clearTimeout(retry); socket?.close(); };
}
