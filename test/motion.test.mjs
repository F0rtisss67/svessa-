import test from "node:test";
import assert from "node:assert/strict";
import { advanceMotion, facingDirection } from "../public/motion.js";

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

test("smoothing has the same duration at 30, 60 and 120 FPS", () => {
  const positions = [30, 60, 120].map(fps => {
    let pose = {x:0, y:0, phase:0, strength:0};
    for(let i=0;i<fps/10;i++) pose = advanceMotion(pose, {x:100,y:0}, 1000/fps);
    return pose.x;
  });
  assert.ok(Math.max(...positions) - Math.min(...positions) < 1e-9);
});

test("horizontal facing persists when walking vertically and reverses on direction change", () => {
  let direction = facingDirection(undefined, -1);
  assert.equal(direction, -1);
  assert.equal(facingDirection(direction, 0), -1);
  direction = facingDirection(direction, 1);
  assert.equal(direction, 1);
});
