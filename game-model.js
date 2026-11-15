/** Island progression only. Cash and awarded cash belong to the server ledger. */
export const BUILDINGS = Object.freeze({
  cabin: { n: 'Cabin', c: 100, s: 30, w: '#8c7a62', r: '#6e3b30' },
  mill: { n: 'Windmill', c: 250, s: 120, w: '#b8b2a2', r: '#4a5f78' },
  library: { n: 'Library', c: 600, s: 600, w: '#6c6480', r: '#2f2a3d' },
  greenhouse: { n: 'Greenhouse', c: 1500, s: 3600, w: '#7ea396', r: '#8fb8c4' },
  lighthouse: { n: 'Lighthouse', c: 4000, s: 14400, w: '#cfc9bd', r: '#8c3a33' },
  observatory: { n: 'Observatory', c: 10000, s: 43200, w: '#4a5470', r: '#a8883c' }
});

export const THEMES = Object.freeze({
  forest: { name: 'Woodland', grass: ['#3c5b49', '#40604d'], sea: ['#12293a', '#070e15'] },
  coast: { name: 'Sunlit coast', grass: ['#6b8061', '#758a68'], sea: ['#244f61', '#102d42'] },
  night: { name: 'Starlight', grass: ['#343e57', '#3b4960'], sea: ['#171d38', '#090d1e'] }
});

export const DECORATIONS = Object.freeze({
  tree: { name: 'Pine tree', cost: 25, lesson: null },
  flowers: { name: 'Wildflowers', cost: 15, lesson: 'budget' },
  lantern: { name: 'Garden lantern', cost: 30, lesson: 'buffer' }
});

export const LESSONS = Object.freeze([
  {
    id: 'budget', title: 'A plan that fits',
    prompt: 'You want to save regularly. What is a useful first step?',
    answers: ['Choose an amount after allowing for bills and essentials.', 'Save every available pound before paying bills.', 'Copy the amount someone else saves.'],
    correct: 0,
    explanation: 'A useful savings plan leaves room for essentials and can change when life changes.',
    unlock: 'flowers', gold: 125
  },
  {
    id: 'buffer', title: 'Room for surprises',
    prompt: 'What is the purpose of an emergency fund?',
    answers: ['To cover unexpected costs with money you can access.', 'To guarantee that expenses never increase.', 'To spend as quickly as possible.'],
    correct: 0,
    explanation: 'An accessible cushion can help with an unexpected bill. Start with an amount that fits your circumstances.',
    unlock: 'lantern', gold: 125
  },
  {
    id: 'compound', title: 'Growth on growth',
    prompt: 'In a hypothetical account that pays interest, what does compounding mean?',
    answers: ['Interest left in the account may itself earn interest.', 'Every account guarantees a fixed profit.', 'You must add money every day.'],
    correct: 0,
    explanation: 'Compounding means earning on previous earnings as well as the original amount. Actual rates and account terms vary; this example does not describe a Holdfast return.',
    unlock: null, gold: 125
  }
]);

export const MAX_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000;
export const GOLD_INTERVAL_MS = 60 * 1000;
const MAX_COINS = 1_000_000_000_000;
const MAX_GOAL_PENCE = 1_000_000_000;
const finiteInt = value => Number.isSafeInteger(value);
const safeAmount = (value, fallback = 0, max = MAX_COINS) => finiteInt(value) && value >= 0 ? Math.min(value, max) : fallback;
const timestamp = value => Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
const cleanName = (value, fallback, max = 48) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || fallback : fallback;

export function makeGame(now = Date.now()) {
  return {
    version: 2, coins: 100, b: [], decorations: [], theme: 'forest',
    islandName: 'My island', tutorialDone: false, lastTick: timestamp(now),
    goldRemainder: 0, playMs: 0, lessons: [], goal: null
  };
}

export function buildingCost(game, type) {
  const building = BUILDINGS[type];
  if (!building) throw new Error('Unknown building.');
  if (type === 'cabin' && !game.tutorialDone && !game.b.some(b => b.t === 'cabin')) return 0;
  return Math.round(building.c * Math.pow(1.6, game.b.filter(b => b.t === type).length));
}

