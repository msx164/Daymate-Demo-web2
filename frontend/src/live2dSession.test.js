import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewSession } from './live2dSession.js';

function fixture() {
  let listener, expired, disposed = 0, ready = 0, errors = 0;
  const sent = [], native=[];
  const child = { postMessage: (data, origin) => sent.push({ data, origin }), daymateLive2DPreview: { dispose: () => disposed++ } };
  const host = { location: { origin: 'http://127.0.0.1:1234' },
    addEventListener: (_, fn) => { listener = fn; }, removeEventListener: () => { listener = null; },
    setTimeout: fn => { expired = fn; return 1; }, clearTimeout: () => {} };
  const session = createPreviewSession({ host, child, onReady: () => ready++, onError: () => errors++,onNativeMotion:value=>native.push(value) });
  const event = (phase, overrides = {}) => listener?.({ source: child, origin: host.location.origin, data: { type: 'daymate-sdk-preview', phase }, ...overrides });
  return { session, sent, event,native, expire: () => expired(), counts: () => ({ disposed, ready, errors }) };
}
test('preview accepts only the current same-origin frame and sends bounded state fields after ready', () => {
  const f = fixture();
  f.session.update({ state: 'focus', motion: true, reduced: false, text: 'private', token: 'private' });
  assert.equal(f.sent.length, 0);
  f.event('ready', { origin: 'https://example.com' }); f.event('ready', { source: {} });
  assert.equal(f.sent.length, 0);
  f.event('ready');
  assert.deepEqual(f.sent.map(x => x.data), [
    { type: 'daymate-preview-control', action: 'state', value: 'focus' },
    { type: 'daymate-preview-control', action: 'motion', value: true },
    { type: 'daymate-preview-control', action: 'reduced', value: false },
    { type: 'daymate-preview-control', action: 'activity', value: 'idle' },
    { type: 'daymate-preview-control', action: 'propSettings', value: {visible:true,x:0,y:0,scale:1} },
  ]);
  f.session.update({ state: 'unknown', motion: 'true', reduced: true });
  assert.deepEqual(f.sent.slice(-5).map(x => x.data.value), ['idle', false, true, 'idle', {visible:true,x:0,y:0,scale:1}]);
});
test('timeout and repeated teardown release synchronously once and ignore late events', () => {
  const f = fixture(); f.expire(); f.event('ready'); f.session.fail(); f.session.dispose();
  assert.deepEqual(f.counts(), { disposed: 1, ready: 0, errors: 1 });
  f.session.update({ state: 'speaking', motion: true }); assert.equal(f.sent.length, 0);
});
test('native control accepts bounded clip IDs after ready and forwards only motion phase from the owned frame',()=>{
  const f=fixture();assert.equal(f.session.requestMotion('play','0'),false);f.event('ready');
  assert.equal(f.session.requestMotion('play','../file'),false);assert.equal(f.session.requestMotion('play','0'),true);
  assert.deepEqual(f.sent.at(-1).data,{type:'daymate-native-motion',action:'play',id:'0'});
  f.event('motion',{data:{type:'daymate-sdk-preview',phase:'motion',motion:{phase:'playing',private:'never forward'}}});
  assert.deepEqual(f.native,[{phase:'playing'}]);f.session.dispose();assert.equal(f.session.requestMotion('stop'),false);
});
