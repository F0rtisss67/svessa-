import { advanceMotion } from "./motion.js";
import {
  ROLES,
  ROLE,
  COLORS,
  ROOMS,
  TASKS_PER_CREW,
  CORRIDORS,
  FURNITURE,
  MAP_WIDTH,
  MAP_HEIGHT,
  roomAt,
  taskPoint,
  dist,
} from "./shared.js";
const $ = (s) => document.querySelector(s),
  app = $("#app"),
  modalRoot = $("#modal-root");
const markupCache = new WeakMap();
function setMarkup(selector, html) {
  const el = $(selector);
  if (el && markupCache.get(el) !== html) {
    el.innerHTML = html;
    markupCache.set(el, html);
  }
}
function setText(selector, value) {
  const el = $(selector);
  if (el && el.textContent !== value) el.textContent = value;
}
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem("svessa") || "{}");
} catch {}
let profile = { name: saved.name || "Космонавт", color: saved.color || 0 },
  sound = saved.sound !== false,
  stars = Array.from({ length: 130 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.3 + 0.3,
  }));
let page = "home",
  ws,
  state,
  myId,
  gameActive = false,
  lastPhase = "",
  modalType = "",
  pending = null,
  seenEvents = new Set(),
  keys = {},
  serverOffset = 0,
  latestTask = null,
  localPosition = null,
  showMap = false,
  displayRoster = "",
  lastChat = "",
  roomNotice = "",
  socketStatus = "connecting";
