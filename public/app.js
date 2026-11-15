import {
  ROLES,
  ROLE,
  COLORS,
  ROOMS,
  CORRIDORS,
  roomAt,
  taskPoint,
  dist,
} from "./shared.js";
const $ = (s) => document.querySelector(s),
  app = $("#app"),
  modalRoot = $("#modal-root");
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
  filter = "all",
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
  return `<button class="role-card" data-role="${r.id}"><div class="role-avatar">${crewmate(COLORS[i % 12], r.id === "kirill" ? "cap" : r.id === "egor" ? "flower" : "")}</div><div><span class="role-tag ${r.team === "imp" ? "imp" : ""}">${r.team === "imp" ? "ПРЕДАТЕЛЬ" : "ЭКИПАЖ"}</span><h3>${r.name}</h3><p>${r.tag}</p></div></button>`;
}
function home() {
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="tiny-line"></span> Свои люди. Открытый космос.</div><h1>ИЗ СВЕССЫ.<br>С ЛЮБОВЬЮ.<br><em>И ПОДОЗРЕНИЕМ.</em></h1><p>Родной посёлок — далеко. Предатель — рядом.<br>Собери друзей, завари борщ и узнай,<br><strong>кто не долетит до дома.</strong></p><div class="hero-meta"><span><i>♙</i> 4–15 игроков</span><span><i>✧</i> 12 уникальных ролей</span><span><i>◎</i> Прямо в браузере</span></div></div><div class="hero-art"><div class="art-grid"></div><div class="orbit"></div><span class="art-label top">UKR // SVESSA–01</span>${ship()}<span class="route-pin"></span><span class="art-label right">ВЫСОТА: 408 КМ<br><br>КУРС: ДОМОЙ ↗</span><span class="art-label bottom"><span class="dot"></span> ВСЕ СИСТЕМЫ СЛИШКОМ В НОРМЕ</span><span class="edition">SUMY REGION SPACE PROGRAM</span></div></section><section><div class="section-title"><h2><span class="number">01 /</span> На борт, космонавт</h2><small>Одна ссылка. Весь твой экипаж.</small></div><div class="play-grid"><article class="play-card create"><span class="card-icon">⊞</span><span class="corner-arrow">↗</span><h3>Создать комнату</h3><p>Твой корабль. Твои правила.<br>Приглашай своих по коду.</p><button class="card-hit" data-action="create" aria-label="Создать комнату"></button></article><article class="play-card join"><h3>Есть приглашение?</h3><p>Введи код и найди свой экипаж.</p><form class="join-row" id="join-form"><input id="join-code" maxlength="6" minlength="6" autocomplete="off" placeholder="КОД КОМНАТЫ" aria-label="Код комнаты" required pattern="[A-Fa-f0-9]{6}"><button aria-label="Войти в комнату">→</button></form></article><article class="play-card"><span class="card-icon" style="color:#c9cba7">⌁</span><span class="corner-arrow" style="color:#8e9b9e">↗</span><h3>Сначала — тренировка</h3><p>Освой корабль с ботами.<br>Без лишних свидетелей.</p><div class="practice-decoration">${crewmate("#8ba483")}</div><button class="card-hit" data-action="practice" aria-label="Тренировка с ботами"></button></article></div></section><section><div class="section-title"><h2><span class="number">02 /</span> Знакомые лица. Новые секреты.</h2><button class="section-link" data-page="roles">Все 12 ролей <span>↗</span></button></div><div class="roles-grid">${[ROLES[1], ROLES[2], ROLES[5], ROLES[10]].map((r, i) => roleCard(r, [2, 4, 6, 0][i])).join("")}</div></section><div class="mission-strip"><div><div class="mission-title"><span style="color:var(--yellow);font-size:18px">✧</span> Маленький посёлок. Большая космическая история.</div><p>Украинский корабль, знакомые места и задания с домашним привкусом.</p></div><div class="route"><span>СВЕССА</span><span class="route-line"></span><span>ОРБИТА</span><span style="color:var(--accent)">↗</span></div></div>`;
}
function rolesPage() {
  return `<div class="eyebrow">Экипаж с характером</div><h1 class="page-title">У каждого свой секрет.</h1><p class="page-sub">6 ролей экипажа. 6 ролей предателей. А кто твой сосед — решать тебе.<br>Роли распределяются случайно. В тренировке можно выбрать любую.</p><div class="filters">${[
    ["all", "Все роли · 12"],
    ["crew", "Экипаж · 6"],
    ["imp", "Предатели · 6"],
  ]
    .map(
      ([id, n]) =>
        `<button data-filter="${id}" class="${filter === id ? "active" : ""}">${n}</button>`,
    )
    .join("")}</div><div class="all-roles">${ROLES.filter(
    (r) => filter === "all" || r.team === filter,
  )
    .map(
      (r, i) =>
        `<article class="detail-role"><div class="role-top"><div class="role-avatar">${crewmate(COLORS[ROLES.indexOf(r)], i === 1 ? "cap" : "")}</div><div><span class="role-tag ${r.team === "imp" ? "imp" : ""}">${r.team === "crew" ? "ЭКИПАЖ" : "ПРЕДАТЕЛЬ"}</span><h3>${r.name}</h3></div></div><p>${r.desc}</p>${r.skills.length ? r.skills.map((s) => `<span class="skill-pill">${s[1]} · ${s[2]}с</span>`).join("") : '<span class="skill-pill">' + (r.team === "crew" ? "Задания и дедукция" : "Убить · 20с") + "</span>"}</article>`,
    )
    .join("")}</div>`;
}
function guide() {
  return `<div class="eyebrow">Перед первым полётом</div><h1 class="page-title">Доверяй. Но проверяй.</h1><p class="page-sub">Создай комнату, отправь друзьям код и вместе отправляйтесь на орбиту.</p><div class="instruction-grid"><article class="instruction-card"><span class="step">01</span><h3>Займи своё место</h3><p>От 4 до 15 игроков, до 3 предателей. Выбери цвет костюма и имя. Капитан настраивает скорость и голосование. Не хватает своих? Добавь ботов.</p></article><article class="instruction-card"><span class="step">02</span><h3>Выполни свою миссию</h3><p>Мирные чинят проводку, выращивают подсолнухи и сортируют посылки. Заполните шкалу заданий или выгоните всех предателей. Призраки продолжают задания!</p></article><article class="instruction-card"><span class="step">03</span><h3>Найди чужого</h3><p>Заметил тело — сообщи. Обсуждайте в чате и голосуйте. Предатели побеждают, когда остаётся один мирный или взрывается реактор. На починку реактора есть 45 секунд.</p></article></div><div class="instruction-card" style="margin-top:20px"><h3>Панель управления</h3><p><span class="key">W A S D</span> / <span class="key">↑ ← ↓ →</span> — движение и направление взгляда &nbsp; <span class="key">E</span> — задание &nbsp; <span class="key">R</span> — сообщить о теле &nbsp; <span class="key">M</span> — карта<br>На телефоне используй стрелки и кнопки на экране. Люки находятся в левом нижнем углу комнат. Экстренная кнопка — на Площади Свессы.<br>У всех предателей: убийство с перезарядкой 20 секунд, вентиляция и три саботажа. После собраний действует защита от особых атак. Боты умеют ходить, выполнять задания, убивать и сообщать о телах; обсуждения — за людьми.</p><button class="btn" data-action="practice">Попробовать с ботами ↗</button></div>`;
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
          ? `<div class="eyebrow">СВЕССА–01 / план палубы</div><h1 class="page-title">Родные места. Новая высота.</h1><p class="page-sub">7 отсеков, вентиляционная сеть и одна кнопка, которую лучше не трогать без причины.</p><canvas id="map-preview" class="map-preview"></canvas>`
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
        ? `<div class="field"><label for="practice-role">Твоя роль</label><select id="practice-role" name="role"><option value="random">Случайная роль</option>${[
            "crew",
            "imp",
          ]
            .map(
              (team) =>
                `<optgroup label="${team === "crew" ? "Экипаж" : "Предатели"}">${ROLES.filter(
                  (r) => r.team === team,
                )
                  .map((r) => `<option value="${r.id}">${r.name}</option>`)
                  .join("")}</optgroup>`,
            )
            .join(
              "",
            )}</select></div><p class="hint">На борту будут ещё 7 ботов. Все способности, задания и саботажи доступны в обычном режиме.</p>`
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
    `<div style="display:flex;align-items:center;justify-content:space-between"><div><div class="eyebrow">Посадка открыта / ${r.settings.practice ? "учебный полёт" : "онлайн"}</div><h1 class="page-title">${esc(r.settings.name)}</h1><p class="page-sub" style="margin-bottom:0">До старта — один экипаж. После старта — как повезёт.</p></div><button class="btn secondary" data-action="leave">Покинуть</button></div><div class="lobby-grid"><div><div class="lobby-stage"><div class="art-grid"></div><div style="position:absolute;inset:50% -20% -70%;border:2px solid #53616b;transform:perspective(400px) rotateX(42deg);border-radius:50%;background:repeating-linear-gradient(0deg,#2c3c4840 0 1px,transparent 1px 45px),repeating-linear-gradient(90deg,#2c3c4840 0 1px,transparent 1px 45px)"></div><div class="lobby-crew" id="lobby-crew">${lobbyPlayers(r)}</div><div class="lobby-caption">СВЕССА–01 · ПОДГОТОВКА К ВЫЛЕТУ</div></div><div class="chat"><div class="chat-log" id="chat-log"></div><form id="chat-form"><input name="message" maxlength="220" placeholder="Скажи экипажу пару слов… Enter — отправить" aria-label="Сообщение экипажу" autocomplete="off"></form></div></div><aside><div class="lobby-code"><p>КОД ПРИГЛАШЕНИЯ</p><div class="code">${r.code}<button data-action="copy" aria-label="Скопировать код">⧉</button></div><p style="margin-top:15px;line-height:1.7;margin-bottom:0">Друзья открывают этот сайт<br>и вводят код на главной.</p></div><div class="roster"><h3>На борту <span id="roster-count">${r.players.length}</span> / ${r.settings.max}</h3><div id="roster-list">${roster(r)}</div><button class="btn secondary full" data-action="customize">Цвет и позывной</button></div>${r.host === myId ? `<div style="display:flex;gap:8px;margin-top:15px"><button class="btn secondary" style="flex:1" data-action="bots">+ Бот</button><button class="btn secondary" data-action="settings">⚙ Правила</button></div><button class="btn full" data-action="start">Начать полёт ↗</button><p class="hint" style="text-align:center">${r.players.length < 4 ? "Нужно минимум 4 игрока. Добавь ботов." : `${Math.min(r.settings.impostors, Math.floor((r.players.length - 1) / 3))} предатель · 4 задания на мирного`}</p>` : '<p class="hint" style="text-align:center">Капитан готовит корабль к вылету.</p>'}</aside></div>`,
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
    if (lastPhase !== "meeting") stopMovement();
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
  app.innerHTML = `<div class="game-shell"><canvas id="game-canvas" class="game-canvas" aria-label="Карта корабля, управление WASD"></canvas><div class="game-top"><div class="progress-panel"><div class="progress-title"><span>ОБЩИЕ ЗАДАНИЯ</span><strong id="progress-number">0%</strong></div><div class="progress-track"><div id="progress-fill" class="progress-fill"></div></div></div><div class="game-identity" id="game-identity"></div><div class="game-utilities"><button data-action="toggle-map" aria-label="Карта" title="Карта (M)">⌘</button><button data-action="game-chat" aria-label="Чат" title="Чат">☷</button><button data-action="game-menu" aria-label="Меню">⚙</button></div></div><div class="task-list" id="task-list"></div><div class="role-help" id="role-help"></div><div class="location" id="location"></div><div id="reactor-alert"></div><div class="game-actions" id="game-actions"></div><div class="mobile-controls"><button data-key="w" aria-label="Вверх">↑</button><button data-key="a" aria-label="Влево">←</button><button data-key="s" aria-label="Вниз">↓</button><button data-key="d" aria-label="Вправо">→</button></div><div id="flash-root"></div></div>`;
  localPosition = null;
}
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
  $("#progress-number").textContent = `${Math.round(state.progress)}%`;
  $("#progress-fill").style.width = `${state.progress}%`;
  $("#game-identity").innerHTML =
    `<strong style="color:${imp ? "#f4907e" : "#b4cca8"}">${esc(me.name)} · ${r.name}${!me.alive ? " 👻" : ""}</strong><small>${me.rocket ? "УПРАВЛЯЙ РАКЕТОЙ · WASD" : !me.alive ? "ПРИЗРАК · ПОМОГИ С ЗАДАНИЯМИ" : imp ? "ПРЕДАТЕЛЬ · НЕ ВЫДАЙ СЕБЯ" : "ЭКИПАЖ · КУРС НА ДОМ"}</small>`;
  $("#task-list").innerHTML =
    `<h3>${imp ? "ТВОЯ МИССИЯ" : "ТВОИ ЗАДАНИЯ"}</h3>${imp ? "<p>Устрани экипаж или взорви реактор. Твои союзники отмечены красным.</p>" : me.tasks.map((q) => `<p class="${q.done ? "done" : ""}">${q.done ? "✓" : "◇"} ${ROOMS.find((r) => r.id === q.room)?.task}</p>`).join("")}${me.armor > t ? '<p style="color:#a7cfed">◇ Броня активна ' + Math.ceil((me.armor - t) / 1000) + "с</p>" : ""}${me.role === "farmer" ? `<p>Ошибки: ${me.misses || 0} / 3</p>` : ""}`;
  $("#role-help").innerHTML =
    `<strong style="color:#d5dcd7">${r.name}</strong><br>${r.desc}<br><span style="color:#6e8494">WASD — ходить · E — задание · M — карта</span>`;
  $("#location").textContent =
    roomAt(me.x, me.y)?.name || "СОЕДИНИТЕЛЬНЫЙ КОРИДОР";
  const actionButton = (key, name, style = "", cd = 0, sym = "") =>
    `<button class="action ${style}" data-game="${key}" ${cd > 0 ? "disabled" : ""}><span class="action-symbol">${sym || symbols[key] || "✦"}</span>${name}${cd > 0 ? `<small>${cd}с</small>` : ""}</button>`;
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
  if ($("#game-actions").innerHTML !== buttons)
    $("#game-actions").innerHTML = buttons;
  $("#reactor-alert").innerHTML = state.sabotage
    ? `<div class="reactor-alert">⚠ Реактор: ${Math.max(0, Math.ceil((state.sabotage.until - t) / 1000))}с · Срочно в отсек «Сумы»</div>`
    : "";
  $("#flash-root").innerHTML =
    me.blindUntil > t ? '<div class="flash"></div>' : "";
}
function chooseRoom(kind) {
  openModal(
    kind === "teleport" ? "Куда телепортироваться?" : "Вентиляционная сеть",
    `<p class="hint">${kind === "teleport" ? "Выбери отсек корабля." : "Сначала подойди к люку в левом нижнем углу комнаты."}</p><div class="vote-grid">${ROOMS.map((r) => `<button class="btn secondary" data-destination="${r.id}" data-kind="${kind}">${r.name}</button>`).join("")}</div>`,
  );
}
function gameAction(key) {
  if (!state) return;
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
      `<p class="hint">Один саботаж каждые 30 секунд. Реактор взорвётся через 45 сек, если его не починят.</p><div style="display:grid;gap:12px"><button class="btn secondary" data-sabotage="lights">ϟ Отключить электричество</button><button class="btn danger" data-sabotage="reactor">⚠ Повредить реактор «Сумы»</button><button class="btn secondary" data-sabotage="doors">▥ Закрыть двери на 10 секунд</button></div>`,
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
        ? ["💧", "🌻", "☀", "🌱"]
        : t.room === "bridge"
          ? ["↑", "→", "↓", "←"]
          : t.room === "kitchen"
            ? ["🥕", "🧅", "🥔", "🍅"]
            : t.room === "cargo"
              ? ["📦", "✉", "🌻", "⌂"]
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
  $("#meeting-timer").textContent =
    `${Math.max(0, Math.ceil((m.until - time()) / 1000))} сек`;
  const grid = state.players
    .map(
      (p) =>
        `<div class="meeting-player" style="opacity:${p.alive ? 1 : 0.35}">${crewmate(COLORS[p.color])}<span>${esc(p.name)}${p.id === myId ? " (ты)" : ""}<small style="display:block;font-size:9px;color:#778d9c">${!p.alive ? "ВЫБЫЛ" : m.votes.includes(p.id) ? "ГОЛОС ПРИНЯТ" : "НА БОРТУ"}</small></span>${p.alive && me.alive && !m.mine ? `<button class="btn secondary" data-vote="${p.id}" style="padding:8px;font-size:10px">Выбрать</button>` : ""}</div>`,
    )
    .join("");
  if ($("#vote-grid").innerHTML !== grid) $("#vote-grid").innerHTML = grid;
  const footer = m.mine
    ? '<p class="hint">Твой голос принят. Ждём экипаж.</p>'
    : me.alive
      ? '<button class="btn secondary full" data-vote="skip">Пропустить голосование</button>'
      : '<p class="hint">Призраки наблюдают за голосованием.</p>';
  if ($("#vote-footer").innerHTML !== footer)
    $("#vote-footer").innerHTML = footer;
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
  c.save();
  c.translate(p.x, p.y);
  if (ghost) c.globalAlpha = 0.35;
  const wobble =
    gameActive && Math.hypot(p.fx || 0, p.fy || 0) > 0
      ? Math.sin(performance.now() / 180 + p.x) * 1
      : 0;
  c.translate(0, wobble);
  c.fillStyle = "#0005";
  c.beginPath();
  c.ellipse(0, 17, 22, 8, 0, 0, 7);
  c.fill();
  c.lineWidth = 3;
  rounded(c, -24, -10, 12, 28, 4, color, "#152530");
  rounded(c, -15, -25, 37, 49, 15, color, "#152530");
  rounded(c, -13, 15, 12, 16, 3, color, "#152530");
  rounded(c, 9, 15, 12, 16, 3, color, "#152530");
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
function drawRoom(c, r, t) {
  c.save();
  c.lineWidth = 3;
  rounded(c, r.x - 7, r.y - 7, r.w + 14, r.h + 14, 20, "#263f4d", "#58717c");
  rounded(c, r.x, r.y, r.w, r.h, 14, "#172c3b");
  c.save();
  c.beginPath();
  c.roundRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 12);
  c.clip();
  c.strokeStyle = "#294350";
  c.lineWidth = 1;
  for (let x = r.x; x < r.x + r.w; x += 40) {
    c.beginPath();
    c.moveTo(x, r.y);
    c.lineTo(x, r.y + r.h);
    c.stroke();
  }
  for (let y = r.y; y < r.y + r.h; y += 40) {
    c.beginPath();
    c.moveTo(r.x, y);
    c.lineTo(r.x + r.w, y);
    c.stroke();
  }
  c.fillStyle = r.color + "45";
  c.fillRect(r.x, r.y, r.w, 36);
  c.restore();
  c.fillStyle = "#c0d0d4";
  c.textAlign = "left";
  c.font = "600 12px Manrope, sans-serif";
  c.fillText(r.name.toUpperCase(), r.x + 18, r.y + 24);
  // Every compartment has its own equipment and a vent.
  const x = r.x,
    y = r.y,
    w = r.w,
    h = r.h;
  if (r.id === "bridge") {
    rounded(c, x + 70, y + 50, w - 140, 55, 12, "#2e4e62", "#628690");
    for (let i = 0; i < 3; i++) {
      rounded(c, x + 85 + i * 51, y + 62, 36, 19, 3, "#7bb1ae");
    }
    rounded(c, x + 142, y + 135, 55, 40, 9, "#426375", "#77919a");
  }
  if (r.id === "kitchen") {
    rounded(c, x + 20, y + 55, 55, 125, 6, "#546e6b", "#829384");
    for (let i = 0; i < 3; i++) {
      c.fillStyle = "#223e43";
      c.beginPath();
      c.arc(x + 47, y + 78 + i * 37, 11, 0, 7);
      c.fill();
    }
    rounded(c, x + 96, y + 120, 105, 55, 8, "#7d6a4e", "#b3a278");
    c.fillStyle = "#ce875a";
    c.beginPath();
    c.arc(x + 145, y + 146, 19, 0, 7);
    c.fill();
    c.fillStyle = "#632c25";
    c.beginPath();
    c.arc(x + 145, y + 146, 14, 0, 7);
    c.fill();
  }
  if (r.id === "greenhouse") {
    for (let i = 0; i < 4; i++) {
      rounded(c, x + 28 + i * 68, y + 100, 48, 100, 6, "#385f4f", "#597f5f");
      for (let j = 0; j < 2; j++) {
        c.fillStyle = "#a5b863";
        c.beginPath();
        c.arc(x + 52 + i * 68, y + 125 + j * 48, 13, 0, 7);
        c.fill();
        c.fillStyle = "#705a3c";
        c.beginPath();
        c.arc(x + 52 + i * 68, y + 125 + j * 48, 6, 0, 7);
        c.fill();
      }
    }
  }
  if (r.id === "electric") {
    for (let i = 0; i < 3; i++) {
      rounded(c, x + 25 + i * 65, y + 100, 50, 105, 5, "#394c53", "#71817b");
      c.fillStyle = i === 1 ? "#dfa75d" : "#8eb989";
      c.fillRect(x + 40 + i * 65, y + 115, 20, 6);
      for (let j = 0; j < 3; j++) {
        c.fillStyle = "#192d37";
        c.fillRect(x + 35 + i * 65, y + 137 + j * 16, 30, 5);
      }
    }
  }
  if (r.id === "reactor") {
    const px = x + 150,
      py = y + 145;
    c.strokeStyle = "#5b658d";
    c.lineWidth = 9;
    c.beginPath();
    c.ellipse(px, py, 70, 60, 0, 0, 7);
    c.stroke();
    c.fillStyle = state?.sabotage ? "#f4724e" : "#88c9bc";
    c.shadowBlur = 22;
    c.shadowColor = c.fillStyle;
    c.beginPath();
    c.arc(px, py, 34 + Math.sin(t / 500) * 3, 0, 7);
    c.fill();
    c.shadowBlur = 0;
    c.lineWidth = 4;
    c.strokeStyle = "#bdc9c5";
    c.beginPath();
    c.arc(px, py, 49, 0, 7);
    c.stroke();
  }
  if (r.id === "cargo") {
    for (let i = 0; i < 3; i++) {
      rounded(
        c,
        x + 65 + i * 72,
        y + 110 + (i % 2) * 20,
        55,
        55,
        5,
        "#8f7950",
        "#bea57a",
      );
      c.fillStyle = "#c6ae78";
      c.fillRect(x + 88 + i * 72, y + 112 + (i % 2) * 20, 8, 50);
      c.fillStyle = "#403a2e";
      c.font = "8px monospace";
      c.fillText("УКР", x + 71 + i * 72, y + 140 + (i % 2) * 20);
    }
  }
  if (r.id === "square") {
    c.fillStyle = "#344f5a";
    c.beginPath();
    c.ellipse(840, 608, 69, 45, 0, 0, 7);
    c.fill();
    c.strokeStyle = "#779194";
    c.lineWidth = 3;
    c.stroke();
    c.fillStyle = "#e67c57";
    c.beginPath();
    c.ellipse(840, 597, 25, 16, 0, 0, 7);
    c.fill();
    c.font = "9px monospace";
    c.fillStyle = "#b9c9c5";
    c.textAlign = "center";
    c.fillText("СОБРАНИЕ", 840, 650);
    c.textAlign = "center";
    rounded(c, 926, 662, 50, 33, 6, "#5e3331", "#cb8066");
    c.fillStyle = "#ebba7d";
    c.font = "18px sans-serif";
    c.fillText("ϟ", 951, 686);
    c.font = "8px monospace";
    c.fillStyle = "#d0a38a";
    c.fillText("САБОТАЖ", 951, 710);
    c.textAlign = "left";
  }
  const vx = x + 55,
    vy = y + h - 50;
  rounded(c, vx - 22, vy - 14, 44, 28, 5, "#0b1924", "#566f78");
  for (let i = 0; i < 4; i++) {
    c.strokeStyle = "#445966";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(vx - 14 + i * 9, vy - 9);
    c.lineTo(vx - 14 + i * 9, vy + 9);
    c.stroke();
  }
  if (r.id !== "square") {
    const p = taskPoint(r),
      me = state?.players.find((p) => p.id === myId),
      active =
        me?.tasks?.some((q) => q.room === r.id && !q.done) &&
        ROLE(me.role).team === "crew";
    rounded(
      c,
      p.x - 22,
      p.y - 17,
      44,
      34,
      5,
      "#304d5b",
      active ? "#e6c86d" : "#778a8c",
    );
    rounded(c, p.x - 15, p.y - 12, 30, 20, 3, active ? "#dbbe6e" : "#749b9b");
    if (active) {
      c.fillStyle = "#f4d985";
      c.font = "bold 22px monospace";
      c.textAlign = "center";
      c.fillText("!", p.x, p.y - 31);
      c.textAlign = "left";
    }
  }
  c.restore();
}
function drawWorld(c, t, preview = false) {
  c.lineJoin = "round";
  c.lineWidth = 4;
  for (const r of CORRIDORS) {
    rounded(c, r.x - 7, r.y - 7, r.w + 14, r.h + 14, 15, "#273f4f", "#496371");
    rounded(c, r.x, r.y, r.w, r.h, 9, "#1b303e");
    c.setLineDash([12, 13]);
    c.strokeStyle = "#51635d";
    c.lineWidth = 1;
    c.strokeRect(r.x + 15, r.y + 15, r.w - 30, r.h - 30);
    c.setLineDash([]);
  }
  for (const r of ROOMS) drawRoom(c, r, t);
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
      let point = drawPositions.get(p.id);
      if (!point || preview) point = { x: p.x, y: p.y };
      else {
        point.x += (p.x - point.x) * 0.24;
        point.y += (p.y - point.y) * 0.24;
      }
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
      for (const x of [560, 1100]) {
        rounded(c, x, 563, 16, 80, 3, "#b97457", "#e0aa75");
        rounded(c, x, 178, 16, 70, 3, "#b97457", "#e0aa75");
      }
    }
  }
  c.textAlign = "left";
}
function drawStars(c, w, h) {
  c.fillStyle = "#080f17";
  c.fillRect(0, 0, w, h);
  for (const s of stars) {
    c.fillStyle = `rgba(154,180,194,${s.r / 3})`;
    c.beginPath();
    c.arc(s.x * w, s.y * h, s.r, 0, 7);
    c.fill();
  }
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
  const scale = Math.min(w / 1600, h / 1200);
  c.save();
  c.translate(w / 2 - 855 * scale, h / 2 - 580 * scale);
  c.scale(scale, scale);
  drawWorld(c, time(), true);
  c.restore();
}
function frame() {
  requestAnimationFrame(frame);
  if (!gameActive || !state) return;
  const el = $("#game-canvas");
  if (!el) return;
  const { c, w, h } = setupCanvas(el),
    me = state.players.find((p) => p.id === myId);
  if (!me) return;
  drawStars(c, w, h);
  const missile = me.rocket
      ? state.rockets.find((q) => q.owner === myId)
      : null,
    focus = missile || drawPositions.get(myId) || me;
  const scale = showMap
    ? Math.min(w / 1650, h / 1250)
    : Math.max(0.65, Math.min(1.15, w / 1200));
  const camX = showMap ? 855 : focus.x,
    camY = showMap ? 580 : focus.y;
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
    c.fillText("ПЛАН КОРАБЛЯ · M, чтобы закрыть", w / 2, h - 35);
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
  if (b.dataset.filter) {
    filter = b.dataset.filter;
    render();
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
  if (b.dataset.role) {
    const r = ROLE(b.dataset.role);
    openModal(
      r.name,
      `<div style="width:80px;margin:0 auto">${crewmate(COLORS[ROLES.indexOf(r)])}</div><p class="hint">${r.desc}</p><span class="role-tag ${r.team === "imp" ? "imp" : ""}">${r.team === "imp" ? "ПРЕДАТЕЛЬ" : "ЭКИПАЖ"}</span><button class="btn full" data-action="all-roles">Все роли ↗</button>`,
    );
    return;
  }
  if (b.dataset.join) {
    joinDialog(b.dataset.join);
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
