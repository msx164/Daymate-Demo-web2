import test from "node:test";
import assert from "node:assert/strict";
import { avatarPose, companionPresentation } from "./companionPresentation.js";
import { companionState } from "./companionAppearance.js";

test("visual cues distinguish focus, waiting for save, and speaking without claiming completion", () => {
  assert.equal(companionPresentation("focus").pose, "focused");
  assert.equal(companionPresentation("thinking").pose, "focused");
  assert.equal(companionPresentation("speaking").expression, "talk");
  assert.equal(companionPresentation("paused").action, "still");
  assert.equal(companionPresentation("saving").action, "still");
  assert.match(companionPresentation("ended").cue, /等待保存/);
  assert.equal(companionPresentation("ended").action, "greet");
});

test("unknown visual state is harmless and returned values cannot mutate shared presentations", () => {
  for (const value of [null, "missing", "toString", "__proto__"]) {
    assert.equal(companionPresentation(value).state, "idle");
  }
  const result = companionPresentation("idle"); result.pose = "speaking";
  assert.equal(companionPresentation("idle").pose, "default");
});

test("failed pose falls back to original art then robot, without breaking other loaded poses", () => {
  assert.equal(avatarPose("focused", ["focused"]), "default");
  assert.equal(avatarPose("focused", ["focused", "default"]), "robot");
  assert.equal(avatarPose("speaking", ["focused", "default"]), "speaking");
  assert.equal(avatarPose("missing"), "default");
});

test("focus and saving take precedence over speech, reply takes precedence outside focus", () => {
  assert.equal(companionState({ speaking: true }), "speaking");
  assert.equal(companionState({ speaking: true, replying: true }), "thinking");
  assert.equal(companionState({ speaking: true, hasFocus: true, isFocusing: true, timeLeft: 1 }), "focus");
  assert.equal(companionState({ speaking: true, hasFocus: true, timeLeft: 0 }), "ended");
  assert.equal(companionState({ speaking: true, isSaving: true }), "saving");
});
