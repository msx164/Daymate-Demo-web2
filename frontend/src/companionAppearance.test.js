import test from "node:test";
import assert from "node:assert/strict";
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, readAppearance, writeAppearance, companionState } from "./companionAppearance.js";

test("scene settings survive reload and persist only whitelisted display fields", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.deepEqual(readAppearance(storage).settings, DEFAULT_APPEARANCE);
  assert.equal(writeAppearance(storage, { scene: "night", character: "robot", motion: false, private: "never store" }), "");
  assert.deepEqual(readAppearance(storage).settings, { scene: "night", character: "robot", motion: false, activity: 'idle' });
  assert.ok(!values.get(APPEARANCE_KEY).includes("private"));
});

test("corrupt, unsupported and blocked display preferences fall back safely", () => {
  for (const raw of ["broken", JSON.stringify({ version: 99 }), JSON.stringify({ version: 1, settings: { scene: "unknown", character: "day", motion: true } })]) {
    const result = readAppearance({ getItem: () => raw });
    assert.deepEqual(result.settings, DEFAULT_APPEARANCE);
    assert.ok(result.warning);
  }
  const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
  assert.ok(readAppearance(blocked).warning);
  assert.ok(writeAppearance(blocked, DEFAULT_APPEARANCE));
});

test("visual state follows real focus and reply state without inventing task completion", () => {
  assert.equal(companionState({}), "idle");
  assert.equal(companionState({ replying: true }), "thinking");
  assert.equal(companionState({ hasFocus: true, isFocusing: true, replying: true, timeLeft: 12 }), "focus");
  assert.equal(companionState({ hasFocus: true, isFocusing: false, timeLeft: 12 }), "paused");
  assert.equal(companionState({ hasFocus: true, isFocusing: false, timeLeft: 0 }), "ended");
  assert.equal(companionState({ isSaving: true, hasFocus: true, timeLeft: 0 }), "saving");
});
