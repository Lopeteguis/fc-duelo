// ============================================================
// FC DUELO — configuração e utilidades
// ============================================================

export const TAU = Math.PI * 2;

// Campo em metros (dimensões reais de campo de futebol)
export const PITCH = {
  W: 68,          // largura (x)
  H: 105,         // comprimento (y) — gols em y = 0 e y = H
  LineW: 0.25,
  GoalW: 7.32,    // largura do gol
  GoalD: 2,       // profundidade da rede
  BoxW: 40.32,    // área grande (largura)
  BoxD: 16.5,     // área grande (profundidade)
  SixW: 18.32,    // área pequena
  SixD: 5.5,
  PenSpot: 11,    // distância do pênalti
  CircleR: 9.15,
};

export const RULES = {
  halfRealSec: 180,     // 3 min reais por tempo (= 45 min de jogo)
  clockScale: 15,       // 1 real second = 15 match seconds
  kickoffPause: 1.4,
  goalCelebration: 3.4,
  halftimePause: 2.6,
};

export const PHYS = {
  ballR: 0.33,
  ballFriction: 1.35,      // desaceleração (m/s²)
  ballBounce: 0.55,
  gravity: 9.8,
  maxShotSpeed: 34,
  maxPassSpeed: 20,
  playerR: 0.55,
};

// Direções: home ataca para y = 0, away ataca para y = H
export const TEAMS = {
  home: {
    name: 'VOCÊ',
    shirt: '#1565d8', shirt2: '#0d3f92',
    short: '#ffffff', socks: '#1565d8',
    gkShirt: '#12a55c',
    skin: '#d8a06b',
    attackDir: -1, // ataca y diminuindo
  },
  away: {
    name: 'CPU',
    shirt: '#e23a3a', shirt2: '#961f1f',
    short: '#22262e', socks: '#e23a3a',
    gkShirt: '#f2a93b',
    skin: '#c9895a',
    attackDir: 1,
  },
};

export const DIFFS = [
  { name: 'FÁCIL',  speed: 0.86, react: 0.34, error: 0.30, gk: 0.80, aggression: 0.55 },
  { name: 'MÉDIO',  speed: 1.00, react: 0.20, error: 0.17, gk: 1.00, aggression: 0.78 },
  { name: 'DIFÍCIL',speed: 1.10, react: 0.11, error: 0.09, gk: 1.14, aggression: 0.95 },
];

// ---------- utilidades ----------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const normAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

export function fmtClock(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
