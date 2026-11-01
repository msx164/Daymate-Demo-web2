import test from "node:test";
import assert from "node:assert/strict";
import {
  createFocusSession, elapsedMilliseconds, freezeSession,
  pauseSession, remainingSeconds, resumeSession,
} from "./focusClock.js";

const task = { id: 7, name: "学习" };

test("delayed callbacks count elapsed time, not number of callbacks", () => {
  const session = createFocusSession(task, 0, "one");
  assert.equal(remainingSeconds(session, 12345), 1488);
});

test("pause excludes waiting time and preserves fractions across resumes", () => {
  let session = createFocusSession(task, 0, "one");
  session = pauseSession(session, 1700);
  assert.equal(elapsedMilliseconds(session, 90000), 1700);
  session = resumeSession(session, 90000);
  assert.equal(elapsedMilliseconds(session, 91300), 3000);
  assert.equal(freezeSession(session, 91300, false).snapshot.seconds, 3);
});

test("remaining time is bounded and expired sessions cannot resume", () => {
  let session = createFocusSession(task, 1000, "one");
  assert.equal(remainingSeconds(session, 500), 1500);
  assert.equal(remainingSeconds(session, 2000000), 0);
  session = pauseSession(session, 2000000);
  assert.equal(resumeSession(session, 3000000).runningSince, null);
  assert.equal(freezeSession(session, 3000000, true).snapshot.seconds, 1500);
});

test("finish freezes timestamp, seconds, key and intent across failed requests", () => {
  const session = freezeSession(createFocusSession(task, 0, "retry-key"), 6500, true);
  assert.equal(session.runningSince, null);
  assert.equal(session.snapshot.seconds, 6);
  assert.equal(session.snapshot.session_key, "retry-key");
  assert.equal(session.snapshot.ended_at, "1970-01-01T00:00:06.500Z");
  assert.strictEqual(freezeSession(session, 150000, false), session);
  assert.strictEqual(resumeSession(session, 160000), session);
});

test("one minute and longer sessions use their own duration cap", () => {
  const short = createFocusSession(task, 0, "short", 60);
  assert.equal(remainingSeconds(short, 12345), 48);
  assert.equal(freezeSession(short, 70000, false).snapshot.seconds, 60);
  const long = createFocusSession(task, 0, "long", 45 * 60);
  assert.equal(remainingSeconds(long, 30 * 60 * 1000), 15 * 60);
  const frozen = freezeSession(long, 50 * 60 * 1000, true);
  assert.equal(frozen.snapshot.seconds, 2700);
  assert.equal(frozen.snapshot.planned_seconds, 2700);
  assert.strictEqual(freezeSession(frozen, 10000000, false), frozen);
});

test("invalid duration cannot start a session", () => {
  for (const seconds of [0, 59, 14401, NaN, Infinity, 60.5]) {
    assert.throws(() => createFocusSession(task, 0, "bad", seconds), RangeError);
  }
  assert.equal(remainingSeconds(createFocusSession(task, 0, "max", 14400), 0), 14400);
});
