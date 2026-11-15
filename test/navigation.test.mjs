import test from "node:test";
import assert from "node:assert/strict";
import { findPath } from "../navigation.mjs";
import { ROOMS, taskPoint, walkable } from "../public/shared.js";

test("all task terminals and vents are connected to the meeting room", () => {
  for (const room of ROOMS) {
    const points = [
      taskPoint(room),
      { x: room.x + 55, y: room.y + room.h - 50 },
    ];
    for (const target of points) {
      const path = findPath({ x: 840, y: 600 }, target);
      assert.ok(path.length > 1, `${room.id} has a route`);
      assert.deepEqual(path.at(-1), target);
      for (const point of path)
        assert.ok(
          walkable(point.x, point.y),
          `${room.id}: point ${point.x},${point.y} is walkable`,
        );
    }
  }
});

test("routes between every pair of task rooms remain connected", () => {
  for (const source of ROOMS)
    for (const dest of ROOMS) {
      assert.ok(
        findPath(taskPoint(source), taskPoint(dest)).length,
        `${source.id} -> ${dest.id}`,
      );
    }
});

test("bots can physically reach and complete a task in each room", async () => {
  const { makePlayer, makeRoom, addBots, start, tick } =
    await import("../engine.mjs");
  const startTime = 1000000;
  for (const room of ROOMS.filter((r) => r.id !== "square")) {
    const bot = makePlayer("Navigator", 0);
    const game = makeRoom(bot, { max: 4, practice: true, role: "crew" });
    addBots(game, 3);
    start(game, startTime);
    for (const player of game.players) player.bot = false;
    bot.bot = true;
    bot.tasks = [{ room: room.id, done: false }];
    for (let i = 1; i < 1200 && !bot.tasks[0].done; i++)
      tick(game, startTime + i * 50);
    assert.equal(
      bot.tasks[0].done,
      true,
      `bot must reach ${room.id}, stopped at ${bot.x.toFixed(1)},${bot.y.toFixed(1)}`,
    );
  }
});

test("bots physically travel from each room to every other room", async () => {
  const { makePlayer, makeRoom, addBots, start, tick } =
    await import("../engine.mjs");
  const startTime = 1000000;
  for (const source of ROOMS)
    for (const target of ROOMS.filter((r) => r.id !== "square")) {
      const bot = makePlayer("Navigator", 0);
      const game = makeRoom(bot, { max: 4, practice: true, role: "crew" });
      addBots(game, 3);
      start(game, startTime);
      for (const p of game.players) p.bot = false;
      bot.bot = true;
      Object.assign(bot, taskPoint(source));
      bot.tasks = [{ room: target.id, done: false }];
      for (let i = 1; i < 1600 && !bot.tasks[0].done; i++)
        tick(game, startTime + i * 50);
      assert.equal(
        bot.tasks[0].done,
        true,
        `${source.id} to ${target.id}: ${bot.x.toFixed(1)},${bot.y.toFixed(1)}`,
      );
    }
});
