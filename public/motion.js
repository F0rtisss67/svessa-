// Animate only actual displacement, not the last direction the player faced.
export function advanceMotion(previous, target, elapsedMs = 1000 / 60) {
  if (!previous) return { x: target.x, y: target.y, phase: 0, strength: 0 };
  const remaining = Math.hypot(target.x - previous.x, target.y - previous.y);
  if (remaining > 120)
    return { x: target.x, y: target.y, phase: 0, strength: 0 };
  const frames = Math.max(0.01, Math.min(elapsedMs, 100) / (1000 / 60));
  const blend = 1 - Math.pow(0.5, frames);
  const x = previous.x + (target.x - previous.x) * blend;
  const y = previous.y + (target.y - previous.y) * blend;
  const distance = Math.hypot(x - previous.x, y - previous.y);
  const speed = distance / frames;
  const strength = speed > 0.08 ? Math.min(1, speed / 0.8) : 0;
  return { x, y, phase: previous.phase + distance / 7, strength };
}

// Keep horizontal orientation when walking vertically or stopping.
export function facingDirection(previous = 1, fx = 0) {
  return Math.abs(fx) > 0.1 ? Math.sign(fx) : previous;
}