const time = () => Date.now() + serverOffset;
function save() {
  try {
    localStorage.setItem("svessa", JSON.stringify({ ...profile, sound }));
  } catch {}
}
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4000);
}
let audioCtx;
function beep(freq = 600) {
  if (!sound) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().catch(() => {});
    const osc = audioCtx.createOscillator(),
      gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.035, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.13);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.14);
  } catch {}
}
function meetingSiren() {
  if (!sound) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().catch(() => {});
    const oscillator = audioCtx.createOscillator(),
      gain = audioCtx.createGain();
    oscillator.type = "triangle";
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    const start = audioCtx.currentTime;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.06, start + 0.05);
    for (let i = 0; i < 6; i++) {
      oscillator.frequency.setValueAtTime(420, start + i * 0.4);
      oscillator.frequency.linearRampToValueAtTime(850, start + i * 0.4 + 0.2);
      oscillator.frequency.linearRampToValueAtTime(420, start + (i + 1) * 0.4);
    }
    gain.gain.setValueAtTime(0.06, start + 2.3);
    gain.gain.linearRampToValueAtTime(0, start + 2.4);
    oscillator.start(start);
    oscillator.stop(start + 2.4);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {}
}
function revealRole(me) {
  const role = ROLE(me.role),
    impostor = role.team === "imp";
  openModal(
    "Твоя роль",
    `<div class="role-reveal ${impostor ? "traitor" : "crew"}"><p class="eyebrow">ТИШЕ… ТВОЙ СЕКРЕТ НА БОРТУ</p><h2>${impostor ? "ПРЕДАТЕЛЬ" : "ЭКИПАЖ"}</h2><div class="reveal-suit">${crewmate(COLORS[me.color])}</div><h3>${role.name}</h3><p>${role.desc}</p><button class="btn full" data-action="close">На борт</button></div>`,
    false,
    "role-reveal",
  );
}
function emergencyPanel() {
  const me = state?.players.find((p) => p.id === myId);
  if (state?.phase !== "game" || !me?.alive || me.rocket) return;
  if (dist(me, { x: 840, y: 600 }) > 110) {
    toast("Подойди к кнопке на центральном посту.");
    return;
  }
  if (!me.emergencies) {
    toast("Ты уже созывал собрание.");
    return;
  }
  if (state.sabotage) {
    toast("Сначала почините реактор!");
    return;
  }
  openModal(
    "Экстренное собрание",
    `<div class="emergency-panel"><p class="hint">Открой защитную крышку и нажми красную кнопку, чтобы созвать экипаж.</p><div class="emergency-console"><button class="emergency-cover" data-action="open-emergency-cover">ПОДНЯТЬ КРЫШКУ ↑</button><button class="emergency-trigger" data-action="confirm-emergency" disabled aria-label="Созвать экстренное собрание">НАЖАТЬ</button></div><p>Осталось собраний: ${me.emergencies}</p></div>`,
    false,
    "emergency-panel",
  );
}
function crewmate(color = "#f17a51", hat = "", cls = "") {
  return `<svg class="${cls}" viewBox="0 0 90 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="g${color.slice(1)}" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".62"/></linearGradient></defs><path d="M19 45H12Q5 45 5 55V78Q5 87 19 85" fill="${color}" stroke="#121b24" stroke-width="5"/><path d="M22 90V102H38V88H53V102H70V47Q70 20 45 20Q19 20 19 47V86Q19 90 22 90Z" fill="url(#g${color.slice(1)})" stroke="#121b24" stroke-width="5" stroke-linejoin="round"/><path d="M43 35H70Q80 35 80 47V55Q80 64 67 64H43Q31 64 31 52V47Q31 35 43 35Z" fill="#9ac6cf" stroke="#121b24" stroke-width="5"/><path d="M44 40H67Q73 40 73 46H42Z" fill="#d7e9e6"/>${hat === "flower" ? '<path d="M43 20V8" stroke="#668c69" stroke-width="4"/><circle cx="43" cy="8" r="9" fill="#eac76d"/><circle cx="43" cy="8" r="4" fill="#735535"/>' : hat === "cap" ? '<path d="M20 29L27 14H60L69 29Z" fill="#37404a"/><path d="M17 28H74" stroke="#151e28" stroke-width="7"/>' : hat === "crown" ? '<path d="M24 24L20 8L35 15L44 2L54 15L68 8L63 24Z" fill="#e0bc68"/>' : ""}</svg>`;
}
function ship() {
  return `<svg class="ship-svg" viewBox="0 0 640 460" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="hull" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d9dbcd"/><stop offset=".5" stop-color="#b3bcaf"/><stop offset="1" stop-color="#667d80"/></linearGradient><linearGradient id="side" x2="0" y2="1"><stop stop-color="#526b76"/><stop offset="1" stop-color="#213c4c"/></linearGradient><linearGradient id="flame"><stop stop-color="#efb777" stop-opacity="0"/><stop offset="1" stop-color="#f3d2a1"/></linearGradient><linearGradient id="glass" x2="1" y2="1"><stop stop-color="#162c3a"/><stop offset="1" stop-color="#55828a"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="5"/></filter></defs><g transform="translate(28 30)"><path d="M128 302L38 351L100 279Z" fill="url(#flame)" opacity=".9"/><path d="M159 325L70 374L131 302Z" fill="url(#flame)" opacity=".8"/><path d="M116 290L32 337" stroke="#d88a5d" stroke-width="13" opacity=".4" filter="url(#glow)"/><path d="M465 122L532 155L505 172L442 140Z" fill="#d7b969"/><path d="M322 278L395 315L461 265L388 235Z" fill="#b7a66d" stroke="#263e4a" stroke-width="3"/><path d="M395 315V327L462 277V265Z" fill="#675f45"/><path d="M295 103L228 64L178 101L244 140Z" fill="#a7b8ac" stroke="#354b4f" stroke-width="3"/><path d="M177 102V118L231 150L244 140Z" fill="#566f73"/><path d="M146 265L182 220L248 258L202 305Z" fill="#365e77" stroke="#1a3444" stroke-width="3"/><path d="M150 269L163 290L193 309L202 305L199 287Z" fill="#172e3e"/><path d="M154 271L189 292L183 305L148 284Z" fill="#f8c786"/><path d="M123 241L155 213L177 225L147 255Z" fill="#304b5a"/><path d="M120 242L123 259L145 271L147 255Z" fill="#152d3a"/><path d="M120 245L143 257L140 267L117 255Z" fill="#f8c786"/><path d="M163 220L349 77Q382 55 415 74L533 143Q563 165 532 190L326 346Q308 360 283 347L153 272Q131 258 150 240Z" fill="url(#side)" stroke="#172f3c" stroke-width="4"/><path d="M157 208L347 66Q380 43 414 63L532 132Q563 153 532 179L326 332Q308 347 283 333L153 258Q132 244 151 226Z" fill="url(#hull)" stroke="#263f48" stroke-width="4"/><path d="M164 218L351 78Q379 58 408 75L521 141Q540 154 520 169L316 319Q307 326 291 317L164 244Q151 236 164 218Z" fill="none" stroke="#e0ded0" stroke-width="2" opacity=".7"/><path d="M293 113L405 177L363 210L250 145Z" fill="#d4b668" stroke="#516772" stroke-width="2"/><path d="M282 122L395 186L378 198L265 133Z" fill="#5e8aa1"/><path d="M224 166L340 232L320 247L204 181Z" fill="#3d627a"/><path d="M205 181L320 247L301 260L186 194Z" fill="#ddba60"/><path d="M361 92L397 82Q406 80 416 87L496 134Q517 147 496 165L455 194L344 130Z" fill="#536b6a" stroke="#314b55" stroke-width="3"/><path d="M373 96L401 94L483 142Q493 147 483 156L456 178L362 124Z" fill="url(#glass)" stroke="#acc3b4" stroke-width="2"/><path d="M409 101L389 140M447 123L427 162" stroke="#a3b7ac" stroke-width="5"/><path d="M365 104L386 92" stroke="#d9e1c9" stroke-width="3"/><path d="M427 190L457 207L476 192L446 175Z" fill="#c3c4ad" stroke="#3b5961" stroke-width="2"/><path d="M230 219L284 250L251 274L198 243Z" fill="#7b8e86" stroke="#425f66" stroke-width="2"/><path d="M234 226L270 247L250 262L214 241Z" fill="#314e5b"/><path d="M233 237L253 247M243 231L263 242" stroke="#a7c0ab" stroke-width="2"/><path d="M273 282L298 296L322 279L298 265Z" fill="#d3b56a"/><path d="M281 281L299 291L313 280L297 271Z" fill="#56788a"/><path d="M309 313L330 297" stroke="#ef7c50" stroke-width="5"/><path d="M180 230L201 242" stroke="#d9dbcb" stroke-width="3"/><text x="315" y="231" fill="#26434d" font-size="15" font-family="monospace" font-weight="bold" transform="rotate(30 315 231)">СВЕССА • 01</text><path d="M457 109L473 84" stroke="#698581" stroke-width="4"/><circle cx="474" cy="81" r="4" fill="#ee9d6b"/><path d="M263 103L259 75" stroke="#75908b" stroke-width="3"/><circle cx="258" cy="72" r="4" fill="#a0c2b3"/><path d="M331 337L335 347M504 207L508 218" stroke="#f2b578" stroke-width="4"/><path d="M183 162L172 148M525 247L539 249M308 47L312 33" stroke="#809283" stroke-width="1"/></g><g fill="#c6bc9b"><circle cx="80" cy="115" r="2"/><circle cx="580" cy="90" r="1.5"/><circle cx="560" cy="329" r="2"/><circle cx="330" cy="405" r="1.5"/><path d="M112 83V95M106 89H118" stroke="#d19a69"/></g></svg>`;
}
const railIcons = [
  ["home", "⌂", "Главная"],
  ["rooms", "⊞", "Комнаты"],
  ["roles", "♙", "Роли"],
  ["map", "⌘", "Карта корабля"],
  ["guide", "ⓘ", "Как играть"],
];
function shell(body) {
  return `<div class="layout"><aside class="rail"><a href="#" class="rail-logo" aria-label="Свесса — главная">✳</a>${railIcons.map(([id, icon, name]) => `<button data-page="${id}" class="${page === id ? "active" : ""}" title="${name}" aria-label="${name}">${icon}</button>`).join("")}<div class="bottom"></div><button data-action="sound" title="Звук" aria-label="Включить или выключить звук">${sound ? "♫" : "♪"}</button><div class="rail-line"></div><button data-action="settings" title="Настройки" aria-label="Настройки">⚙</button></aside><main class="main"><header class="topbar"><a href="#" class="wordmark"><span class="flag"></span><span>СВЕССА<small>КУРС НА ОРБИТУ</small></span></a><nav class="nav"><button data-page="home" class="${page === "home" ? "selected" : ""}">Играть</button><button data-page="roles" class="${page === "roles" ? "selected" : ""}">Роли</button><button data-page="map" class="${page === "map" ? "selected" : ""}">Корабль</button><button data-page="guide" class="${page === "guide" ? "selected" : ""}">Как играть</button></nav><div class="online"><span class="dot"></span><span id="connection-label">${socketStatus === "open" ? "Системы в норме" : "Подключение…"}</span><span class="version">v1.0 · BETA</span></div></header><div class="content">${body}<footer><span>Сделано в Свессе. Для своих. Для космоса. <span class="footer-yellow">✦</span></span><span><span class="flag" style="width:12px;height:8px"></span> Сумская область, Украина · 2026</span></footer></div></main></div>`;
}
function roleCard(r, i) {
  return `<article class="role-card"><div class="role-avatar">${crewmate(COLORS[i % 12], r.id === "kirill" ? "cap" : r.id === "egor" ? "flower" : "")}</div><div><span class="role-tag">СЕКРЕТНАЯ РОЛЬ</span><h3>${r.name}</h3><p>Узнаешь в полёте</p></div></article>`;
}
function home() {
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="tiny-line"></span> Свои люди. Открытый космос.</div><h1>ИЗ СВЕССЫ.<br>С ЛЮБОВЬЮ.<br><em>И ПОДОЗРЕНИЕМ.</em></h1><p>Родной посёлок — далеко. Предатель — рядом.<br>Собери друзей, завари борщ и узнай,<br><strong>кто не долетит до дома.</strong></p><div class="hero-meta"><span><i>♙</i> 4–15 игроков</span><span><i>✧</i> 12 уникальных ролей</span><span><i>◎</i> Прямо в браузере</span></div></div><div class="hero-art"><div class="art-grid"></div><div class="orbit"></div><span class="art-label top">UKR // SVESSA–01</span>${ship()}<span class="route-pin"></span><span class="art-label right">ВЫСОТА: 408 КМ<br><br>КУРС: ДОМОЙ ↗</span><span class="art-label bottom"><span class="dot"></span> ВСЕ СИСТЕМЫ СЛИШКОМ В НОРМЕ</span><span class="edition">SUMY REGION SPACE PROGRAM</span></div></section><section><div class="section-title"><h2><span class="number">01 /</span> На борт, космонавт</h2><small>Одна ссылка. Весь твой экипаж.</small></div><div class="play-grid"><article class="play-card create"><span class="card-icon">⊞</span><span class="corner-arrow">↗</span><h3>Создать комнату</h3><p>Твой корабль. Твои правила.<br>Приглашай своих по коду.</p><button class="card-hit" data-action="create" aria-label="Создать комнату"></button></article><article class="play-card join"><h3>Есть приглашение?</h3><p>Введи код и найди свой экипаж.</p><form class="join-row" id="join-form"><input id="join-code" maxlength="6" minlength="6" autocomplete="off" placeholder="КОД КОМНАТЫ" aria-label="Код комнаты" required pattern="[A-Fa-f0-9]{6}"><button aria-label="Войти в комнату">→</button></form></article><article class="play-card"><span class="card-icon" style="color:#c9cba7">⌁</span><span class="corner-arrow" style="color:#8e9b9e">↗</span><h3>Сначала — тренировка</h3><p>Освой корабль с ботами.<br>Без лишних свидетелей.</p><div class="practice-decoration">${crewmate("#8ba483")}</div><button class="card-hit" data-action="practice" aria-label="Тренировка с ботами"></button></article></div></section><section><div class="section-title"><h2><span class="number">02 /</span> Знакомые лица. Новые секреты.</h2><button class="section-link" data-page="roles">Все 12 ролей <span>↗</span></button></div><div class="roles-grid">${[ROLES[1], ROLES[2], ROLES[5], ROLES[10]].map((r, i) => roleCard(r, [2, 4, 6, 0][i])).join("")}</div></section><div class="mission-strip"><div><div class="mission-title"><span style="color:var(--yellow);font-size:18px">✧</span> Маленький посёлок. Большая космическая история.</div><p>Украинский корабль, знакомые места и задания с домашним привкусом.</p></div><div class="route"><span>СВЕССА</span><span class="route-line"></span><span>ОРБИТА</span><span style="color:var(--accent)">↗</span></div></div>`;
}
function rolesPage() {
  return `<div class="eyebrow">Экипаж с характером</div><h1 class="page-title">У каждого свой секрет.</h1><p class="page-sub">Двенадцать знакомых лиц на одном корабле.<br>Свою роль и её возможности ты узнаешь в начале полёта.</p><div class="filters"><span class="role-tag">12 СЕКРЕТНЫХ РОЛЕЙ</span></div><div class="all-roles">${ROLES.map((r, i) => `<article class="detail-role"><div class="role-top"><div class="role-avatar">${crewmate(COLORS[i], i === 1 ? "cap" : "")}</div><div><span class="role-tag">СЕКРЕТНАЯ РОЛЬ</span><h3>${r.name}</h3></div></div></article>`).join("")}</div>`;
}
function guide() {
  return `<div class="eyebrow">Перед первым полётом</div><h1 class="page-title">Доверяй. Но проверяй.</h1><p class="page-sub">Создай комнату, отправь друзьям код и вместе отправляйтесь на орбиту.</p><div class="instruction-grid"><article class="instruction-card"><span class="step">01</span><h3>Займи своё место</h3><p>От 4 до 15 игроков, до 3 предателей. Выбери цвет костюма и имя. Капитан настраивает скорость и голосование. Не хватает своих? Добавь ботов.</p></article><article class="instruction-card"><span class="step">02</span><h3>Выполни свою миссию</h3><p>Мирные чинят проводку, поливают огурцы и собирают борщ. Заполните шкалу заданий или выгоните всех предателей. Призраки продолжают задания!</p></article><article class="instruction-card"><span class="step">03</span><h3>Найди чужого</h3><p>Заметил тело — сообщи. Обсуждайте в чате и голосуйте. Предатели побеждают, когда остаётся один мирный или взрывается реактор. На починку реактора есть 45 секунд.</p></article></div><div class="instruction-card" style="margin-top:20px"><h3>Панель управления</h3><p><span class="key">W A S D</span> / <span class="key">↑ ← ↓ →</span> — движение и направление взгляда &nbsp; <span class="key">E</span> — задание &nbsp; <span class="key">R</span> — сообщить о теле &nbsp; <span class="key">M</span> — карта<br>На телефоне используй стрелки и кнопки на экране. Люки находятся в левом нижнем углу комнат. Экстренная кнопка — на центральном посту.<br>У всех предателей: убийство с перезарядкой 20 секунд, вентиляция и три саботажа. После собраний действует защита от особых атак. Боты умеют ходить, выполнять задания, убивать и сообщать о телах; обсуждения — за людьми.</p><button class="btn" data-action="practice">Попробовать с ботами ↗</button></div>`;
}
function roomsPage() {
  return `<div class="eyebrow">Ищем своих</div><h1 class="page-title">Открытый космос. Открытые комнаты.</h1><p class="page-sub">Присоединяйся к экипажу или собери собственный.</p><div style="display:flex;gap:12px;margin-bottom:25px"><button class="btn" data-action="create">⊞ Создать комнату</button><button class="btn secondary" data-action="refresh">Обновить ↻</button></div><div id="public-rooms"><p class="hint">Проверяем связь с кораблями…</p></div>`;
}
function render() {
  if (gameActive) return;
  if (state?.phase === "lobby") {
    renderLobby();
    return;
  }
  app.innerHTML = shell(
    page === "roles"
      ? rolesPage()
      : page === "guide"
        ? guide()
        : page === "map"
          ? `<div class="eyebrow">СВЕССА НАСОС–1 / план палубы</div><h1 class="page-title">Родные места. Новая высота.</h1><p class="page-sub">${ROOMS.length} отсеков, вентиляционная сеть и одна кнопка, которую лучше не трогать без причины.</p><canvas id="map-preview" class="map-preview"></canvas>`
          : page === "rooms"
            ? roomsPage()
            : home(),
  );
  if (page === "rooms") send({ type: "list" });
  if (page === "map") drawMapPreview();
}
function openModal(title, body, wide = false, type = "generic") {
  modalType = type;
  modalRoot.innerHTML = `<div class="overlay"><section class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${title}</h2><button class="close" data-action="close" aria-label="Закрыть">×</button></div>${body}</section></div>`;
  modalRoot.querySelector("input,select,button.btn")?.focus();
  stopMovement();
}
function closeModal() {
  if (modalType === "meeting" || modalType === "end") return;
  modalRoot.innerHTML = "";
  modalType = "";
  latestTask = null;
}
function colorPicker() {
  return `<div class="colors">${COLORS.map((c, i) => `<button type="button" class="color ${profile.color === i ? "active" : ""}" style="background:${c}" data-color="${i}" aria-label="Цвет костюма ${i + 1}" aria-pressed="${profile.color === i}"></button>`).join("")}</div>`;
}
function createDialog(practice = false) {
  openModal(
    practice ? "Учебный полёт" : "Новый экипаж",
    `<form id="create-form"><input type="hidden" name="practice" value="${practice}"><div class="field"><label for="player-name">Твой позывной</label><input id="player-name" name="name" value="${esc(profile.name)}" maxlength="18" required></div><label class="hint">Цвет скафандра</label>${colorPicker()}${
      practice
        ? `<div class="field"><label for="practice-role">Твоя роль</label><select id="practice-role" name="role"><option value="random">Случайная роль</option>${ROLES.map((r) => `<option value="${r.id}">${r.name}</option>`).join("")}</select></div><p class="hint">На борту будут ещё 7 ботов. Все способности, задания и саботажи доступны в обычном режиме.</p>`
        : `<div class="field"><label for="room-name">Название комнаты</label><input id="room-name" name="roomName" value="Экипаж Свессы" maxlength="28" required></div><div class="two-fields"><div class="field"><label for="max-players">Мест на борту</label><select id="max-players" name="max">${[6, 8, 10, 12, 15].map((n) => `<option ${n === 10 ? "selected" : ""}>${n}</option>`).join("")}</select></div><div class="field"><label for="impostors">Предателей</label><select id="impostors" name="impostors"><option>1</option><option>2</option><option>3</option></select></div></div><label class="hint"><input type="checkbox" name="public"> Показывать в открытых комнатах</label>`
    }<button class="btn full" type="submit">${practice ? "Начать тренировку" : "Создать комнату"} <span>↗</span></button><p class="hint" style="text-align:center;margin-bottom:0">${practice ? "Борщ будет. Последствия — тоже." : "Друзья смогут присоединиться по коду комнаты."}</p></form>`,
    false,
    "create",
  );
}
function joinDialog(code) {
  openModal(
    "Добро пожаловать на борт",
    `<form id="join-details"><div class="field"><label>Код комнаты</label><input name="code" value="${esc(code)}" required maxlength="6" pattern="[A-Fa-f0-9]{6}" style="letter-spacing:4px;text-transform:uppercase"></div><div class="field"><label>Твой позывной</label><input name="name" value="${esc(profile.name)}" maxlength="18" required></div>${colorPicker()}<button class="btn full">Войти в экипаж ↗</button></form>`,
    false,
    "join",
  );
}
function settingsDialog() {
  if (state?.phase === "lobby" && state.host === myId) {
    const s = state.settings;
    openModal(
      "Правила корабля",
      `<form id="lobby-settings"><div class="two-fields"><div class="field"><label>Вместимость</label><select name="max">${[
        4, 6, 8, 10, 12, 15,
      ]
        .filter((n) => n >= state.players.length)
        .map((n) => `<option ${n === s.max ? "selected" : ""}>${n}</option>`)
        .join(
          "",
        )}</select></div><div class="field"><label>Предатели</label><select name="impostors">${[1, 2, 3].map((n) => `<option ${n === s.impostors ? "selected" : ""}>${n}</option>`).join("")}</select></div><div class="field"><label>Скорость</label><select name="speed">${[0.75, 1, 1.25, 1.5].map((n) => `<option ${n === s.speed ? "selected" : ""}>${n}</option>`).join("")}</select></div><div class="field"><label>Голосование, сек</label><select name="meeting">${[20, 30, 45, 60, 90].map((n) => `<option ${n === s.meeting ? "selected" : ""}>${n}</option>`).join("")}</select></div></div><p class="hint">На каждых 3 игроков доступен один предатель; всегда остаётся минимум 3 мирных. Роли случайны, повторения возможны.</p><button class="btn full">Сохранить правила</button></form>`,
      false,
      "settings",
    );
    return;
  }
  openModal(
    "Настройки",
    `<form id="profile-settings"><div class="field"><label>Твой позывной</label><input name="name" value="${esc(profile.name)}" maxlength="18" required ${gameActive ? "disabled" : ""}></div>${!gameActive ? colorPicker() : ""}<div class="field"><label><input style="width:auto" type="checkbox" name="sound" ${sound ? "checked" : ""}> Звуки корабля</label></div><p class="hint">Управление: WASD / стрелки. E — задание, R — тело, M — карта. Звуки включаются после первого действия.</p><button class="btn full">Сохранить</button></form>`,
    false,
    "settings",
  );
}
function renderLobby() {
  const r = state,
    me = r.players.find((p) => p.id === myId);
  if (!me) return;
  app.innerHTML = shell(
    `<div style="display:flex;align-items:center;justify-content:space-between"><div><div class="eyebrow">Посадка открыта / ${r.settings.practice ? "учебный полёт" : "онлайн"}</div><h1 class="page-title">${esc(r.settings.name)}</h1><p class="page-sub" style="margin-bottom:0">До старта — один экипаж. После старта — как повезёт.</p></div><button class="btn secondary" data-action="leave">Покинуть</button></div><div class="lobby-grid"><div><div class="lobby-stage"><div class="art-grid"></div><div style="position:absolute;inset:50% -20% -70%;border:2px solid #53616b;transform:perspective(400px) rotateX(42deg);border-radius:50%;background:repeating-linear-gradient(0deg,#2c3c4840 0 1px,transparent 1px 45px),repeating-linear-gradient(90deg,#2c3c4840 0 1px,transparent 1px 45px)"></div><div class="lobby-crew" id="lobby-crew">${lobbyPlayers(r)}</div><div class="lobby-caption">СВЕССА–01 · ПОДГОТОВКА К ВЫЛЕТУ</div></div><div class="chat"><div class="chat-log" id="chat-log"></div><form id="chat-form"><input name="message" maxlength="220" placeholder="Скажи экипажу пару слов… Enter — отправить" aria-label="Сообщение экипажу" autocomplete="off"></form></div></div><aside><div class="lobby-code"><p>КОД ПРИГЛАШЕНИЯ</p><div class="code">${r.code}<button data-action="copy" aria-label="Скопировать код">⧉</button></div><p style="margin-top:15px;line-height:1.7;margin-bottom:0">Друзья открывают этот сайт<br>и вводят код на главной.</p></div><div class="roster"><h3>На борту <span id="roster-count">${r.players.length}</span> / ${r.settings.max}</h3><div id="roster-list">${roster(r)}</div><button class="btn secondary full" data-action="customize">Цвет и позывной</button></div>${r.host === myId ? `<div style="display:flex;gap:8px;margin-top:15px"><button class="btn secondary" style="flex:1" data-action="bots">+ Бот</button><button class="btn secondary" data-action="settings">⚙ Правила</button></div><button class="btn full" data-action="start">Начать полёт ↗</button><p class="hint" style="text-align:center">${r.players.length < 4 ? "Нужно минимум 4 игрока. Добавь ботов." : `${Math.min(r.settings.impostors, Math.floor((r.players.length - 1) / 3))} предатель · ${TASKS_PER_CREW} заданий на мирного`}</p>` : '<p class="hint" style="text-align:center">Капитан готовит корабль к вылету.</p>'}</aside></div>`,
  );
  displayRoster = JSON.stringify(
    r.players.map((p) => [p.id, p.name, p.color, p.connected]),
  );
  updateChat();
}
function lobbyPlayers(r) {
  return r.players
    .map(
      (p) =>
        `<div class="waiting-player">${crewmate(COLORS[p.color], p.id === r.host ? "crown" : "")}<strong>${esc(p.name)}${p.id === myId ? " · ты" : ""}</strong><small>${p.bot ? "БОТ" : p.id === r.host ? "КАПИТАН" : "ЭКИПАЖ"}</small></div>`,
    )
    .join("");
}
function roster(r) {
  return r.players
    .map(
      (p) =>
        `<div class="roster-row"><i style="background:${COLORS[p.color]}"></i>${esc(p.name)}<span>${p.bot ? "бот" : p.id === r.host ? "капитан" : p.id === myId ? "ты" : "на борту"}</span></div>`,
    )
    .join("");
}
function updateChat() {
  const el = $("#chat-log");
  if (!el) return;
  const chat = JSON.stringify(state.chat);
  if (chat === lastChat && el.innerHTML) return;
  lastChat = chat;
  el.innerHTML =
    state.chat
      .map(
        (m) =>
          `<div><b>${esc(m.name)}${m.dead ? " 👻" : ""}:</b> ${esc(m.text)}</div>`,
      )
      .join("") ||
    '<span style="color:#6e8292">Связь установлена. Здесь можно обсудить полёт.</span>';
  el.scrollTop = el.scrollHeight;
}
function send(obj) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
    return true;
  }
  toast("Нет связи с сервером. Подождите подключения.");
  return false;
}
function connect() {
  ws = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/socket`,
  );
  ws.onopen = () => {
    socketStatus = "open";
    if ($("#connection-label"))
      $("#connection-label").textContent = "Системы в норме";
  };
  ws.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.type === "joined") {
      myId = m.id;
      seenEvents.clear();
      closeModal();
    }
    if (m.type === "state") {
      const prev = state;
      state = m.state;
      serverOffset = state.now - Date.now();
      onState(prev);
    }
    if (m.type === "error") {
      toast(m.message);
      if (m.request) {
        latestTask = null;
      }
    }
    if (m.type === "left") {
      state = null;
      myId = null;
      gameActive = false;
      lastPhase = "";
      modalType = "";
      modalRoot.innerHTML = "";
      page = "home";
      render();
    }
    if (m.type === "rooms") {
      const el = $("#public-rooms");
      if (el)
        el.innerHTML = m.rooms.length
          ? `<div class="room-list">${m.rooms.map((r) => `<article class="public-room"><div><h3>${esc(r.name)}</h3><small>${r.count} / ${r.max} на борту · ${r.code}</small></div><button class="btn secondary" data-join="${r.code}">Войти ↗</button></article>`).join("")}</div>`
          : '<div class="instruction-card"><h3>Корабли ещё у причала.</h3><p>Открытых комнат пока нет. Создай свою — и позови друзей.</p><button class="btn" data-action="create">Создать комнату ↗</button></div>';
    }
    if (m.type === "result") {
      if (m.instant) {
        toast("Задание выполнено мгновенно!");
        latestTask = null;
      }
      if (m.task) taskDialog(m.task);
    }
  };
  ws.onclose = () => {
    socketStatus = "closed";
    if (state) {
      gameActive = false;
      state = null;
      myId = null;
      modalType = "";
      modalRoot.innerHTML = "";
      lastPhase = "";
      render();
      toast("Соединение прервано. Вернись в комнату или создай новую.");
    }
    if ($("#connection-label"))
      $("#connection-label").textContent = "Восстанавливаем связь…";
    setTimeout(connect, 2000);
  };
  ws.onerror = () => {};
}
function onState(prev) {
  if (state.phase === "lobby") {
    if (lastPhase === "ended") {
      modalType = "";
      modalRoot.innerHTML = "";
    }
    gameActive = false;
    if (
      lastPhase !== "lobby" ||
      displayRoster !==
        JSON.stringify(
          state.players.map((p) => [p.id, p.name, p.color, p.connected]),
        ) ||
      JSON.stringify(prev?.settings) !== JSON.stringify(state.settings)
    ) {
      renderLobby();
    }
    updateChat();
    if (pending === "practice") {
      pending = null;
      send({ type: "bots", count: 7 });
      send({ type: "start" });
    }
  } else if (state.phase === "game") {
    const me = state.players.find((p) => p.id === myId);
    if (lastPhase !== "game") {
      modalType = "";
      modalRoot.innerHTML = "";
      gameActive = true;
      renderGame();
      if (lastPhase === "lobby") {
        toast(
          `Твоя роль — ${ROLE(me.role).name}. ${ROLE(me.role).team === "imp" ? "Обмани экипаж." : "Верни корабль домой."}`,
        );
        beep(450);
        revealRole(me);
      }
    }
    if (prev?.players.find((p) => p.id === myId)?.alive && !me.alive) {
      toast("Ты погиб. Призраки экипажа могут выполнять задания.");
      beep(180);
      closeModal();
    }
    updateHud();
  } else if (state.phase === "meeting") {
    gameActive = true;
    if (lastPhase !== "meeting") {
      stopMovement();
      meetingSiren();
    }
    renderMeeting();
  } else if (state.phase === "ended") {
    gameActive = true;
    if (lastPhase !== "ended") endDialog();
  }
  updateChat();
  lastPhase = state.phase;
  for (const e of state.events || []) {
    if (!seenEvents.has(e.id)) {
      seenEvents.add(e.id);
      if (time() - e.t < 2500 && state.phase !== "ended") toast(e.text);
    }
  }
}
function renderGame() {
  app.innerHTML = `<div class="game-shell"><canvas id="game-canvas" class="game-canvas" aria-label="Карта корабля, управление WASD"></canvas><div class="game-top"><div class="progress-panel"><div class="progress-title"><span>ОБЩИЕ ЗАДАНИЯ</span><strong id="progress-number">0%</strong></div><div class="progress-track"><div id="progress-fill" class="progress-fill"></div></div></div><button class="game-identity" id="game-identity" data-action="role-info" aria-label="Моя роль и способности"></button><div class="game-utilities"><button data-action="toggle-map" aria-label="Карта" title="Карта (M)">⌘</button><button data-action="game-chat" aria-label="Чат" title="Чат">☷</button><button data-action="game-menu" aria-label="Меню">⚙</button></div></div><div class="task-list" id="task-list"></div><div class="role-help" id="role-help"></div><div class="location" id="location"></div><div id="reactor-alert"></div><div class="game-actions" id="game-actions"></div><div class="mobile-controls"><button data-key="w" aria-label="Вверх">↑</button><button data-key="a" aria-label="Влево">←</button><button data-key="s" aria-label="Вниз">↓</button><button data-key="d" aria-label="Вправо">→</button></div><div id="flash-root"></div></div>`;
  localPosition = null;
  drawPositions.clear();
}
const skillImages = new Set([
  "puddle",
  "kill",
  "armor",
  "coin",
  "wall",
  "borscht",
  "task",
]);
const symbols = {
  kill: "†",
  borscht: "♨",
  wall: "▦",
  coin: "◉",
  armor: "◇",
  puddle: "≋",
  teleport: "⌁",
  knees: "⌖",
  beauty: "✷",
  shock: "ϟ",
  breach: "⚒",
  selfbomb: "✹",
  plant: "◉",
  detonate: "✹",
  rocket: "➶",
  laser: "☀",
};
function updateHud() {
  if (!$("#game-actions")) return;
  const me = state.players.find((p) => p.id === myId),
    r = ROLE(me.role),
    imp = r.team === "imp",
    t = time();
  setText("#progress-number", `${Math.round(state.progress)}%`);
  const progressWidth = `${state.progress}%`;
  if ($("#progress-fill").style.width !== progressWidth)
    $("#progress-fill").style.width = progressWidth;
  setMarkup(
    "#game-identity",
    `<strong style="color:${imp ? "#f4907e" : "#b4cca8"}">${esc(me.name)} · ${r.name}${!me.alive ? " 👻" : ""}</strong><small>${me.rocket ? "УПРАВЛЯЙ РАКЕТОЙ · WASD" : !me.alive ? "ПРИЗРАК · ПОМОГИ С ЗАДАНИЯМИ" : imp ? "ПРЕДАТЕЛЬ · НЕ ВЫДАЙ СЕБЯ" : "ЭКИПАЖ · КУРС НА ДОМ"}</small>`,
  );
  setMarkup(
    "#task-list",
    `<h3>${imp ? "ТВОЯ МИССИЯ" : "ТВОИ ЗАДАНИЯ"}</h3>${imp ? "<p>Устрани экипаж или взорви реактор. Твои союзники отмечены красным.</p>" : me.tasks.map((q) => `<p class="${q.done ? "done" : ""}">${q.done ? "✓" : "◇"} ${ROOMS.find((r) => r.id === q.room)?.task}</p>`).join("")}${me.armor > t ? '<p style="color:#a7cfed">◇ Броня активна ' + Math.ceil((me.armor - t) / 1000) + "с</p>" : ""}${me.role === "farmer" ? `<p>Ошибки: ${me.misses || 0} / 3</p>` : ""}`,
  );
  setMarkup(
    "#role-help",
    `<strong style="color:#d5dcd7">${r.name}</strong><br>${r.desc}<br><span style="color:#6e8494">WASD — ходить · E — задание · M — карта</span>`,
  );
  setText("#location", roomAt(me.x, me.y)?.name || "СОЕДИНИТЕЛЬНЫЙ КОРИДОР");
  const actionButton = (key, name, style = "", cd = 0, sym = "") =>
    `<button class="action ${style}" data-game="${key}" aria-label="${name}${cd > 0 ? `, перезарядка ${cd} секунд` : ""}" ${cd > 0 ? "disabled" : ""}><span class="action-orb"><span class="action-symbol">${skillImages.has(key.replace("skill:", "")) ? `<img class="skill-art" src="/assets/skills/${key.replace("skill:", "")}.webp" alt="" width="64" height="64">` : sym || symbols[key] || "✦"}</span>${cd > 0 ? `<small class="action-cooldown">${cd}</small>` : ""}</span><span class="action-label">${name}</span></button>`;
  let buttons = "";
  if (me.alive && !me.rocket) {
    if (imp) {
      buttons += actionButton(
        "sabotage",
        "Саботаж",
        "gold",
        Math.max(0, Math.ceil(((me.cooldowns?.sabotage || 0) - t) / 1000)),
        "ϟ",
      );
      buttons += actionButton("vent", "Вентиляция", "", "", "▤");
      buttons += actionButton(
        "kill",
        "Убить",
        "red",
        Math.max(0, Math.ceil(((me.cooldowns?.kill || 0) - t) / 1000)),
      );
    }
    for (const s of r.skills) {
      let cd = Math.max(0, Math.ceil(((me.cooldowns?.[s[0]] || 0) - t) / 1000));
      if (["beauty", "shock", "rocket", "selfbomb"].includes(s[0]))
        cd = Math.max(
          cd,
          Math.ceil(
            (state.resumed +
              (["selfbomb"].includes(s[0]) ? 20000 : 10000) -
              t) /
              1000,
          ),
        );
      buttons += actionButton(
        "skill:" + s[0],
        s[1],
        imp ? "red" : "",
        cd,
        symbols[s[0]],
      );
    }
    if (me.meal)
      buttons += actionButton("consume", "Борщевая тяга", "gold", 0, "♨");
    if (state.bodies.some((b) => dist(me, b) < 125))
      buttons += actionButton("report", "Сообщить", "gold", 0, "!");
    if (dist(me, { x: 840, y: 600 }) < 110)
      buttons += actionButton("meeting", "Собрание", "gold", 0, "◉");
    const room = roomAt(me.x, me.y);
    if (
      room &&
      ((room.id === "electric" && state.lights > t) ||
        (room.id === "reactor" && state.sabotage))
    )
      buttons += actionButton("repair", "Починить", "gold", 0, "⚒");
  }
  if (
    !imp &&
    me.tasks.some(
      (q) =>
        !q.done &&
        dist(me, taskPoint(ROOMS.find((r) => r.id === q.room))) < 110,
    )
  )
    buttons += actionButton("task", "Задание", "gold", 0, "▣");
  setMarkup("#game-actions", buttons);
  setMarkup(
    "#reactor-alert",
    state.sabotage
      ? `<div class="reactor-alert">⚠ Реактор: ${Math.max(0, Math.ceil((state.sabotage.until - t) / 1000))}с · Срочно в машинный отсек</div>`
      : "",
  );
  setMarkup(
    "#flash-root",
    me.blindUntil > t ? '<div class="flash"></div>' : "",
  );
}
function chooseRoom(kind) {
  openModal(
    kind === "teleport" ? "Куда телепортироваться?" : "Вентиляционная сеть",
    `<p class="hint">${kind === "teleport" ? "Выбери отсек корабля." : "Сначала подойди к люку в левом нижнем углу комнаты."}</p><div class="vote-grid">${ROOMS.map((r) => `<button class="btn secondary" data-destination="${r.id}" data-kind="${kind}">${r.name}</button>`).join("")}</div>`,
  );
}
function gameAction(key) {
  if (!state) return;
  if (key === "meeting") {
    emergencyPanel();
    return;
  }
  if (key.startsWith("skill:")) {
    const skill = key.slice(6);
    if (skill === "teleport") {
      chooseRoom("teleport");
      return;
    }
    if (skill === "coin") {
      openModal(
        "Саня ставит на удачу",
        `<p class="hint">Угадал — +10% общих заданий. Три ошибки за игру — прощай, космос.</p><div class="task-area"><div class="large-symbol" style="color:var(--yellow)">◉</div><button class="btn" data-bet="heads">Орёл</button><button class="btn secondary" data-bet="tails">Решка</button></div>`,
      );
      return;
    }
    if (skill === "selfbomb") {
      openModal(
        "Последний фейерверк",
        `<p class="hint">Самоподрыв убьёт тебя и до 5 мирных в радиусе 300 единиц. Ты уверен?</p><button class="btn danger full" data-confirm-skill="selfbomb">Да. Детонировать.</button>`,
      );
      return;
    }
    send({ type: "skill", key: skill });
    beep();
    return;
  }
  if (key === "sabotage") {
    openModal(
      "Системы корабля",
      `<p class="hint">Один саботаж каждые 30 секунд. Реактор взорвётся через 45 сек, если его не починят.</p><div style="display:grid;gap:12px"><button class="btn secondary" data-sabotage="lights">ϟ Отключить электричество</button><button class="btn danger" data-sabotage="reactor">⚠ Повредить реактор «Свеснасос»</button><button class="btn secondary" data-sabotage="doors">▥ Закрыть двери на 10 секунд</button></div>`,
    );
    return;
  }
  if (key === "vent") {
    chooseRoom("vent");
    return;
  }
  if (key === "task") {
    const me = state.players.find((p) => p.id === myId),
      task = me.tasks.find(
        (q) =>
          !q.done &&
          dist(me, taskPoint(ROOMS.find((r) => r.id === q.room))) < 110,
      );
    if (task) {
      latestTask = task.room;
      send({ type: "taskStart", room: task.room, request: "task" });
    } else toast("Подойди к жёлтому терминалу задания.");
    return;
  }
  send({ type: key });
  beep();
}
let taskData,
  taskStarted,
  taskIndex = 0,
  wireLeft = null;