export function canBuild(game, x, y) {
  if (!finiteInt(x) || !finiteInt(y) || x < 1 || y < 1 || x > 9 || y > 9) return false;
  if (x < 7 && x + 2 > 4 && y < 7 && y + 2 > 4) return false;
  if (game.b.some(b => Math.abs(b.x - x) < 2 && Math.abs(b.y - y) < 2)) return false;
  return !game.decorations.some(d => d.x >= x && d.x < x + 2 && d.y >= y && d.y < y + 2);
}

/** Loads both the original {coins,plots,...} save and the current island format. */
export function hydrateGame(saved, now = Date.now()) {
  const game = makeGame(now);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return game;
  game.coins = safeAmount(saved.coins, 100);
  game.islandName = cleanName(saved.islandName, 'My island');
  game.theme = Object.hasOwn(THEMES, saved.theme) ? saved.theme : 'forest';
  game.lessons = Array.isArray(saved.lessons) ? [...new Set(saved.lessons.filter(id => LESSONS.some(l => l.id === id)))] : [];
  game.playMs = safeAmount(saved.playMs, 0, Number.MAX_SAFE_INTEGER);
  game.goldRemainder = Number.isFinite(saved.goldRemainder) && saved.goldRemainder >= 0 ? Math.min(GOLD_INTERVAL_MS - 1, saved.goldRemainder) : 0;
  game.lastTick = timestamp(saved.lastTick ?? saved.ts ?? now);
  const buildings = Array.isArray(saved.b) ? saved.b : Array.isArray(saved.plots) ? saved.plots : [];
  for (const raw of buildings.slice(0, 50)) {
    if (!raw || !Object.hasOwn(BUILDINGS, raw.t) || !canBuild(game, raw.x, raw.y)) continue;
    const starter = !!raw.starter;
    const expectedDuration = starter ? 15000 : BUILDINGS[raw.t].s * 1000;
    const d = Number.isFinite(raw.d) && raw.d > 0 ? Math.min(raw.d, expectedDuration) : expectedDuration;
    const p = Number.isFinite(raw.p) && raw.p >= 0 ? Math.min(raw.p, d) : 0;
    const ok = !!raw.ok || p >= d;
    const rewardClaimed = raw.rewardClaimed === true || (ok && !raw.ch);
    game.b.push({ t: raw.t, x: raw.x, y: raw.y, p: ok ? d : p, d, ok: +ok, ch: +(ok && !rewardClaimed), starter, rewardClaimed });
  }
  game.tutorialDone = !!saved.tutorialDone || game.b.length > 0;
  if (saved.goal && typeof saved.goal === 'object') {
    try { setGoal(game, saved.goal); } catch { /* A malformed goal must not discard the island. */ }
  }
  if (Array.isArray(saved.decorations)) {
    for (const raw of saved.decorations.slice(0, 60)) {
      if (!raw || !Object.hasOwn(DECORATIONS, raw.kind) || !validDecorationSpot(game, raw.x, raw.y)) continue;
      game.decorations.push({ kind: raw.kind, x: raw.x, y: raw.y });
    }
  }
  return game;
}

/** Progress is independent of savings; zero-balance islands remain alive. */
export function advanceGame(game, now = Date.now()) {
  const current = timestamp(now);
  const previous = timestamp(game.lastTick);
  const elapsedMs = Math.max(0, current - previous);
  const progressMs = Math.min(elapsedMs, MAX_OFFLINE_MS);
  const combinedGoldTime = game.goldRemainder + progressMs;
  const goldEarned = Math.floor(combinedGoldTime / GOLD_INTERVAL_MS);
  game.goldRemainder = combinedGoldTime % GOLD_INTERVAL_MS;
  game.coins = Math.min(MAX_COINS, game.coins + goldEarned);
  game.playMs = Math.min(Number.MAX_SAFE_INTEGER, game.playMs + progressMs);
  game.lastTick = Math.max(previous, current);
  const completed = [];
  game.b.forEach((building, index) => {
    if (building.ok) return;
    building.p = Math.min(building.d, building.p + progressMs);
    if (building.p >= building.d) {
      building.ok = 1;
      building.ch = +!building.rewardClaimed;
      completed.push(index);
    }
  });
  return { elapsedMs, progressMs, offlineMs: progressMs, goldEarned, completed, capped: elapsedMs > MAX_OFFLINE_MS };
}

