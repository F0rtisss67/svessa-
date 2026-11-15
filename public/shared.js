export const COLORS = [
  "#f36743",
  "#54bad2",
  "#e9bf4e",
  "#9677df",
  "#6dbb8e",
  "#e582b0",
  "#e7e9ec",
  "#5268c4",
  "#885b4b",
  "#9cba44",
  "#c64955",
  "#55cbbc",
  "#c49767",
  "#8eb4a9",
  "#da9256",
];
export const ROLES = [
  {
    id: "crew",
    name: "Мирный",
    team: "crew",
    icon: "✦",
    tag: "Надёжная основа",
    desc: "Выполняй задания, замечай подозрительное и помоги экипажу вернуться домой.",
    skills: [],
  },
  {
    id: "kirill",
    name: "Киррил",
    team: "crew",
    icon: "♨",
    tag: "Бортовой шеф",
    desc: "Готовит борщ раз в 40 сек. Передай его соседу: он сможет включить реактивный пердёж на 10 секунд.",
    skills: [["borscht", "Сварить борщ", 40]],
  },
  {
    id: "nikita",
    name: "Никита",
    team: "crew",
    icon: "▦",
    tag: "Мастер блоков",
    desc: "Раз в 30 секунд ставит перед собой стену из блоков. Стена держится 18 секунд.",
    skills: [["wall", "Поставить стену", 30]],
  },
  {
    id: "farmer",
    name: "Саня Гиперфарм",
    team: "crew",
    icon: "◉",
    tag: "Риск — дело урожайное",
    desc: "Ставка на орла или решку каждые 15 сек. Угадал: +10% заданий. Три ошибки за игру — гибель.",
    skills: [["coin", "Подбросить монету", 15]],
  },
  {
    id: "ilya",
    name: "Илья",
    team: "crew",
    icon: "◇",
    tag: "Тихая защита",
    desc: "Зеркальная броня на 10 секунд раз в 40 сек. При попытке убийства погибает нападающий. Броню никто не видит.",
    skills: [["armor", "Зеркальная броня", 40]],
  },
  {
    id: "egor",
    name: "Егор",
    team: "crew",
    icon: "≋",
    tag: "Скользкая ситуация",
    desc: "Оставляет лужу каждые 20 секунд. В ней экипаж движется быстрее и мгновенно выполняет задания.",
    skills: [["puddle", "Оставить лужу", 20]],
  },
  {
    id: "impostor",
    name: "Предатель",
    team: "imp",
    icon: "†",
    tag: "Свой среди чужих",
    desc: "Убийство каждые 20 секунд, вентиляция, отключение света, двери и авария реактора.",
    skills: [],
  },
  {
    id: "sanya",
    name: "Саня",
    team: "imp",
    icon: "⌁",
    tag: "Тихий диверсант",
    desc: "Телепорт раз в 40 сек. Незаметный выстрел по коленям раз в 30 сек: задания жертвы уменьшают прогресс.",
    skills: [
      ["teleport", "Телепорт", 40],
      ["knees", "Выстрел по коленям", 30],
    ],
  },
  {
    id: "artem",
    name: "Артём",
    team: "imp",
    icon: "✷",
    tag: "Убийственная красота",
    desc: "Раз в минуту включает красоту на 3 секунды. Кто смотрит на него — погибает. Защита 10 сек после собрания.",
    skills: [["beauty", "Включить красоту", 60]],
  },
  {
    id: "crocs",
    name: "Крокс",
    team: "imp",
    icon: "ϟ",
    tag: "Высокое напряжение",
    desc: "Ток раз в минуту убивает до двух соседних мирных. Кирка вскрывает борт и затягивает до трёх. Защита от тока 10 сек.",
    skills: [
      ["shock", "Разряд тока", 60],
      ["breach", "Кирка", 60],
    ],
  },
  {
    id: "fortis",
    name: "Фортис",
    team: "imp",
    icon: "✹",
    tag: "Большой взрыв",
    desc: "Самоподрыв убивает до пяти рядом (защита 20 сек). Каждые 30 сек можно прикрепить бомбу: взрыв убивает носителя и одного соседа.",
    skills: [
      ["selfbomb", "Самоподрыв", 60],
      ["plant", "Прикрепить бомбу", 30],
      ["detonate", "Детонировать", 0],
    ],
  },
  {
    id: "dima",
    name: "Дима",
    team: "imp",
    icon: "➶",
    tag: "Наведение на цель",
    desc: "Управляемая ракета раз в минуту: стена гасит её, попадание убивает мирного. Защита 10 сек. Лазер ослепляет экипаж поблизости.",
    skills: [
      ["rocket", "Запустить ракету", 60],
      ["laser", "Ослепить лазером", 30],
    ],
  },
];
export const ROLE = (id) => ROLES.find((r) => r.id === id) || ROLES[0];
// Deck plan adapted from the supplied Svessa Pump-1 illustration.
// Existing room IDs are retained so roles, repair actions and tasks remain compatible.
export const MAP_WIDTH = 1760;
export const MAP_HEIGHT = 1160;
export const ROOMS = [
  {
    id: "bridge",
    name: "Сільрада",
    x: 300,
    y: 820,
    w: 320,
    h: 240,
    color: "#76604e",
    task: "Перезапустить зависший монитор",
    kind: "route",
  },
  {
    id: "greenhouse",
    name: "Оранжерея «Чернобривцы»",
    x: 1100,
    y: 90,
    w: 360,
    h: 260,
    color: "#456c50",
    task: "Полить огурцы",
    kind: "tap",
  },
  {
    id: "kitchen",
    name: "Кают-компания «Погребок»",
    x: 690,
    y: 100,
    w: 330,
    h: 250,
    color: "#816046",
    task: "Собрать разлитый борщ",
    kind: "order",
  },
  {
    id: "electric",
    name: "Электрощитовая",
    x: 350,
    y: 100,
    w: 300,
    h: 220,
    color: "#766739",
    task: "Соединить провода",
    kind: "wires",
  },
  {
    id: "square",
    name: "Центральный пост",
    x: 670,
    y: 440,
    w: 350,
    h: 300,
    color: "#3e6071",
    task: "Сортировать посылки из дома",
    kind: "order",
  },
  {
    id: "reactor",
    name: "Машинный отсек «Свеснасос»",
    x: 80,
    y: 400,
    w: 340,
    h: 250,
    color: "#5e497f",
    task: "Стабилизировать насос",
    kind: "tap",
  },
  {
    id: "cargo",
    name: "Вокзал-шлюз «Хутор»",
    x: 1320,
    y: 420,
    w: 350,
    h: 260,
    color: "#765c45",
    task: "Принять груз из Свессы",
    kind: "order",
  },
  {
    id: "medbay",
    name: "Медпункт «ФАП»",
    x: 700,
    y: 880,
    w: 370,
    h: 230,
    color: "#436b70",
    task: "Протереть стеклянные кинескопы",
    kind: "tap",
  },
];
export const CORRIDORS = [
  { x: 570, y: 180, w: 600, h: 90 },
  { x: 360, y: 565, w: 1050, h: 90 },
  { x: 800, y: 280, w: 100, h: 685 },
  { x: 560, y: 930, w: 250, h: 100 },
];
const WALKABLE_AREAS = [...ROOMS, ...CORRIDORS];
export function walkable(x, y, r = 16) {
  return WALKABLE_AREAS.some(
    (a) =>
      x - r >= a.x && x + r <= a.x + a.w && y - r >= a.y && y + r <= a.y + a.h,
  );
}
export function roomAt(x, y) {
  return ROOMS.find(
    (r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h,
  );
}
export function taskPoint(r) {
  return { x: r.x + r.w - 65, y: r.y + 75 };
}
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