function taskDialog(task) {
  taskData = task;
  taskStarted = performance.now();
  taskIndex = 0;
  wireLeft = null;
  const room = ROOMS.find((r) => r.id === task.room);
  openModal(
    room.task,
    `<p class="hint">${task.kind === "wires" ? "Соедини пары одного цвета: сначала левый провод, затем правый." : task.kind === "order" ? "Повтори последовательность символов слева направо." : "Нажимай подсвеченную кнопку. Все пять систем должны ответить."}</p><div class="task-area" id="task-area"></div><p class="hint" id="task-status" style="text-align:center">0 / ${task.sequence.length}</p>`,
    false,
    "task",
  );
  drawTask();
}
function drawTask() {
  const area = $("#task-area");
  if (!area) return;
  const t = taskData;
  if (taskIndex >= t.sequence.length) {
    area.innerHTML =
      '<div class="large-symbol" style="color:#9ac69d">✓</div><p>Системы готовы</p><button class="btn" id="task-submit">Завершить задание</button>';
    const finish = $("#task-submit");
    const wait = Math.max(0, 1550 - (performance.now() - taskStarted));
    finish.disabled = wait > 0;
    if (wait)
      setTimeout(() => {
        if (finish.isConnected) finish.disabled = false;
      }, wait);
    return;
  }
  if (t.kind === "wires") {
    const colors = ["#ef815f", "#84b7da", "#e2c568"];
    area.innerHTML = [0, 1, 2]
      .map(
        (n, i) =>
          `<div class="wire-row"><button class="wire ${t.sequence.slice(0, taskIndex).includes(n) ? "connected" : ""} ${wireLeft === n ? "picked" : ""}" data-wire-left="${n}" style="--wire:${colors[n]}">● ━━━</button><button class="wire ${t.sequence.slice(0, taskIndex).includes(2 - n) ? "connected" : ""}" data-wire-right="${2 - n}" style="--wire:${colors[2 - n]}">━━━ ●</button></div>`,
      )
      .join("");
    $("#task-status").textContent =
      `${taskIndex} / 3 · слева выбери ${["оранжевый", "синий", "жёлтый"][t.sequence[taskIndex]]}`;
  } else {
    const icons =
      t.room === "greenhouse"
        ? ["💧", "🥒", "☀", "🌱"]
        : t.room === "bridge"
          ? ["↑", "→", "↓", "←"]
          : t.room === "kitchen"
            ? ["🥕", "🧅", "🥔", "🍅"]
            : t.room === "cargo"
              ? ["📦", "✉", "🌻", "⌂"]
              : t.room === "workshop"
                ? ["⚙", "🔧", "🔩", "⚒"]
                : t.room === "grain"
                  ? ["🌾", "🌻", "🫘", "🌽"]
                  : t.room === "water"
                    ? ["💧", "◉", "≈", "✓"]
                    : ["ϟ", "✦", "◉", "◇"];
    area.innerHTML = `${t.kind === "order" ? `<div style="font-size:28px;letter-spacing:9px;margin:16px 0">${t.sequence.map((n, i) => `<span style="opacity:${i < taskIndex ? 0.2 : 1};color:${i === taskIndex ? "#ff774f" : "inherit"}">${icons[n]}</span>`).join("")}</div>` : '<div class="large-symbol">ϟ</div>'}<div>${icons.map((s, i) => `<button class="btn ${t.kind !== "order" && i === t.sequence[taskIndex] ? "" : "secondary"}" data-task-choice="${i}" style="font-size:24px;min-width:55px">${s}</button>`).join("")}</div>`;
    $("#task-status").textContent = `${taskIndex} / ${t.sequence.length}`;
  }
}
function renderMeeting() {
  if (modalType !== "meeting") {
    openModal(
      "Кого оставим за бортом?",
      `<div class="eyebrow">${esc(state.meeting.reason)}</div><p class="hint">Собрание созывает ${esc(state.meeting.by)}. Обсудите улики и выберите подозреваемого.</p><div class="meeting-timer" id="meeting-timer"></div><div class="chat"><div class="chat-log" id="chat-log"></div><form id="chat-form"><input name="message" placeholder="Что ты видел?" maxlength="220" autocomplete="off" aria-label="Сообщение на собрании"></form></div><div id="vote-grid" class="vote-grid"></div><div id="vote-footer"></div>`,
      true,
      "meeting",
    );
  }
  const m = state.meeting,
    me = state.players.find((p) => p.id === myId);
  setText(
    "#meeting-timer",
    `${Math.max(0, Math.ceil((m.until - time()) / 1000))} сек`,
  );
  const grid = state.players
    .map(
      (p) =>
        `<div class="meeting-player" style="opacity:${p.alive ? 1 : 0.35}">${crewmate(COLORS[p.color])}<span>${esc(p.name)}${p.id === myId ? " (ты)" : ""}<small style="display:block;font-size:9px;color:#778d9c">${!p.alive ? "ВЫБЫЛ" : m.votes.includes(p.id) ? "ГОЛОС ПРИНЯТ" : "НА БОРТУ"}</small></span>${p.alive && me.alive && !m.mine ? `<button class="btn secondary" data-vote="${p.id}" style="padding:8px;font-size:10px">Выбрать</button>` : ""}</div>`,
    )
    .join("");
  setMarkup("#vote-grid", grid);
  const footer = m.mine
    ? '<p class="hint">Твой голос принят. Ждём экипаж.</p>'
    : me.alive
      ? '<button class="btn secondary full" data-vote="skip">Пропустить голосование</button>'
      : '<p class="hint">Призраки наблюдают за голосованием.</p>';
  setMarkup("#vote-footer", footer);
  updateChat();
}
function endDialog() {
  const me = state.players.find((p) => p.id === myId),
    win = ROLE(me.role).team === state.winner;
  openModal(
    win ? "Победа. Курс домой!" : "Этот полёт окончен",
    `<div style="display:flex;justify-content:center;height:115px">${crewmate(COLORS[me.color], win ? "crown" : "")}</div><p style="text-align:center;font-size:18px;color:${state.winner === "crew" ? "#adcba0" : "#f08b75"}">${state.winner === "crew" ? "Экипаж спасён" : "Предатели победили"}</p><p class="hint" style="text-align:center">${esc(state.reason)}</p><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:20px 0">${state.players.map((p) => `<span class="skill-pill" style="color:${ROLE(p.role).team === "imp" ? "#ef917e" : "#adc5aa"}">${esc(p.name)} · ${ROLE(p.role).name}</span>`).join("")}</div>${state.host === myId ? '<button class="btn full" data-action="again">Вернуться в лобби ↗</button>' : '<p class="hint">Ждём капитана, чтобы вернуться в лобби.</p>'}<button class="btn secondary full" data-action="leave">На главную</button>`,
    true,
    "end",
  );
}
let cameraView,
  ctx,
  canvas,
  screenW = 0,
  screenH = 0,
  drawPositions = new Map();
