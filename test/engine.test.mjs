import test from "node:test";
import assert from "node:assert/strict";
import {
  makePlayer,
  makeRoom,
  addBots,
  start,
  action,
  tick,
  view,
  kill,
  winCheck,
  meeting,
  finishMeeting,
} from "../engine.mjs";
import { ROLE, ROOMS, taskPoint, walkable } from "../public/shared.js";
const T = 1000000;
function fixture(role = "crew", n = 8) {
  const p = makePlayer("Игрок", 0);
  const r = makeRoom(p, { max: 15, practice: true, role });
  addBots(r, n - 1);
  start(r, T);
  const imp = r.players.find((q) => ROLE(q.role).team === "imp");
  for (const q of r.players) {
    q.bot = false;
    if (q !== p) {
      q.x = 400;
      q.y = 220;
    }
  }
  return { r, p, imp };
}
function at(p, x = 840, y = 600) {
  p.x = x;
  p.y = y;
  return p;
}
function crew(r, except) {
  return r.players.filter((q) => q !== except && ROLE(q.role).team === "crew");
}
test("all 12 roles can be assigned in practice, with one impostor", () => {
  for (const role of [
    "crew",
    "kirill",
    "nikita",
    "farmer",
    "ilya",
    "egor",
    "impostor",
    "sanya",
    "artem",
    "crocs",
    "fortis",
    "dima",
  ]) {
    const { r, p } = fixture(role);
    assert.equal(p.role, role);
    assert.equal(
      r.players.filter((q) => ROLE(q.role).team === "imp").length,
      1,
    );
    assert.equal(r.phase, "game");
  }
});
test("kill cooldown and distance are enforced; mirror armor kills attacker and is private", () => {
  const { r, p, imp } = fixture("ilya");
  at(p);
  at(imp, 860);
  assert.throws(
    () => action(r, imp, { type: "kill" }, T + 1000),
    /перезаряжается/,
  );
  action(r, p, { type: "skill", key: "armor" }, T + 21000);
  const publicPlayer = view(r, imp.id, T + 21000).players.find(
    (q) => q.id === p.id,
  );
  assert.equal(publicPlayer.armor, undefined);
  assert.equal(publicPlayer.role, undefined);
  action(r, imp, { type: "kill", target: p.id }, T + 22000);
  assert.equal(p.alive, true);
  assert.equal(imp.alive, false);
  assert.equal(r.winner, "crew");
});
test("knees silently invert task progress and require actual task challenge", () => {
  const { r, p, imp } = fixture("sanya");
  const q = crew(r, p)[0];
  at(p);
  at(q, 865);
  action(r, p, { type: "skill", key: "knees", target: q.id }, T + 21000);
  assert.equal(
    view(r, q.id).players.find((x) => x.id === q.id).knees,
    undefined,
  );
  r.progress = 50;
  const task = q.tasks[0],
    room = ROOMS.find((x) => x.id === task.room);
  Object.assign(q, taskPoint(room));
  assert.throws(() =>
    action(
      r,
      q,
      { type: "taskSubmit", room: task.room, sequence: [] },
      T + 22000,
    ),
  );
  const challenge = action(
    r,
    q,
    { type: "taskStart", room: task.room },
    T + 23000,
  );
  action(
    r,
    q,
    { type: "taskSubmit", room: task.room, sequence: challenge.task.sequence },
    T + 25000,
  );
  assert.ok(r.progress < 50);
  assert.equal(task.done, true);
});
test("puddle gives instant tasks, borscht can be consumed once for ten seconds", () => {
  const { r, p } = fixture("egor");
  const task = p.tasks[0];
  Object.assign(p, taskPoint(ROOMS.find((x) => x.id === task.room)));
  action(r, p, { type: "skill", key: "puddle" }, T + 21000);
  assert.equal(
    action(r, p, { type: "taskStart", room: task.room }, T + 22000).instant,
    true,
  );
  assert.equal(task.done, true);
  p.role = "kirill";
  const q = crew(r, p)[0];
  at(p);
  at(q, 860);
  action(r, p, { type: "skill", key: "borscht", target: q.id }, T + 23000);
  assert.equal(q.meal, true);
  action(r, q, { type: "consume" }, T + 24000);
  assert.equal(q.speedUntil, T + 34000);
  assert.throws(() => action(r, q, { type: "consume" }, T + 25000));
});
test("all special attack protections reset after a meeting", () => {
  for (const [role, key, seconds] of [
    ["artem", "beauty", 10],
    ["crocs", "shock", 10],
    ["dima", "rocket", 10],
    ["fortis", "selfbomb", 20],
  ]) {
    const { r, p } = fixture(role);
    assert.throws(
      () => action(r, p, { type: "skill", key }, T + 1000),
      /Защита/,
    );
    meeting(r, p, "test", T + 30000);
    finishMeeting(r, T + 40000);
    assert.throws(
      () => action(r, p, { type: "skill", key }, T + 41000),
      /Защита/,
    );
    assert.equal(p.alive, true);
  }
});
test("votes eject only a unique majority; dead players cannot vote", () => {
  const { r, p, imp } = fixture();
  meeting(r, p, "test", T + 1000);
  r.meeting.votes[p.id] = imp.id;
  finishMeeting(r, T + 2000);
  assert.equal(imp.alive, false);
  assert.equal(r.winner, "crew");
  const f = fixture();
  meeting(f.r, f.p, "test", T + 1000);
  f.r.meeting.votes[f.p.id] = f.imp.id;
  f.r.meeting.votes[f.imp.id] = "skip";
  finishMeeting(f.r, T + 2000);
  assert.equal(f.imp.alive, true);
});
test("reactor expires into impostor victory and repair cancels it", () => {
  const { r, p, imp } = fixture();
  action(r, imp, { type: "sabotage", kind: "reactor" }, T + 21000);
  const room = ROOMS.find((q) => q.id === "reactor");
  Object.assign(p, taskPoint(room));
  action(r, p, { type: "repair" }, T + 22000);
  assert.equal(r.sabotage, null);
  action(r, imp, { type: "sabotage", kind: "reactor" }, T + 52000);
  winCheck(r, T + 98000);
  assert.equal(r.winner, "imp");
});
test("one remaining crew loses; all tasks or all impostors dead wins", () => {
  const f = fixture();
  for (const q of crew(f.r).slice(1)) kill(f.r, q, null, T);
  winCheck(f.r, T);
  assert.equal(f.r.winner, "imp");
  const g = fixture();
  g.r.progress = 100;
  winCheck(g.r, T);
  assert.equal(g.r.winner, "crew");
});
test("walls block movement and expire; map rooms are reachable", () => {
  const { r, p } = fixture("nikita");
  at(p);
  p.fx = 1;
  p.fy = 0;
  action(r, p, { type: "skill", key: "wall" }, T + 21000);
  p.dx = 1;
  r.lastTick = T + 21000;
  for (let i = 1; i <= 15; i++) tick(r, T + 21000 + i * 50);
  assert.ok(p.x < 890);
  tick(r, T + 40000);
  assert.equal(r.walls.length, 0);
  assert.ok(walkable(840, 350));
  assert.ok(!walkable(100, 100));
});
test("teleport, bomb, chain lightning and controllable rocket enforce their effects", () => {
  const f = fixture("sanya");
  action(
    f.r,
    f.p,
    { type: "skill", key: "teleport", room: "kitchen" },
    T + 21000,
  );
  assert.equal(
    f.p.x,
    ROOMS.find((room) => room.id === "kitchen").x +
      ROOMS.find((room) => room.id === "kitchen").w / 2,
  );
  assert.throws(
    () =>
      action(
        f.r,
        f.p,
        { type: "skill", key: "teleport", room: "bridge" },
        T + 22000,
      ),
    /перезаряжается/,
  );
  const g = fixture("fortis");
  at(g.p);
  const [a, b] = crew(g.r, g.p);
  at(a, 870);
  at(b, 890);
  action(g.r, g.p, { type: "skill", key: "plant", target: a.id }, T + 21000);
  action(g.r, g.p, { type: "skill", key: "detonate" }, T + 22000);
  assert.equal(a.alive, false);
  assert.equal(b.alive, false);
  assert.equal(g.p.alive, true);
  const h = fixture("crocs");
  const victims = crew(h.r, h.p);
  for (const [i, q] of victims.entries()) at(q, 860 + i * 8);
  at(h.p);
  action(
    h.r,
    h.p,
    { type: "skill", key: "shock", target: victims[0].id },
    T + 21000,
  );
  assert.equal(victims.filter((q) => !q.alive).length, 2);
  const j = fixture("dima");
  at(j.p);
  j.p.fx = 1;
  j.p.fy = 0;
  action(j.r, j.p, { type: "skill", key: "rocket" }, T + 21000);
  assert.equal(j.p.rocket, true);
  j.r.lastTick = T + 21000;
  for (let i = 1; i < 250 && j.p.rocket; i++) tick(j.r, T + 21000 + i * 50);
  assert.equal(j.p.rocket, null);
});

