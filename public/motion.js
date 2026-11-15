// Animate only actual displacement, not the last direction the player faced.
export function advanceMotion(previous, target) {
  if (!previous) return { x: target.x, y: target.y, phase: 0, strength: 0 };
  const remaining = Math.hypot(target.x - previous.x, target.y - previous.y);
  if (remaining > 120)
    return { x: target.x, y: target.y, phase: 0, strength: 0 };
  const x = previous.x + (target.x - previous.x) * 0.24;
  const y = previous.y + (target.y - previous.y) * 0.24;
  const distance = Math.hypot(x - previous.x, y - previous.y);
  const strength = distance > 0.08 ? Math.min(1, distance / 0.8) : 0;
  return { x, y, phase: previous.phase + distance / 7, strength };
}
