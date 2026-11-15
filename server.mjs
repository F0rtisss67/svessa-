import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { ROLE } from "./public/shared.js";
import {
  makeRoom,
  makePlayer,
  normalizeSettings,
  addBots,
  start,
  action,
  tick,
  view,
  kill,
  winCheck,
} from "./engine.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "public");
const rooms = new Map(),
  clients = new Map();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
    const path = resolve(
      root,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!path.startsWith(root + "/")) {
      res.writeHead(403);
      res.end();
      return;
    }
    const data = await readFile(path);
    res.writeHead(200, {
      "content-type": mime[extname(path)] || "application/octet-stream",
      "x-content-type-options": "nosniff",
      "cache-control": "no-cache",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
const wss = new WebSocketServer({ server, maxPayload: 8192 });
function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function detach(c) {
  if (!c.room) return;
  const r = rooms.get(c.room);
  if (!r) return;
  const p = r.players.find((q) => q.id === c.id);
  if (p) {
    if (r.phase === "lobby" || r.phase === "ended")
      r.players = r.players.filter((q) => q.id !== c.id);
    else {
      if (ROLE(p.role).team === "crew")
        r.progress = Math.min(
          100,
          r.progress + p.tasks.filter((q) => !q.done).length * r.taskValue,
        );
      kill(r, p, null);
      r.players = r.players.filter((q) => q.id !== c.id);
      winCheck(r);
    }
    if (r.host === c.id) r.host = r.players.find((q) => !q.bot)?.id;
    if (!r.players.some((q) => !q.bot)) rooms.delete(c.room);
  }
  c.room = null;
}
wss.on("connection", (ws) => {
  const c = { id: null, room: null, quota: 0, period: Date.now(), alive: true };
  clients.set(ws, c);
  ws.on("pong", () => (c.alive = true));
  send(ws, { type: "hello" });
  ws.on("message", (data) => {
    let a;
    try {
      if (Date.now() - c.period > 1000) {
        c.period = Date.now();
        c.quota = 0;
      }
      if (++c.quota > 70) throw Error("Слишком много запросов.");
      a = JSON.parse(data);
      if (!a || typeof a !== "object") return;
      if (a.type === "list") {
        send(ws, {
          type: "rooms",
          rooms: [...rooms.values()]
            .filter(
              (r) =>
                r.settings.public &&
                r.phase === "lobby" &&
                !r.settings.practice,
            )
            .map((r) => ({
              code: r.code,
              name: r.settings.name,
              count: r.players.length,
              max: r.settings.max,
            })),
        });
        return;
      }
      if (a.type === "create" || a.type === "join") {
        if (c.room) detach(c);
        let r;
        if (a.type === "create") {
          const p = makePlayer(a.name, a.color);
          r = makeRoom(p, a.settings);
          do {
            r.code = randomBytes(3).toString("hex").toUpperCase();
          } while (rooms.has(r.code));
          rooms.set(r.code, r);
          c.id = p.id;
        } else {
          r = rooms.get(String(a.code).toUpperCase());
          if (!r) throw Error("Комната не найдена. Проверь код.");
          if (r.phase !== "lobby") throw Error("Игра уже началась.");
          if (r.players.length >= r.settings.max)
            throw Error("Комната заполнена.");
          const p = makePlayer(a.name, a.color);
          if (r.players.some((q) => q.color === p.color)) {
            const free = Array.from({ length: 15 }, (_, i) => i).find(
              (i) => !r.players.some((q) => q.color === i),
            );
            if (free !== undefined) p.color = free;
          }
          r.players.push(p);
          c.id = p.id;
        }
        c.room = r.code;
        send(ws, { type: "joined", id: c.id, code: r.code });
        return;
      }
      if (a.type === "leave") {
        detach(c);
        send(ws, { type: "left" });
        return;
      }
      const r = rooms.get(c.room),
        p = r?.players.find((q) => q.id === c.id);
      if (!r || !p) throw Error("Сначала создай комнату.");
      if (a.type === "chat") {
        const text = String(a.text || "")
          .trim()
          .slice(0, 220);
        if (!text) return;
        if (c.lastChat && Date.now() - c.lastChat < 800) return;
        c.lastChat = Date.now();
        r.chat.push({ id: randomUUID(), name: p.name, text, dead: !p.alive });
        r.chat = r.chat.slice(-45);
        return;
      }
      if (a.type === "profile" && r.phase === "lobby") {
        p.name =
          String(a.name || p.name)
            .trim()
            .slice(0, 18) || p.name;
        const color = Number(a.color);
        if (Number.isInteger(color) && color >= 0 && color < 15) {
          if (r.players.some((q) => q.id !== p.id && q.color === color))
            throw Error("Этот цвет уже занят.");
          p.color = color;
        }
        return;
      }
      if (["settings", "bots", "start", "again"].includes(a.type)) {
        if (r.host !== p.id)
          throw Error("Это может сделать только капитан комнаты.");
        if (a.type === "again" && r.phase === "ended") {
          r.phase = "lobby";
          r.bodies = [];
          for (const q of r.players) {
            q.alive = true;
            q.role = "crew";
          }
          return;
        }
        if (r.phase !== "lobby") throw Error("Настройки доступны в лобби.");
        if (a.type === "settings") {
          const s = normalizeSettings({ ...r.settings, ...a.settings });
          s.max = Math.max(s.max, r.players.length);
          r.settings = s;
        }
        if (a.type === "bots")
          addBots(
            r,
            Math.min(Number(a.count) || 1, r.settings.max - r.players.length),
          );
        if (a.type === "start") start(r);
        return;
      }
      const result = action(r, p, a);
      if (result) send(ws, { type: "result", request: a.request, ...result });
    } catch (error) {
      send(ws, { type: "error", message: error.message, request: a?.request });
    }
  });
  ws.on("close", () => {
    detach(c);
    clients.delete(ws);
  });
  ws.on("error", () => {});
});
setInterval(() => {
  const t = Date.now();
  for (const r of rooms.values()) tick(r, t);
  for (const [ws, c] of clients) {
    const r = rooms.get(c.room);
    if (r) {
      const state = view(r, c.id, t);
      state.chat = state.chat.filter(
        (m) =>
          !m.dead ||
          r.phase === "ended" ||
          !r.players.find((p) => p.id === c.id)?.alive,
      );
      send(ws, { type: "state", state });
    }
  }
}, 50);
setInterval(() => {
  for (const [ws, c] of clients) {
    if (!c.alive) {
      ws.terminate();
      continue;
    }
    c.alive = false;
    ws.ping();
  }
  for (const [code, r] of rooms)
    if (
      !r.players.some((p) => !p.bot) ||
      Date.now() - r.created > 6 * 60 * 60 * 1000
    )
      rooms.delete(code);
}, 30000).unref();
const port = Number(process.env.PORT) || 3000;
server.listen(port, "0.0.0.0", () =>
  process.stdout.write(`Svessa is ready on http://0.0.0.0:${port}\n`),
);