test("bots navigate for a full simulated match without invalid destinations", () => {
  const { r, p } = fixture();
  for (const q of r.players) q.bot = true;
  for (let i = 1; i < 3000 && r.phase !== "ended"; i++) tick(r, T + i * 50);
  assert.ok(["game", "meeting", "ended"].includes(r.phase));
});

test("beauty kills only crew looking at Artem, while laser blinds without killing", () => {
  const { r, p } = fixture("artem");
  at(p);
  const [a, b] = crew(r, p);
  at(a, 900);
  a.fx = -1;
  a.fy = 0;
  at(b, 910);
  b.fx = 1;
  b.fy = 0;
  action(r, p, { type: "skill", key: "beauty" }, T + 21000);
  r.lastTick = T + 21000;
  tick(r, T + 21050);
  assert.equal(a.alive, false);
  assert.equal(b.alive, true);
  p.role = "dima";
  action(r, p, { type: "skill", key: "laser" }, T + 22000);
  assert.equal(b.blindUntil, T + 26000);
  assert.equal(b.alive, true);
});
test("self explosion and hull breach respect victim caps", () => {
  for (const [role, key, cap] of [
    ["fortis", "selfbomb", 5],
    ["crocs", "breach", 3],
  ]) {
    const { r, p } = fixture(role);
    at(p, 690, 500);
    for (const [i, q] of crew(r, p).entries()) at(q, 720 + i * 15, 500);
    action(r, p, { type: "skill", key }, T + 21000);
    assert.equal(crew(r, p).filter((q) => !q.alive).length, cap);
    assert.equal(p.alive, key !== "selfbomb");
  }
});
test("coin outcomes update either progress or strikes and the third strike kills", () => {
  const { r, p } = fixture("farmer");
  let t = T + 21000;
  for (let i = 0; i < 6 && p.alive && r.phase === "game"; i++) {
    const before = r.progress,
      misses = p.misses;
    action(r, p, { type: "skill", key: "coin", bet: "heads" }, t);
    if (p.misses > misses) assert.equal(r.progress, before);
    else assert.equal(r.progress, before + 10);
    t += 15001;
  }
  assert.ok(p.misses <= 3);
  if (p.misses === 3) assert.equal(p.alive, false);
});
test("a placed block prevents killing through it", () => {
  const { r, p, imp } = fixture("nikita");
  at(p);
  at(imp, 930);
  p.fx = 1;
  p.fy = 0;
  action(r, p, { type: "skill", key: "wall" }, T + 21000);
  assert.throws(
    () => action(r, imp, { type: "kill", target: p.id }, T + 22000),
    /ближе/,
  );
  assert.equal(p.alive, true);
});

