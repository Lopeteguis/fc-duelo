// ============================================================
// FC DUELO — configuração, regras, física, times e utilitários
// ============================================================

// Dimensões em "metros" (pitch vertical: gol de cima = rival, gol de baixo = você)
export const PITCH = {
  W: 68, H: 105,
  halfW: 34, halfH: 52.5,
  goalW: 7.32,          // largura do gol
  postR: 0.17,          // raio do poste
  barH: 2.44,           // travessão
  goalDepth: 2.6,       // profundidade da rede
  boxW: 40.32, boxD: 16.5,   // grande área
  sixW: 18.32,  sixD: 5.5,   // pequena área
  centreR: 9.15,
  penSpot: 11,          // marca do pênalti
  cornerR: 1,
};

export const RULES = {
  matchReal: 180,       // duração real da partida em segundos (2 tempos)
  halfReal: 90,
  kickoffCd: 1.7,
  restartCd: 1.5,
  goalCel: 3.4,         // duração da comemoração
  frozenWall: 2.0,      // tempo que o desafiante fica parado na falta
};

export const PHYS = {
  gravity: 24,
  ballDrag: 0.85,       // atrito por segundo (exponencial)
  ballRoll: 1.6,        // freio constante no chão
  bounce: 0.55,
  spinDecay: 1.35,
  run: 7.4,             // velocidade normal (m/s)
  sprint: 10.4,         // velocidade correndo
  accel: 26,
  ctrlR: 1.5,           // raio de domínio
  kickR: 1.7,           // alcance do chute/passe
  slideTime: 0.5,
  slideSpeed: 13.5,
  slideCd: 1.1,
  stealR: 1.25,
};

// jogadores são um pouco maiores que na vida real (leitura no celular)
export const BODY = { r: 0.62, len: 2.15 };

export const TEAMS = [
  { id: 'BRA', name: 'Brasil',   abbr: 'BRA', shirt: '#f7d117', trim: '#00954a', shorts: '#00954a', socks: '#f7d117', gk: '#ff7b00', num: '#0a4d20', crest: '#00954a' },
  { id: 'ARG', name: 'Argentina', abbr: 'ARG', shirt: '#7ec2ec', trim: '#ffffff', shorts: '#ffffff', socks: '#ffffff', gk: '#20202a', num: '#0b3d91', crest: '#75aadb' },
  { id: 'POR', name: 'Portugal', abbr: 'POR', shirt: '#d21f33', trim: '#0a7a35', shorts: '#0a7a35', socks: '#d21f33', gk: '#f5f0e0', num: '#ffffff', crest: '#0a7a35' },
  { id: 'FRA', name: 'França',   abbr: 'FRA', shirt: '#22409b', trim: '#ffffff', shorts: '#ffffff', socks: '#d21f33', gk: '#9ef01a', num: '#ffffff', crest: '#22409b' },
];

export const DIFFS = {
  facil:   { label: 'Fácil',   aiSpeed: 0.88, aiReact: 0.46, aiShootErr: 0.17, aiTackle: 0.9,  aiPass: 0.55, gkReach: 2.0, gkReact: 0.34, aiSteal: 0.55 },
  medio:   { label: 'Médio',   aiSpeed: 0.97, aiReact: 0.30, aiShootErr: 0.11, aiTackle: 0.62, aiPass: 0.40, gkReach: 2.2, gkReact: 0.26, aiSteal: 0.75 },
  dificil: { label: 'Difícil', aiSpeed: 1.05, aiReact: 0.18, aiShootErr: 0.065, aiTackle: 0.40, aiPass: 0.26, gkReach: 2.42, gkReact: 0.18, aiSteal: 0.95 },
};

// ---------------- utilitários ----------------
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));

export function normAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// relógio exibido: mm:ss de 00:00 até 90:00
export function fmtClock(realSec, matchReal) {
  const total = clamp(realSec * (90 * 60) / matchReal, 0, 90 * 60);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function lerpColor(c1, c2, t) {
  const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const a = p(c1), b = p(c2);
  const r = Math.round(lerp(a[0], b[0], t)), g = Math.round(lerp(a[1], b[1], t)), bl = Math.round(lerp(a[2], b[2], t));
  return `rgb(${r},${g},${bl})`;
}
