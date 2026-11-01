import test from 'node:test';
import assert from 'node:assert/strict';
import { createSentenceSpeech, nextSpokenSentence } from './sentenceSpeech.js';
import { createSpeechController } from './speechController.js';
const tick = () => new Promise(resolve => setImmediate(resolve));

async function fixture() {
  let conversation = { busy: true, messages: [{ id: 2, role: 'assistant', status: 'streaming', content: '' }] };
  const chatListeners = new Set(), audioListeners = new Set(), played = [];
  let sequence = 0, native = { phase: 'idle', outcome: 'idle' };
  const emitAudio = patch => { native = { ...native, ...patch, sequence: ++sequence }; audioListeners.forEach(fn => fn(native)); return native; };
  const bridge = {
    onSpeechState(fn) { audioListeners.add(fn); return () => audioListeners.delete(fn); },
    getSpeechVoices: async () => [{ id: 'local', language: 'zh-CN' }],
    playSpeech: async value => { played.push(value); return emitAudio({ phase: 'speaking', outcome: 'playing', id: value.id, requestId: value.requestId }); },
    stopSpeech: async () => emitAudio({ phase: 'idle', outcome: 'cancelled', id: null }),
  };
  let key = 0;
  const speech = createSpeechController({ bridge, newKey: () => `segment-${++key}` }); speech.connect(); await speech.loadVoices();
  const chat = { getSnapshot: () => conversation, subscribe(fn) { chatListeners.add(fn); return () => chatListeners.delete(fn); } };
  const player = createSentenceSpeech({ chat, speech }); player.connect();
  const update = (text, status = 'streaming', id = 2) => {
    conversation = { busy: status === 'streaming', messages: [{ id, role: 'assistant', status, content: text }] };
    chatListeners.forEach(fn => fn()); speech.syncMessages(conversation.messages, conversation.busy);
  };
  const complete = () => emitAudio({ phase: 'idle', id: null, outcome: 'completed' });
  return { player, speech, bridge, played, update, complete, emitAudio };
}
test('splitter holds partial sentences, decimals and code blocks, flushing final short text', () => {
  assert.equal(nextSpokenSentence('你好', 0, false), null);
  assert.deepEqual(nextSpokenSentence('你好', 0, true), { text: '你好', end: 2 });
  const decimal = nextSpokenSentence('今天的数值是3.14，请稍后再核对。下一步', 0, false);
  assert.match(decimal.text, /3\.14/); assert.ok(decimal.text.endsWith('。'));
  assert.equal(nextSpokenSentence('```js\nalert(1)', 0, false), null);
  assert.equal(nextSpokenSentence('```js\nalert(1)', 0, true).text, '');
  const code = '```js\nalert(1)\n```下面我们开始阅读。';
  const skipped = nextSpokenSentence(code, 0, false); assert.equal(skipped.text, '');
  assert.equal(nextSpokenSentence(code, skipped.end, false).text, '下面我们开始阅读。');
  const prefix = '字'.repeat(239);
  const cut = nextSpokenSentence(prefix + '`', 0, false);
  assert.equal(cut.end, 239);
  assert.equal(nextSpokenSentence(prefix + '```js\nsecret', cut.end, false), null);
  const emojiCut = nextSpokenSentence('字'.repeat(239) + '😀继续', 0, false);
  assert.equal(emojiCut.end, 239);
});
test('first sentence starts before generation completes and segments play once in order', async () => {
  const f = await fixture(); f.player.start(2);
  f.update('我们先从一件小事开始。'); await tick();
  assert.equal(f.played.length, 1); assert.equal(f.player.getSnapshot().phase, 'playing');
  f.update('我们先从一件小事开始。然后专注五分钟再休息。');
  assert.equal(f.played.length, 1);
  f.complete(); await tick(); assert.equal(f.played.length, 2);
  assert.equal(f.played[1].text, '然后专注五分钟再休息。');
  assert.equal(f.speech.getSnapshot().phase, 'speaking'); // Reentrant next-request state survives prior completion.
  f.emitAudio({ phase: 'speaking', viseme: 8, lipSource: 'viseme' });
  assert.equal(f.speech.getSnapshot().viseme, 8);
  f.update('我们先从一件小事开始。然后专注五分钟再休息。', 'complete');
  f.complete(); await tick(); assert.equal(f.player.getSnapshot().phase, 'complete');
  assert.equal(f.player.getSnapshot().completedId, 2); assert.equal(f.played.length, 2); f.player.dispose();
});
test('a finished segment waits for later tokens and never declares the full reply complete early', async () => {
  const f = await fixture(); f.player.start(2); f.update('我们先从一件小事开始。'); f.complete(); await tick();
  assert.equal(f.player.getSnapshot().phase, 'waiting'); assert.equal(f.player.getSnapshot().active, true);
  f.update('我们先从一件小事开始。好的', 'complete'); await tick();
  assert.equal(f.played[1].text, '好的'); f.complete(); await tick(); assert.equal(f.player.getSnapshot().phase, 'complete'); f.player.dispose();
});
test('manual stop clears queued sentences and ignores late text and completion events', async () => {
  const f = await fixture(); f.player.start(2); f.update('我们先从一件小事开始。然后专注五分钟再休息。');
  f.player.stop(); f.update('我们先从一件小事开始。然后专注五分钟再休息。最后结束。', 'complete'); f.complete(); await tick();
  assert.equal(f.played.length, 1); assert.equal(f.player.getSnapshot().active, false); f.player.dispose();
});
test('model failure, edited text, legacy completion and a different reply stop without replaying', async () => {
  for (const failure of ['error', 'edited', 'other', 'legacy']) {
    const f = await fixture(); f.player.start(2); f.update('我们先从一件小事开始。');
    if (failure === 'error') f.update('我们先从一件小事开始。', 'error');
    else if (failure === 'edited') f.update('内容被更改了。');
    else if (failure === 'legacy') f.emitAudio({ phase: 'idle', outcome: 'playing' });
    else f.update('另一个回复开始了。', 'streaming', 4);
    await tick(); assert.equal(f.player.getSnapshot().phase, 'error'); assert.equal(f.played.length, 1); f.player.dispose();
  }
});
test('playback failure preserves text and does not automatically retry or fall back to full replay', async () => {
  const f = await fixture(); f.bridge.playSpeech = async () => { throw Error('audio failed'); };
  f.player.start(2); f.update('我们先从一件小事开始。'); await tick();
  assert.equal(f.player.getSnapshot().phase, 'error'); assert.match(f.player.getSnapshot().error, /audio failed/); f.player.dispose();
});