test("Fortis wins a final self explosion even when no impostor survives", () => {
  const { r, p } = fixture("fortis", 6);
  at(p);
  for (const [i, q] of crew(r, p).entries()) at(q, 860 + i * 12);
  action(r, p, { type: "skill", key: "selfbomb" }, T + 21000);
  assert.equal(p.alive, false);
  assert.equal(r.players.filter((q) => q.alive).length, 0);
  assert.equal(r.winner, "imp");
});

test("snapshot coordinates are compact while server physics keep full precision", () => {
  const { r, p } = fixture("crew");
  p.x = 840.123456789;
  p.y = 600.987654321;
  p.fx = 0.123456789;
  const player = view(r, p.id, T).players.find((q) => q.id === p.id);
  assert.equal(player.x, 840.1);
  assert.equal(player.y, 601);
  assert.equal(player.fx, 0.123);
  assert.equal(p.x, 840.123456789);
  assert.equal(p.y, 600.987654321);
});

test("solid kitchen table stops movement, attacks and rockets", () => {
  const { r, p, imp } = fixture("crew");
  p.x = 775;
  p.y = 225;
  p.dx = 0;
  p.dy = -1;
  r.lastTick = T + 21000;
  for (let i = 1; i <= 20; i++) tick(r, T + 21000 + i * 50);
  assert.ok(p.y >= 216, `player walked through table: ${p.y}`);
  p.y = 225;
  p.dx = p.dy = 0;
  imp.x = 775;
  imp.y = 130;
  assert.throws(
    () => action(r, imp, { type: "kill", target: p.id }, T + 23000),
    /ближе/,
  );
  assert.equal(p.alive, true);
  const missileGame = fixture("dima");
  missileGame.p.x = 775;
  missileGame.p.y = 225;
  missileGame.p.fx = 0;
  missileGame.p.fy = -1;
  action(
    missileGame.r,
    missileGame.p,
    { type: "skill", key: "rocket" },
    T + 21000,
  );
  missileGame.r.lastTick = T + 21000;
  for (let i = 1; i <= 10; i++) tick(missileGame.r, T + 21000 + i * 50);
  assert.equal(missileGame.r.rockets.length, 0);
});
