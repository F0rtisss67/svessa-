import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import WebSocket from "ws";
const port = 3107;
function waitMessage(socket, predicate, ms = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", handler);
      reject(Error("WebSocket message timeout"));
    }, ms);
    function handler(data) {
      const value = JSON.parse(data);
      if (predicate(value)) {
        clearTimeout(timer);
        socket.off("message", handler);
        resolve(value);
      }
    }
    socket.on("message", handler);
  });
}
async function command(socket, request, predicate) {
  const result = waitMessage(socket, predicate);
  socket.send(JSON.stringify(request));
  return result;
}
test("real WebSocket clients create, join, authorize, chat, start, vote and migrate host", async () => {
  const server = spawn(process.execPath, ["server.mjs"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const sockets = [];
  try {
    await Promise.race([
      once(server.stdout, "data"),
      new Promise((_, reject) =>
        setTimeout(() => reject(Error("Server start timeout")), 4000).unref(),
      ),
    ]);
    const a = new WebSocket(`ws://127.0.0.1:${port}`);
    sockets.push(a);
    await once(a, "open");
    const joined = await command(
      a,
      {
        type: "create",
        name: "Хозяин",
        color: 0,
        settings: { public: true, max: 6, meeting: 20 },
      },
      (m) => m.type === "joined",
    );
    const b = new WebSocket(`ws://127.0.0.1:${port}`);
    sockets.push(b);
    await once(b, "open");
    const guest = await command(
      b,
      { type: "join", name: "Друг", code: joined.code, color: 0 },
      (m) => m.type === "joined",
    );
    let result = await waitMessage(
      a,
      (m) => m.type === "state" && m.state.players.length === 2,
    );
    assert.notEqual(
      result.state.players[0].color,
      result.state.players[1].color,
    );
    assert.match(
      (await command(b, { type: "start" }, (m) => m.type === "error")).message,
      /капитан/,
    );
    await command(
      a,
      { type: "chat", text: "Привет <script>!" },
      (m) => m.type === "state" && m.state.chat.length === 1,
    );
    await command(
      a,
      { type: "bots", count: 2 },
      (m) => m.type === "state" && m.state.players.length === 4,
    );
    result = await command(
      a,
      { type: "start" },
      (m) => m.type === "state" && m.state.phase === "game",
    );
    assert.equal(result.state.players.filter((p) => p.role).length, 1);
    result = await command(
      a,
      { type: "meeting" },
      (m) => m.type === "state" && m.state.phase === "meeting",
    );
    assert.equal(result.state.meeting.by, "Хозяин");
    result = await command(
      b,
      { type: "vote", target: "skip" },
      (m) => m.type === "state" && m.state.meeting?.mine === "skip",
    );
    assert.equal(result.state.meeting.votes.length, 1);
    await command(a, { type: "leave" }, (m) => m.type === "left");
    result = await waitMessage(
      b,
      (m) => m.type === "state" && m.state.host === guest.id,
    );
    assert.equal(result.state.players.length, 3);
  } finally {
    for (const socket of sockets) socket.terminate();
    server.kill("SIGTERM");
    await once(server, "exit");
  }
});