function rounded(c, x, y, w, h, r = 8, fill, stroke) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
  }
}
function drawPerson(c, p, ghost = false) {
  const color = COLORS[p.color] || COLORS[0];
  const stride = Math.sin(p.phase || 0) * (p.strength || 0);
  const bob = Math.abs(stride) * 2;
  c.save();
  c.translate(p.x, p.y);
  if (ghost) c.globalAlpha = 0.35;
  c.fillStyle = "#0005";
  c.beginPath();
  c.ellipse(0, 23, 22, 7, 0, 0, 7);
  c.fill();
  c.translate(0, -bob);
  c.lineWidth = 3;
  // Opposite feet alternate while the suit gently rises on each step.
  rounded(
    c,
    -13 - stride * 4,
    14 + Math.max(0, stride) * 3,
    12,
    17,
    4,
    color,
    "#152530",
  );
  rounded(
    c,
    9 + stride * 4,
    14 + Math.max(0, -stride) * 3,
    12,
    17,
    4,
    color,
    "#152530",
  );
  rounded(c, -24, -10, 12, 28, 4, color, "#152530");
  rounded(c, -15, -25, 37, 49, 15, color, "#152530");
  const flip = p.fx < -0.1;
  c.save();
  if (flip) {
    c.translate(6, 0);
    c.scale(-1, 1);
  }
  rounded(c, -2, -18, 30, 20, 7, "#99bdc7", "#142d3d");
  rounded(c, 2, -15, 21, 5, 3, "#d7e8e6");
  c.restore();
  c.restore();
}
// The deck geometry is painted once; live markers and characters remain dynamic.
let deckCache = null;
// Extruded, opaque fixtures are drawn from the same footprints used by physics.
function drawFurniture(c, item) {
  const { x, y, w, h, kind } = item;
  const palette = {
    desk: ["#b88c62", "#6b4b39"],
    planter: ["#5c8755", "#395a3e"],
    table: ["#b88d60", "#714935"],
    electric: ["#789394", "#344a52"],
    console: ["#719491", "#304653"],
    pump: ["#8e9b91", "#465b5b"],
    crate: ["#be9969", "#745136"],
    bed: ["#cbe0d4", "#668c8a"],
  };
  const [top, side] = palette[kind];
  c.save();
  c.fillStyle = "#07101788";
  c.beginPath();
  c.ellipse(x + w / 2 + 5, y + h + 8, w / 2 + 7, 11, 0, 0, Math.PI * 2);
  c.fill();
  rounded(c, x, y, w, h, 6, side, "#182b32");
  rounded(c, x, y - 12, w, h - 4, 6, top, "#1b3037");
  c.strokeStyle = "#ffffff55";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x + 8, y - 4);
  c.lineTo(x + w - 8, y - 4);
  c.stroke();
  if (kind === "planter") {
    rounded(c, x + 8, y - 4, w - 16, h - 18, 3, "#435b37");
    const count = Math.max(1, Math.floor((w - 16) / 25));
    for (let i = 0; i < count; i++) {
      c.fillStyle = i % 2 ? "#e5bd4f" : "#9fd36d";
      c.beginPath();
      c.arc(x + 20 + i * 25, y + 8, 7, 0, Math.PI * 2);
      c.fill();
    }
  } else if (kind === "table" || kind === "desk") {
    rounded(c, x + 10, y - 2, 22, 16, 2, "#f2e3bf");
    if (kind === "table") {
      c.fillStyle = "#f0d0a6";
      c.beginPath();
      c.arc(x + w - 27, y + 13, 14, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#a73930";
      c.beginPath();
      c.arc(x + w - 27, y + 13, 10, 0, Math.PI * 2);
      c.fill();
    } else {
      rounded(c, x + w - 48, y - 1, 38, 24, 3, "#263c46", "#d3dfd1");
      rounded(c, x + w - 42, y + 4, 26, 13, 2, "#8bc3bd");
    }
  } else if (kind === "electric" || kind === "console") {
    const count = Math.max(1, Math.floor((w - 12) / 45));
    for (let i = 0; i < count; i++) {
      const px = x + 10 + (i * (w - 20)) / count;
      rounded(c, px, y - 3, (w - 32) / count, 22, 3, "#254a54", "#b9d4c4");
      c.fillStyle = i % 2 ? "#e6c76e" : "#8dd8c1";
      c.fillRect(px + 5, y + 3, 10, 3);
    }
  } else if (kind === "pump") {
    const count = Math.max(1, Math.floor((w - 12) / 45));
    for (let i = 0; i < count; i++) {
      const cx = x + (w * (i + 0.5)) / count;
      c.fillStyle = "#354f50";
      c.beginPath();
      c.arc(cx, y + 12, 15, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#d6b876";
      c.beginPath();
      c.arc(cx, y + 12, 8, 0, Math.PI * 2);
      c.fill();
    }
  } else if (kind === "crate") {
    c.strokeStyle = "#745136";
    c.lineWidth = 5;
    c.strokeRect(x + 8, y - 4, w - 16, h - 20);
    c.beginPath();
    c.moveTo(x + 10, y - 2);
    c.lineTo(x + w - 10, y + h - 22);
    c.moveTo(x + w - 10, y - 2);
    c.lineTo(x + 10, y + h - 22);
    c.stroke();
  } else if (kind === "bed") {
    rounded(c, x + 8, y - 3, w - 16, h - 21, 5, "#eef2de");
    rounded(c, x + 13, y + 1, 27, h - 29, 4, "#a3c9c4");
    c.fillStyle = "#da6359";
    c.fillRect(x + 65, y + 7, 20, 5);
    c.fillRect(x + 72, y, 6, 19);
  }
  c.restore();
}
function drawRoom(c, r) {
  const { x, y, w, h } = r;
  c.save();
  c.lineWidth = 4;
  rounded(c, x - 8, y - 8, w + 16, h + 16, 16, "#131e26", "#819099");
  rounded(c, x, y, w, h, 11, "#314651", "#1b2b33");
  c.save();
  c.beginPath();
  c.roundRect(x + 3, y + 3, w - 6, h - 6, 9);
  c.clip();
  c.fillStyle = r.color + "90";
  c.fillRect(x, y, w, h);
  c.strokeStyle = "#0b182426";
  c.lineWidth = 1;
  for (let gx = x; gx < x + w; gx += 35) {
    c.beginPath();
    c.moveTo(gx, y);
    c.lineTo(gx, y + h);
    c.stroke();
  }
  for (let gy = y; gy < y + h; gy += 35) {
    c.beginPath();
    c.moveTo(x, gy);
    c.lineTo(x + w, gy);
    c.stroke();
  }
  c.fillStyle = "#0f1c27db";
  c.fillRect(x, y, w, 32);
  c.restore();
  c.fillStyle = "#e3e4d8";
  c.font = "bold 12px sans-serif";
  c.textAlign = "left";
  c.fillText(r.name.toUpperCase(), x + 13, y + 21, w - 26);
  for (const item of FURNITURE.filter((item) => item.room === r.id))
    drawFurniture(c, item);
  if (r.id === "square") {
    // The emergency control is a floor panel so the entire crew can spawn here.
    rounded(c, 812, 580, 56, 37, 10, "#343e46", "#91a6a4");
    rounded(c, 823, 585, 34, 23, 9, "#d74843", "#ffaca0");
    c.textAlign = "center";
    c.font = "bold 9px sans-serif";
    c.fillStyle = "#e7ddd0";
    c.fillText("СОБРАНИЕ", 840, 629);
    rounded(c, 926, 662, 50, 33, 6, "#5e3331", "#cb8066");
    c.fillStyle = "#ebba7d";
    c.font = "18px sans-serif";
    c.fillText("ϟ", 951, 686);
    c.fillStyle = "#d0a38a";
    c.font = "8px sans-serif";
    c.fillText("САБОТАЖ", 951, 710);
    c.textAlign = "left";
  }
  const vx = x + 55,
    vy = y + h - 50;
  rounded(c, vx - 22, vy - 14, 44, 28, 5, "#0b1924", "#9caeaa");
  c.strokeStyle = "#5e7580";
  c.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.moveTo(vx - 14 + i * 9, vy - 9);
    c.lineTo(vx - 14 + i * 9, vy + 9);
    c.stroke();
  }
  c.restore();
}
function paintDeck(c) {
  // Angular hull, engines and corridors echo the supplied ship plan.
  c.save();
  c.lineJoin = "round";
  c.fillStyle = "#182b36";
  c.strokeStyle = "#6c7e86";
  c.lineWidth = 10;
  c.beginPath();
  c.moveTo(45, 485);
  c.lineTo(115, 365);
  c.lineTo(290, 365);
  c.lineTo(325, 65);
  c.lineTo(1025, 65);
  c.lineTo(1080, 40);
  c.lineTo(1470, 40);
  c.lineTo(1510, 365);
  c.lineTo(1820, 365);
  c.lineTo(1820, 390);
  c.lineTo(2145, 390);
  c.lineTo(2180, 550);
  c.lineTo(2145, 710);
  c.lineTo(1605, 760);
  c.lineTo(1605, 1470);
  c.lineTo(275, 1470);
  c.lineTo(260, 730);
  c.lineTo(110, 710);
  c.closePath();
  c.fill();
  c.stroke();
  c.strokeStyle = "#b18b60";
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(50, 500);
  c.lineTo(12, 520);
  c.lineTo(12, 560);
  c.lineTo(50, 560);
  c.moveTo(50, 585);
  c.lineTo(12, 600);
  c.lineTo(12, 635);
  c.lineTo(50, 635);
  c.stroke();
  for (const r of CORRIDORS) {
    rounded(c, r.x - 7, r.y - 7, r.w + 14, r.h + 14, 12, "#273f4f", "#687d84");
    rounded(c, r.x, r.y, r.w, r.h, 5, "#52666b");
    c.setLineDash([12, 15]);
    c.strokeStyle = "#d1c69a88";
    c.lineWidth = 2;
    c.strokeRect(r.x + 12, r.y + 12, r.w - 24, r.h - 24);
    c.setLineDash([]);
  }
  for (const r of ROOMS) drawRoom(c, r);
  // Mark the passages through the room outlines.
  c.fillStyle = "#728787";
  for (const p of [
    { x: 640, y: 199, w: 18, h: 52 },
    { x: 685, y: 199, w: 18, h: 52 },
    { x: 1013, y: 199, w: 18, h: 52 },
    { x: 1093, y: 199, w: 18, h: 52 },
    { x: 406, y: 584, w: 20, h: 52 },
    { x: 663, y: 584, w: 20, h: 52 },
    { x: 1013, y: 584, w: 20, h: 52 },
    { x: 1313, y: 584, w: 20, h: 52 },
    { x: 824, y: 343, w: 52, h: 18 },
    { x: 824, y: 433, w: 52, h: 18 },
    { x: 824, y: 733, w: 52, h: 18 },
    { x: 824, y: 873, w: 52, h: 18 },
    { x: 613, y: 949, w: 18, h: 52 },
    { x: 693, y: 949, w: 18, h: 52 },
    { x: 1663, y: 584, w: 18, h: 52 },
    { x: 1823, y: 584, w: 18, h: 52 },
    { x: 824, y: 1103, w: 52, h: 18 },
    { x: 824, y: 1193, w: 52, h: 18 },
    { x: 613, y: 1304, w: 18, h: 52 },
    { x: 693, y: 1304, w: 18, h: 52 },
    { x: 1063, y: 1304, w: 18, h: 52 },
    { x: 1223, y: 1304, w: 18, h: 52 },
  ])
    c.fillRect(p.x, p.y, p.w, p.h);
  c.restore();
}
function getDeck() {
  if (!deckCache) {
    deckCache = document.createElement("canvas");
    deckCache.width = MAP_WIDTH;
    deckCache.height = MAP_HEIGHT;
    paintDeck(deckCache.getContext("2d"));
  }
  return deckCache;
}
function drawMarkers(c) {
  const me = state?.players.find((p) => p.id === myId);
  if (state?.sabotage) {
    const reactor = ROOMS.find((room) => room.id === "reactor");
    c.save();
    c.strokeStyle = "#ff5e4dcc";
    c.lineWidth = 5;
    c.strokeRect(reactor.x + 8, reactor.y + 40, reactor.w - 16, reactor.h - 48);
    c.restore();
  }
  for (const r of ROOMS) {
    if (r.id === "square") continue;
    const p = taskPoint(r);
    const active =
      me?.tasks?.some((q) => q.room === r.id && !q.done) &&
      ROLE(me.role).team === "crew";
    const repair =
      (r.id === "electric" && state?.lights > time()) ||
      (r.id === "reactor" && state?.sabotage);
    rounded(
      c,
      p.x - 22,
      p.y - 17,
      44,
      34,
      5,
      "#304d5b",
      active || repair ? "#f9df73" : "#778a8c",
    );
    rounded(
      c,
      p.x - 15,
      p.y - 12,
      30,
      20,
      3,
      active || repair ? "#efcf72" : "#749b9b",
    );
    if (active || repair) {
      c.fillStyle = "#ffe484";
      c.font = "bold 22px sans-serif";
      c.textAlign = "center";
      c.fillText("!", p.x, p.y - 31);
      c.textAlign = "left";
    }
  }
}