export function addBuilding(game, type, x, y, now = Date.now()) {
  if (!Object.hasOwn(BUILDINGS, type)) throw new Error('Choose a building from the shop.');
  if (!canBuild(game, x, y)) throw new Error('Choose a clear space on your island.');
  advanceGame(game, now);
  const price = buildingCost(game, type);
  if (game.coins < price) throw new Error('You need more game gold for this building.');
  const starter = price === 0 && type === 'cabin' && !game.tutorialDone;
  game.coins -= price;
  const building = { t: type, x, y, p: 0, d: starter ? 15000 : BUILDINGS[type].s * 1000, ok: 0, ch: 0, starter, rewardClaimed: false };
  game.b.push(building);
  if (starter) game.tutorialDone = true;
  return building;
}

export function collectBuilding(game, index) {
  const building = game.b[index];
  if (!building || !building.ok || !building.ch || building.rewardClaimed) return null;
  const gold = Math.round(BUILDINGS[building.t].c / 2) + 100;
  building.ch = 0;
  building.rewardClaimed = true;
  game.coins = Math.min(MAX_COINS, game.coins + gold);
  return { gold, building };
}

/** The UI checks the selected answer before calling this completion action. */
export function completeLesson(game, id) {
  const lesson = LESSONS.find(item => item.id === id);
  if (!lesson) throw new Error('Choose a lesson from the library.');
  if (game.lessons.includes(id)) return null;
  game.lessons.push(id);
  game.coins = Math.min(MAX_COINS, game.coins + lesson.gold);
  return { gold: lesson.gold, unlock: lesson.unlock };
}

export function setGoal(game, { name, targetPence, weeklyPence = 0 } = {}) {
  if (!finiteInt(targetPence) || targetPence < 100 || targetPence > MAX_GOAL_PENCE) throw new Error('Choose a goal between £1 and £10,000,000.');
  if (!finiteInt(weeklyPence) || weeklyPence < 0 || weeklyPence > MAX_GOAL_PENCE) throw new Error('Choose a valid weekly amount, or leave it at zero.');
  game.goal = { name: cleanName(name, 'My savings goal'), targetPence, weeklyPence };
  return game.goal;
}

export function goalProgress(game, balancePence) {
  if (!game.goal) return null;
  const savedPence = safeAmount(balancePence, 0, Number.MAX_SAFE_INTEGER);
  return {
    ...game.goal, savedPence,
    ratio: Math.min(1, savedPence / game.goal.targetPence),
    complete: savedPence >= game.goal.targetPence
  };
}

function validDecorationSpot(game, x, y) {
  if (!finiteInt(x) || !finiteInt(y) || x < 0 || y < 0 || x > 11 || y > 11) return false;
  if (x >= 4 && x < 7 && y >= 4 && y < 7) return false;
  return !game.b.some(b => x >= b.x && x < b.x + 2 && y >= b.y && y < b.y + 2) && !game.decorations.some(d => d.x === x && d.y === y);
}

export function decorate(game, kind, x, y) {
  const decoration = DECORATIONS[kind];
  if (!decoration || !Object.hasOwn(DECORATIONS, kind)) throw new Error('Choose a decoration from the collection.');
  if (decoration.lesson && !game.lessons.includes(decoration.lesson)) throw new Error('Complete its library lesson to unlock this decoration.');
  if (game.decorations.length >= 60) throw new Error('Your island has room for 60 decorations.');
  if (!validDecorationSpot(game, x, y)) throw new Error('Choose a clear spot for this decoration.');
  if (game.coins < decoration.cost) throw new Error('You need more game gold for this decoration.');
  game.coins -= decoration.cost;
  const placed = { kind, x, y };
  game.decorations.push(placed);
  return placed;
}
