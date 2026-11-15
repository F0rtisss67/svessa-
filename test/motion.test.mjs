import test from "node:test";
import assert from "node:assert/strict";
import { advanceMotion } from "../public/motion.js";

test("walking follows displacement and settles when the player stops", () => {
  let pose = advanceMotion(null, { x: 20, y: 20 });
  assert.equal(pose.strength, 0);
  for (let i = 1; i <= 20; i++)
    pose = advanceMotion(pose, { x: 20 + i * 4, y: 20 });
  assert.ok(pose.strength > 0);
  assert.ok(pose.phase > 0);
  for (let i = 0; i < 60; i++) pose = advanceMotion(pose, { x: 100, y: 20 });
  assert.equal(pose.strength, 0);
  const still = advanceMotion(pose, { x: 100, y: 20 });
  assert.ok(Math.abs(still.phase - pose.phase) < 0.001);
});

test("teleport snaps without playing walking animation", () => {
  const pose = advanceMotion(
    { x: 10, y: 10, phase: 5, strength: 1 },
    { x: 900, y: 900 },
  );
  assert.deepEqual(pose, { x: 900, y: 900, phase: 0, strength: 0 });
});