function drawWorld(c, t, preview = false) {
  c.drawImage(getDeck(), 0, 0);
  drawMarkers(c);
  if (state) {
    for (const q of state.puddles) {
      c.fillStyle = "#7a9e4c88";
      c.beginPath();
      c.ellipse(q.x, q.y, 80, 45, 0.2, 0, 7);
      c.fill();
    }
    for (const w of state.walls) {
      rounded(
        c,
        w.x - w.w / 2,
        w.y - w.h / 2,
        w.w,
        w.h,
        0,
        "#6e8059",
        "#acc28d",
      );
      c.strokeStyle = "#384b36";
      c.lineWidth = 2;
      for (let x = w.x - w.w / 2; x < w.x + w.w / 2; x += 25) {
        c.beginPath();
        c.moveTo(x, w.y - w.h / 2);
        c.lineTo(x, w.y + w.h / 2);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(w.x - w.w / 2, w.y);
      c.lineTo(w.x + w.w / 2, w.y);
      c.stroke();
    }
    for (const b of state.bodies) {
      c.fillStyle = COLORS[b.color];
      rounded(c, b.x - 20, b.y - 5, 40, 20, 7, COLORS[b.color], "#142936");
      c.strokeStyle = "#dcd9c0";
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(b.x, b.y - 4);
      c.lineTo(b.x, b.y - 19);
      c.stroke();
      c.fillStyle = "#e0ddcd";
      c.beginPath();
      c.arc(b.x, b.y - 20, 7, 0, 7);
      c.fill();
    }
    const me = state.players.find((p) => p.id === myId);
    for (const p of [...state.players].sort((a, b) => a.y - b.y)) {
      if (p.rocket || (!p.alive && me?.alive)) continue;
      const point = advanceMotion(preview ? null : drawPositions.get(p.id), p);
      drawPositions.set(p.id, point);
      drawPerson(c, { ...p, ...point }, !p.alive);
      c.font = "600 10px Manrope,sans-serif";
      c.textAlign = "center";
      c.fillStyle =
        p.id === myId
          ? "#f1d48a"
          : p.role && ROLE(p.role).team === "imp"
            ? "#ef947f"
            : "#d4deda";
      c.fillText(p.name, point.x, point.y - 37);
      if (p.beauty) {
        c.fillStyle = "#f6d687";
        c.font = "27px sans-serif";
        c.fillText("✷", point.x, point.y - 54);
      }
    }
    for (const q of state.rockets) {
      c.save();
      c.translate(q.x, q.y);
      c.rotate(Math.atan2(q.fy, q.fx));
      c.fillStyle = "#f18156";
      c.beginPath();
      c.moveTo(-20, -8);
      c.lineTo(13, -8);
      c.lineTo(29, 0);
      c.lineTo(13, 8);
      c.lineTo(-20, 8);
      c.closePath();
      c.fill();
      c.fillStyle = "#f5cc79";
      c.fillRect(-35, -4, 14, 8);
      c.restore();
    }
    if (state.doors > t) {
      for (const door of [
        { x: 660, y: 575, w: 20, h: 70 },
        { x: 1010, y: 575, w: 20, h: 70 },
        { x: 815, y: 430, w: 70, h: 20 },
        { x: 815, y: 730, w: 70, h: 20 },
      ])
        rounded(c, door.x, door.y, door.w, door.h, 3, "#b97457", "#e0aa75");
    }
  }
  c.textAlign = "left";
}
let starCache;
function drawStars(c, w, h) {
  const width = Math.ceil(w),
    height = Math.ceil(h);
  if (!starCache || starCache.width !== width || starCache.height !== height) {
    starCache = document.createElement("canvas");
    starCache.width = width;
    starCache.height = height;
    const bg = starCache.getContext("2d");
    bg.fillStyle = "#080f17";
    bg.fillRect(0, 0, width, height);
    for (const s of stars) {
      bg.fillStyle = `rgba(154,180,194,${s.r / 3})`;
      bg.beginPath();
      bg.arc(s.x * width, s.y * height, s.r, 0, 7);
      bg.fill();
    }
  }
  c.drawImage(starCache, 0, 0, w, h);
}
function setupCanvas(el) {
  const dpr = Math.min(devicePixelRatio || 1, 2),
    box = el.getBoundingClientRect();
  if (
    el.width !== Math.round(box.width * dpr) ||
    el.height !== Math.round(box.height * dpr)
  ) {
    el.width = Math.round(box.width * dpr);
    el.height = Math.round(box.height * dpr);
  }
  const c = el.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, w: box.width, h: box.height };
}
function drawMapPreview() {
  const el = $("#map-preview");
  if (!el) return;
  const { c, w, h } = setupCanvas(el);
  drawStars(c, w, h);
  const scale = Math.min(w / (MAP_WIDTH + 60), h / (MAP_HEIGHT + 60));
  c.save();
  c.translate(
    w / 2 - (MAP_WIDTH / 2) * scale,
    h / 2 - (MAP_HEIGHT / 2) * scale,
  );
  c.scale(scale, scale);
  drawWorld(c, time(), true);
  c.restore();
}
function frame() {
  requestAnimationFrame(frame);
  if (!gameActive || !state) return;
  const el = $("#game-canvas");
  if (!el) return;
  el.parentElement.classList.toggle("map-open", showMap);
  const { c, w, h } = setupCanvas(el),
    me = state.players.find((p) => p.id === myId);
  if (!me) return;
  drawStars(c, w, h);
  const missile = me.rocket
      ? state.rockets.find((q) => q.owner === myId)
      : null,
    focus = missile || drawPositions.get(myId) || me;
  const scale = showMap
    ? Math.min(w / (MAP_WIDTH + 60), h / (MAP_HEIGHT + 60))
    : Math.max(0.65, Math.min(1.15, w / 1200));
  const camX = showMap ? MAP_WIDTH / 2 : focus.x,
    camY = showMap ? MAP_HEIGHT / 2 : focus.y;
  cameraView = { scale, x: w / 2 - camX * scale, y: h / 2 - camY * scale };
  c.save();
  c.translate(w / 2 - camX * scale, h / 2 - camY * scale);
  c.scale(scale, scale);
  drawWorld(c, time());
  c.restore();
  if (
    state.lights > time() &&
    ROLE(me.role).team === "crew" &&
    me.alive &&
    !showMap
  ) {
    const g = c.createRadialGradient(w / 2, h / 2, 90, w / 2, h / 2, 225);
    g.addColorStop(0, "#02080b00");
    g.addColorStop(1, "#02080bf5");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#e2c27b";
    c.font = "12px Manrope";
    c.textAlign = "center";
    c.fillText("СБОЙ ЭЛЕКТРИЧЕСТВА · Почините свет", w / 2, h - 130);
    c.textAlign = "left";
  }
  if (showMap) {
    c.fillStyle = "#d9ceac";
    c.font = "12px Manrope";
    c.textAlign = "center";
    c.fillText(
      "ПЛАН КОРАБЛЯ · кнопка карты или M, чтобы закрыть",
      w / 2,
      h - 35,
    );
    c.textAlign = "left";
  }
}
function stopMovement() {
  keys = {};
  lastInput = "";
  if (state && ws?.readyState === 1) send({ type: "move", x: 0, y: 0 });
}
let lastInput = "";
setInterval(() => {
  if (!gameActive || state?.phase !== "game") return;
  const blocked = !!modalType;
  const x = blocked
      ? 0
      : (keys.d || keys.ArrowRight ? 1 : 0) -
        (keys.a || keys.ArrowLeft ? 1 : 0),
    y = blocked
      ? 0
      : (keys.s || keys.ArrowDown ? 1 : 0) - (keys.w || keys.ArrowUp ? 1 : 0);
  const input = `${x},${y}`;
  if (input !== lastInput) {
    lastInput = input;
    send({ type: "move", x, y });
  }
}, 70);
document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  const key =
    {
      KeyW: "w",
      KeyA: "a",
      KeyS: "s",
      KeyD: "d",
      KeyE: "e",
      KeyR: "r",
      KeyM: "m",
    }[e.code] || (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (
    [
      "w",
      "a",
      "s",
      "d",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      " ",
    ].includes(key)
  ) {
    if (gameActive) e.preventDefault();
    keys[key] = true;
  }
  if (e.repeat) return;
  if (key === "Escape") {
    if (showMap) showMap = false;
    else closeModal();
  }
  if (gameActive && state?.phase === "game" && !modalType) {
    if (key === "e") gameAction("task");
    if (key === "r") gameAction("report");
    if (key === "m") showMap = !showMap;
  }
});
document.addEventListener("keyup", (e) => {
  const key =
    { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d" }[e.code] ||
    (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  keys[key] = false;
});
window.addEventListener("blur", stopMovement);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopMovement();
});
document.addEventListener("pointerdown", (e) => {
  const b = e.target.closest("[data-key]");
  if (b) {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    keys[b.dataset.key] = true;
  }
});
document.addEventListener("pointerup", (e) => {
  const b = e.target.closest("[data-key]");
  if (b) keys[b.dataset.key] = false;
});
document.addEventListener("pointercancel", stopMovement);
document.addEventListener("click", async (e) => {
  if (
    e.target.id === "game-canvas" &&
    cameraView &&
    !modalType &&
    state?.phase === "game"
  ) {
    const rect = e.target.getBoundingClientRect();
    const pos = {
      x: (e.clientX - rect.left - cameraView.x) / cameraView.scale,
      y: (e.clientY - rect.top - cameraView.y) / cameraView.scale,
    };
    const me = state.players.find((p) => p.id === myId);
    if (dist(pos, { x: 840, y: 597 }) < 40) gameAction("meeting");
    if (dist(pos, { x: 951, y: 680 }) < 40) {
      if (ROLE(me.role).team !== "imp")
        toast("Терминал саботажа доступен предателям.");
      else if (dist(me, { x: 951, y: 680 }) > 130)
        toast("Подойди к терминалу саботажа.");
      else gameAction("sabotage");
    }
    return;
  }
  const b = e.target.closest("button,a.rail-logo,a.wordmark");
  if (!b) return;
  if (b.matches("a")) {
    e.preventDefault();
    if (state) return;
    page = "home";
    render();
    return;
  }
  if (b.disabled) return;
  beep(650);
  if (b.dataset.page) {
    if (state) {
      toast("Сначала покинь комнату.");
      return;
    }
    page = b.dataset.page;
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (b.dataset.color !== undefined) {
    profile.color = Number(b.dataset.color);
    document.querySelectorAll(".color").forEach((q) => {
      q.classList.toggle("active", Number(q.dataset.color) === profile.color);
      q.setAttribute("aria-pressed", Number(q.dataset.color) === profile.color);
    });
    return;
  }
  if (b.dataset.join) {
    joinDialog(b.dataset.join);
    return;
  }
  if (
    b.dataset.action === "open-emergency-cover" &&
    modalType === "emergency-panel"
  ) {
    b.hidden = true;
    modalRoot.querySelector(".emergency-trigger").disabled = false;
    modalRoot.querySelector(".emergency-trigger").focus();
    return;
  }
  if (
    b.dataset.action === "confirm-emergency" &&
    modalType === "emergency-panel"
  ) {
    closeModal();
    send({ type: "meeting" });
    return;
  }
  if (b.dataset.game) {
    gameAction(b.dataset.game);
    return;
  }
  if (b.dataset.destination) {
    send(
      b.dataset.kind === "vent"
        ? { type: "vent", room: b.dataset.destination }
        : { type: "skill", key: "teleport", room: b.dataset.destination },
    );
    closeModal();
    return;
  }
  if (b.dataset.sabotage) {
    send({ type: "sabotage", kind: b.dataset.sabotage });
    closeModal();
    return;
  }
  if (b.dataset.bet) {
    send({ type: "skill", key: "coin", bet: b.dataset.bet });
    closeModal();
    return;
  }
  if (b.dataset.confirmSkill) {
    send({ type: "skill", key: b.dataset.confirmSkill });
    closeModal();
    return;
  }
  if (b.dataset.vote) {
    send({ type: "vote", target: b.dataset.vote });
    return;
  }
  if (b.dataset.taskChoice !== undefined) {
    if (Number(b.dataset.taskChoice) === taskData.sequence[taskIndex])
      taskIndex++;
    else toast("Неверный символ. Попробуй ещё раз.");
    drawTask();
    return;
  }
  if (b.dataset.wireLeft !== undefined) {
    const n = Number(b.dataset.wireLeft);
    if (n !== taskData.sequence[taskIndex]) {
      toast("Следуй указанному цвету.");
      return;
    }
    wireLeft = n;
    drawTask();
    return;
  }
  if (b.dataset.wireRight !== undefined) {
    if (wireLeft !== null && Number(b.dataset.wireRight) === wireLeft) {
      taskIndex++;
      wireLeft = null;
      drawTask();
    } else toast("Соедини одинаковые цвета.");
    return;
  }
  if (b.id === "task-submit") {
    send({
      type: "taskSubmit",
      room: taskData.room,
      sequence: taskData.sequence,
      request: "task",
    });
    closeModal();
    return;
  }
  switch (b.dataset.action) {
    case "create":
      createDialog();
      break;
    case "practice":
      createDialog(true);
      break;
    case "close":
      closeModal();
      break;
    case "all-roles":
      closeModal();
      page = "roles";
      render();
      break;
    case "refresh":
      send({ type: "list" });
      break;
    case "settings":
      settingsDialog();
      break;
    case "customize":
      openModal(
        "Твой скафандр",
        `<form id="profile-settings"><div class="field"><label>Позывной</label><input name="name" value="${esc(profile.name)}" required maxlength="18"></div>${colorPicker()}<button class="btn full">Сохранить</button></form>`,
      );
      break;
    case "sound":
      sound = !sound;
      save();
      toast(sound ? "Звуки включены" : "Звуки выключены");
      render();
      break;
    case "copy":
      try {
        await navigator.clipboard.writeText(state.code);
        toast("Код скопирован: " + state.code);
      } catch {
        toast("Код комнаты: " + state.code);
      }
      break;
    case "bots":
      send({ type: "bots", count: 1 });
      break;
    case "start":
      send({ type: "start" });
      break;
    case "leave":
      stopMovement();
      modalType = "";
      modalRoot.innerHTML = "";
      send({ type: "leave" });
      break;
    case "again":
      modalType = "";
      modalRoot.innerHTML = "";
      send({ type: "again" });
      break;
    case "role-info": {
      const me = state?.players.find((p) => p.id === myId);
      if (me) {
        const role = ROLE(me.role);
        openModal(
          "Твоя роль: " + role.name,
          `<p class="hint">${role.desc}</p>`,
        );
      }
      break;
    }
    case "toggle-map":
      showMap = !showMap;
      break;
    case "game-chat":
      openModal(
        "Связь с экипажем",
        `<div class="chat"><div id="chat-log" class="chat-log" style="height:220px"></div><form id="chat-form"><input name="message" maxlength="220" autocomplete="off" placeholder="Сообщение…" aria-label="Сообщение экипажу"></form></div>`,
      );
      updateChat();
      break;
    case "game-menu":
      openModal(
        "Бортовое меню",
        `<button class="btn secondary full" data-action="settings">Настройки звука</button><button class="btn secondary full" data-action="close">Продолжить полёт</button><button class="btn danger full" data-action="leave">Покинуть игру</button>`,
      );
      break;
  }
});
document.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target,
    d = new FormData(form);
  if (form.id === "join-form") {
    joinDialog(d.get("code") || $("#join-code").value.trim());
    return;
  }
  if (form.id === "create-form") {
    profile.name = String(d.get("name")).trim();
    save();
    const practice = d.get("practice") === "true";
    pending = practice ? "practice" : null;
    const ok = send({
      type: "create",
      name: profile.name,
      color: profile.color,
      settings: {
        name: d.get("roomName") || "Учебный экипаж",
        max: practice ? 8 : Number(d.get("max")),
        impostors: practice ? 1 : Number(d.get("impostors")),
        practice,
        role: d.get("role") || "random",
        public: d.has("public"),
      },
    });
    if (!ok) pending = null;
    return;
  }
  if (form.id === "join-details") {
    profile.name = String(d.get("name")).trim();
    save();
    send({
      type: "join",
      name: profile.name,
      color: profile.color,
      code: d.get("code"),
    });
    return;
  }
  if (form.id === "lobby-settings") {
    send({
      type: "settings",
      settings: {
        max: Number(d.get("max")),
        impostors: Number(d.get("impostors")),
        speed: Number(d.get("speed")),
        meeting: Number(d.get("meeting")),
      },
    });
    closeModal();
    return;
  }
  if (form.id === "profile-settings") {
    if (d.has("name")) profile.name = String(d.get("name")).trim();
    if (d.has("sound")) sound = true;
    else if (form.querySelector("[name=sound]")) sound = false;
    save();
    if (state?.phase === "lobby") send({ type: "profile", ...profile });
    closeModal();
    if (!state) render();
    return;
  }
  if (form.id === "chat-form") {
    const text = String(d.get("message")).trim();
    if (text) send({ type: "chat", text });
    form.reset();
  }
});
window.addEventListener("resize", () => {
  if (page === "map") drawMapPreview();
});
render();
connect();
requestAnimationFrame(frame);
