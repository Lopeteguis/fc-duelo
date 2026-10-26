// ============================================================
// FC DUELO — renderizador (Canvas 2D)
// Câmera, texturas do estádio/gramado, jogadores, bola e efeitos
// ============================================================
import { PITCH, TEAMS, clamp, lerp, TAU, rand } from './config.js';

export const cam = {
  x: 0, y: 0,
  scale: 8, base: 8,
  zoom: 1, zoomTarget: 1,
  shake: 0, _sx: 0, _sy: 0,
  flash: 0, flashColor: '255,255,255',
};

export let CW = 0, CH = 0, DPR = 1;

const PTEX = 12;   // px por metro na textura do gramado
const STEX = 7;    // px por metro na textura do estádio
const SEXT = { x0: -62, y0: -82, x1: 62, y1: 82 };

let pitchTex = null, stadTex = null, crowd = [];

export function w2sx(x) { return (x - cam.x) * cam.scale + CW / 2 + cam._sx; }
export function w2sy(y) { return (y - cam.y) * cam.scale + CH / 2 + cam._sy; }

export function resize(canvas) {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  CW = canvas.clientWidth || window.innerWidth;
  CH = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.max(1, Math.round(CW * DPR));
  canvas.height = Math.max(1, Math.round(CH * DPR));
}

// ------------------------------------------------------------
// Textura do estádio: volta, pista, placas e gols
// ------------------------------------------------------------
function buildStadium() {
  const w = (SEXT.x1 - SEXT.x0) * STEX, h = (SEXT.y1 - SEXT.y0) * STEX;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const X = (x) => (x - SEXT.x0) * STEX, Y = (y) => (y - SEXT.y0) * STEX;
  const R = (x, y, ww, hh) => g.fillRect(X(x), Y(y), ww * STEX, hh * STEX);

  // solo externo
  g.fillStyle = '#0a110d'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4200; i++) {
    g.fillStyle = Math.random() > .5 ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.25)';
    g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }
  // pista/apron ao redor do gramado
  g.fillStyle = '#182721';
  R(-37.2, -57.4, 74.4, 114.8);
  // faixa de contorno da pista
  g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 3;
  g.strokeRect(X(-37.2), Y(-57.4), 74.4 * STEX, 114.8 * STEX);
  // textura da pista
  for (let i = 0; i < 2600; i++) {
    const a = Math.random();
    g.fillStyle = a > .5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.18)';
    const px = X(-37.2) + Math.random() * 74.4 * STEX, py = Y(-57.4) + Math.random() * 114.8 * STEX;
    g.fillRect(px, py, 2.5, 2.5);
  }

  // placas de publicidade (base)
  const board = (x, y, ww, hh) => {
    g.fillStyle = '#0b1512'; g.fillRect(X(x), Y(y), ww * STEX, hh * STEX);
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(X(x), Y(y), ww * STEX, 0.14 * STEX);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(X(x), Y(y + hh - 0.14), ww * STEX, 0.14 * STEX);
  };
  board(-36.9, -55.6, 1.3, 111.2);      // esquerda
  board(35.6, -55.6, 1.3, 111.2);       // direita
  board(-35.6, -57.6, 71.2, 1.3);       // topo
  board(-35.6, 56.3, 71.2, 1.3);        // base

  // ---------- gols ----------
  const goal = (sign) => {
    const y0 = sign > 0 ? PITCH.halfH : -PITCH.halfH - PITCH.goalDepth;
    const gy0 = sign > 0 ? PITCH.halfH : -PITCH.halfH;
    const gw = PITCH.goalW;
    // fundo do gol (fora da linha)
    g.fillStyle = 'rgba(255,255,255,.10)';
    g.fillRect(X(-gw / 2), Y(y0), gw * STEX, (PITCH.goalDepth + 0.02) * STEX);
    // rede: malha
    g.strokeStyle = 'rgba(255,255,255,.42)'; g.lineWidth = 1;
    const step = 0.55 * STEX;
    const bx = X(-gw / 2), by = Y(y0), bw = gw * STEX, bh = PITCH.goalDepth * STEX;
    for (let px = bx; px <= bx + bw + 1; px += step) {
      g.beginPath(); g.moveTo(px, by); g.lineTo(px, by + bh); g.stroke();
    }
    for (let py = by; py <= by + bh + 1; py += step) {
      g.beginPath(); g.moveTo(bx, py); g.lineTo(bx + bw, py); g.stroke();
    }
    // sombra da rede no chão
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(X(-gw / 2 - 0.3), sign > 0 ? Y(gy0) : Y(gy0 - 0.1), (gw + 0.6) * STEX, 0.12 * STEX);
    // travessão e linhas laterais do gol
    g.fillStyle = '#f4f7f5';
    g.fillRect(X(-gw / 2 - 0.16), sign > 0 ? Y(gy0 - 0.16) : Y(gy0), (gw + 0.32) * STEX, 0.32 * STEX);
    g.fillRect(X(-gw / 2 - 0.16), y0 * 0 + Y(y0 + (sign > 0 ? 0 : 0)), 0.16 * STEX, PITCH.goalDepth * STEX);
    g.fillRect(X(gw / 2), Y(y0), 0.16 * STEX, PITCH.goalDepth * STEX);
    // postes (círculos brancos)
    g.fillStyle = '#ffffff';
    for (const px of [-gw / 2, gw / 2]) {
      g.beginPath();
      g.arc(X(px), Y(gy0), PITCH.postR * STEX, 0, TAU);
      g.fill();
    }
  };
  goal(1); goal(-1);

  return c;
}

// ------------------------------------------------------------
// Textura do gramado: grama, listras e marcações
// ------------------------------------------------------------
function buildPitch() {
  const w = PITCH.W * PTEX, h = PITCH.H * PTEX;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const X = (x) => (x + PITCH.halfW) * PTEX, Y = (y) => (y + PITCH.halfH) * PTEX;

  g.fillStyle = '#2c7c3d'; g.fillRect(0, 0, w, h);

  // listras de corte de grama
  const band = 7 * PTEX;
  for (let i = 0, y = 0; y < h + band; i++, y += band) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.06)';
    g.fillRect(0, y, w, band);
  }
  // grão da grama
  for (let i = 0; i < 16000; i++) {
    const a = Math.random();
    g.fillStyle = a > .55 ? 'rgba(190,255,190,.05)' : 'rgba(0,40,0,.07)';
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  // manchas de desgaste
  for (let i = 0; i < 26; i++) {
    const cx = Math.random() * w, cy = Math.random() * h, r = (8 + Math.random() * 26);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, 'rgba(150,140,70,.10)'); gr.addColorStop(1, 'rgba(150,140,70,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  }

  // --------- marcações ---------
  const LW = 0.16 * PTEX;
  g.strokeStyle = 'rgba(255,255,255,.93)'; g.lineWidth = LW;
  g.lineCap = 'butt';

  const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x2), Y(y2)); g.stroke(); };
  const circ = (cx, cy, r) => { g.beginPath(); g.arc(X(cx), Y(cy), r * PTEX, 0, TAU); g.stroke(); };
  const dot = (cx, cy, r = 0.22) => { g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(X(cx), Y(cy), r * PTEX, 0, TAU); g.fill(); };
  const arc = (cx, cy, r, a0, a1) => { g.beginPath(); g.arc(X(cx), Y(cy), r * PTEX, a0, a1); g.stroke(); };

  // limites
  g.strokeRect(X(-PITCH.halfW), Y(-PITCH.halfH), PITCH.W * PTEX, PITCH.H * PTEX);
  // linha central + círculo
  line(-PITCH.halfW, 0, PITCH.halfW, 0);
  circ(0, 0, PITCH.centreR);
  dot(0, 0);
  // grandes e pequenas áreas + marcações de pênalti
  for (const s of [1, -1]) {
    const gl = s * PITCH.halfH;
    g.strokeRect(X(-PITCH.boxW / 2), Y(Math.min(gl, gl - s * PITCH.boxD)), PITCH.boxW * PTEX, PITCH.boxD * PTEX);
    g.strokeRect(X(-PITCH.sixW / 2), Y(Math.min(gl, gl - s * PITCH.sixD)), PITCH.sixW * PTEX, PITCH.sixD * PTEX);
    const spot = gl - s * PITCH.penSpot;
    dot(0, spot);
    // arco da grande área
    const front = gl - s * PITCH.boxD;
    if (s > 0) arc(0, spot, PITCH.centreR, Math.PI * 1.18, Math.PI * 1.82);
    else arc(0, spot, PITCH.centreR, Math.PI * 0.18, Math.PI * 0.82);
  }
  // escanteios
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    arc(sx * PITCH.halfW, sy * PITCH.halfH, PITCH.cornerR,
      sx > 0 ? (sy > 0 ? Math.PI : Math.PI * 1.5) : (sy > 0 ? Math.PI * 0.5 : 0),
      sx > 0 ? (sy > 0 ? Math.PI * 1.5 : Math.PI * 2) : (sy > 0 ? Math.PI : Math.PI * 1.5));
  }

  // vinheta suave nas bordas do gramado
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.28)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);

  return c;
}

function buildCrowd() {
  const dots = [];
  const cols = ['#e6e9ea', '#c7ccd0', '#f3d34a', '#d95b4a', '#5aa9e6', '#8f96a0', '#f0f0f0', '#3f6f4f', '#e8a33d'];
  const put = (x0, x1, y0, y1) => {
    for (let x = x0; x <= x1; x += 1.05) {
      for (let y = y0; y <= y1; y += 1.05) {
        if (Math.random() < 0.22) continue; // lugares vazios
        dots.push({
          x: x + rand(-0.28, 0.28), y: y + rand(-0.28, 0.28),
          c: cols[(Math.random() * cols.length) | 0],
          ph: Math.random() * TAU, sz: rand(0.3, 0.46),
        });
      }
    }
  };
  put(-57, -38.4, -78, 78);
  put(38.4, 57, -78, 78);
  put(-37.6, 37.6, -79, -59.6);
  put(-37.6, 37.6, 59.6, 79);
  return dots;
}

export function buildTextures() {
  if (pitchTex) return;
  stadTex = buildStadium();
  pitchTex = buildPitch();
  crowd = buildCrowd();
}

// ------------------------------------------------------------
// anúncios rolando nas placas
// ------------------------------------------------------------
const ADS = ['FC DUELO', 'KICKOFF SPORT', 'GOLEIRO TV', 'ENERGY+', 'CAMPEONATO 1V1', 'MAXTRAB'];

function drawAds(g, t) {
  const U = cam.scale;
  g.save();
  g.font = `800 ${0.62 * U}px "Arial Black", Impact, sans-serif`;
  g.textBaseline = 'middle';
  const strip = (x, y, w, h, vertical) => {
    g.save();
    g.beginPath(); g.rect(w2sx(x), w2sy(y), w * U, h * U); g.clip();
    g.fillStyle = 'rgba(10,22,16,.9)';
    g.fillRect(w2sx(x), w2sy(y), w * U, h * U);
    g.fillStyle = 'rgba(255,213,74,.92)';
    g.strokeStyle = 'rgba(4,10,7,.85)';
    g.lineWidth = 3;
    const total = vertical ? h : w;
    const cycle = 9;
    const off = ((t * 1.6) % cycle);
    if (vertical) {
      g.translate(w2sx(x + w / 2), w2sy(y));
      g.rotate(Math.PI / 2);
      g.textAlign = 'left';
      for (let i = -1; i < total / cycle + 2; i++) {
        const p = i * cycle - off;
        const s = ADS[((i % ADS.length) + ADS.length) % ADS.length];
        g.strokeText(s, p * U, 0); g.fillText(s, p * U, 0);
      }
    } else {
      g.textAlign = 'left';
      for (let i = -1; i < total / cycle + 2; i++) {
        const p = i * cycle - off;
        const s = ADS[((i % ADS.length) + ADS.length) % ADS.length];
        g.strokeText(s, w2sx(x) + p * U, w2sy(y + h / 2));
        g.fillText(s, w2sx(x) + p * U, w2sy(y + h / 2));
      }
    }
    g.restore();
  };
  strip(-36.9, -55.6, 1.3, 111.2, true);
  strip(35.6, -55.6, 1.3, 111.2, true);
  strip(-35.6, -57.6, 71.2, 1.3, false);
  strip(-35.6, 56.3, 71.2, 1.3, false);
  g.restore();
}

function drawCrowd(g, t, excite) {
  const U = cam.scale;
  const x0 = cam.x - CW / 2 / U - 2, x1 = cam.x + CW / 2 / U + 2;
  const y0 = cam.y - CH / 2 / U - 3, y1 = cam.y + CH / 2 / U + 3;
  const amp = 0.22 + excite * 1.4;
  for (let i = 0; i < crowd.length; i++) {
    const d = crowd[i];
    if (d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1) continue;
    const bob = Math.sin(t * (2.4 + excite * 6) + d.ph) * amp;
    g.fillStyle = d.c;
    g.fillRect(w2sx(d.x) - d.sz * U * 0.5, w2sy(d.y + bob) - d.sz * U * 0.5, d.sz * U, d.sz * U);
  }
}

// ------------------------------------------------------------
// jogadores
// ------------------------------------------------------------
function drawShadow(g, x, y, rx, ry, a) {
  g.save();
  g.translate(w2sx(x) + cam.scale * 0.3, w2sy(y) + cam.scale * 0.42);
  g.scale(1, 0.72);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx * cam.scale);
  gr.addColorStop(0, `rgba(0,0,0,${a})`);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, rx * cam.scale, 0, TAU); g.fill();
  g.restore();
}

function drawPlayer(g, p, S, t) {
  const U = cam.scale;
  const kit = S.teams[p.team];
  const face = p.face;

  g.save();
  g.translate(w2sx(p.x), w2sy(p.y));
  g.rotate(face + Math.PI / 2);   // -Y = direção do olhar

  const slide = p.slideT > 0;
  const dive = p.diveT > 0;
  const prone = slide || dive;
  const run = p.anim;
  const sp = clamp(p.spd / 9, 0, 1);
  const wob = Math.sin(run * 2) * 0.04 * sp;

  if (prone) g.scale(dive ? 1.05 : 0.95, dive ? 1.5 : 1.45);
  if (slide) g.rotate(0.18);
  g.translate(0, -0.05 * U);

  const L = (x1, y1, x2, y2, w, col) => {
    g.strokeStyle = col; g.lineWidth = w * U; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x1 * U, y1 * U); g.lineTo(x2 * U, y2 * U); g.stroke();
  };
  const rect = (x, y, w, h, col, r = 0.06) => {
    g.fillStyle = col;
    const rw = w * U, rh = h * U, rx = x * U - rw / 2, ry = y * U - rh / 2;
    const rr = Math.min(r * U, rw / 2, rh / 2);
    g.beginPath();
    g.moveTo(rx + rr, ry);
    g.arcTo(rx + rw, ry, rx + rw, ry + rh, rr);
    g.arcTo(rx + rw, ry + rh, rx, ry + rh, rr);
    g.arcTo(rx, ry + rh, rx, ry, rr);
    g.arcTo(rx, ry, rx + rw, ry, rr);
    g.closePath(); g.fill();
  };

  // ---- pernas (animação de corrida) ----
  if (!prone || dive) {
    const swing = prone ? 0.85 : Math.sin(run) * 0.62 * (0.35 + sp);
    for (const side of [-1, 1]) {
      const ph = side > 0 ? swing : -swing;
      const hipX = 0.2 * side, hipY = 0.3;
      const footY = hipY + 0.55 - ph * 0.55;
      const footX = hipX + ph * 0.12;
      L(hipX, hipY, footX, footY, 0.2, '#e8b98d');         // perna
      L(footX, footY - 0.02, footX, footY + 0.16, 0.22, kit.socks); // meião
      g.fillStyle = '#14161a';                               // chuteira
      g.beginPath();
      g.ellipse(footX * U, (footY + 0.2) * U, 0.16 * U, 0.1 * U, 0, 0, TAU);
      g.fill();
    }
  }

  // ---- braços ----
  const armSw = prone ? 0.9 : Math.sin(run) * 0.5 * (0.3 + sp);
  for (const side of [-1, 1]) {
    const ph = side > 0 ? -armSw : armSw;
    const shX = 0.44 * side, shY = -0.3;
    const hx = shX + 0.12 * side + ph * 0.1, hy = shY + 0.5 + ph * 0.3;
    L(shX, shY, hx, hy, 0.18, kit.shirt);
    g.fillStyle = '#e8b98d';
    g.beginPath(); g.arc(hx * U, hy * U, 0.11 * U, 0, TAU); g.fill();
    if (p.gk) {  // luvas
      g.fillStyle = p.team === 0 ? '#12233d' : '#f2f2f2';
      g.beginPath(); g.arc(hx * U, hy * U, 0.16 * U, 0, TAU); g.fill();
    }
  }

  // ---- shorts + camisa ----
  rect(0, 0.2, 0.86, 0.6, kit.shorts, 0.14);
  const grd = g.createLinearGradient(-0.45 * U, -0.7 * U, 0.45 * U, 0.4 * U);
  grd.addColorStop(0, kit.shirt);
  grd.addColorStop(1, shade(kit.shirt, -0.18));
  g.fillStyle = grd;
  rect(0, -0.16 + wob, 0.9, 1.0, kit.shirt, 0.2);
  // gola / detalhe
  g.fillStyle = kit.trim;
  g.fillRect(-0.45 * U, (-0.66 + wob) * U, 0.9 * U, 0.12 * U);
  // faixa lateral
  g.fillStyle = kit.trim;
  g.globalAlpha = 0.85;
  g.fillRect(-0.45 * U, (-0.5 + wob) * U, 0.1 * U, 0.75 * U);
  g.fillRect(0.35 * U, (-0.5 + wob) * U, 0.1 * U, 0.75 * U);
  g.globalAlpha = 1;

  // ---- cabeça ----
  g.fillStyle = '#e8b98d';
  g.beginPath(); g.arc(0, (-0.74 + wob) * U, 0.33 * U, 0, TAU); g.fill();
  g.fillStyle = p.hair || '#241a12';
  g.beginPath(); g.arc(0, (-0.78 + wob) * U, 0.33 * U, Math.PI * 0.06, Math.PI * 0.94);
  g.arc(0, (-0.74 + wob) * U, 0.3 * U, Math.PI * 0.94, Math.PI * 0.06, true);
  g.fill();

  g.restore();

  // ---- número (sempre legível) ----
  {
    g.save();
    g.translate(w2sx(p.x), w2sy(p.y));
    g.font = `900 ${0.5 * U}px "Arial Black", Impact, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 0.07 * U; g.strokeStyle = 'rgba(0,0,0,.4)';
    g.fillStyle = kit.num;
    g.strokeText(p.num, 0, -0.1 * U);
    g.fillText(p.num, 0, -0.1 * U);
    g.restore();
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r * (1 + amt)), 0, 255);
  g = clamp(Math.round(g * (1 + amt)), 0, 255);
  b = clamp(Math.round(b * (1 + amt)), 0, 255);
  return `rgb(${r},${g},${b})`;
}

// ------------------------------------------------------------
// bola
// ------------------------------------------------------------
function drawBall(g, b, t) {
  const U = cam.scale;
  const gx = w2sx(b.x), gy = w2sy(b.y);
  const h = b.z;
  const by = gy - h * U * 0.62;
  const r = (0.34 + h * 0.012) * U;

  // rastro
  if (b.trail) {
    for (let i = 0; i < b.trail.length; i++) {
      const p = b.trail[i], a = (i / b.trail.length) * 0.25;
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.beginPath(); g.arc(w2sx(p.x), w2sy(p.y) - p.z * U * 0.62, r * (0.5 + i / b.trail.length * 0.4), 0, TAU); g.fill();
    }
  }

  // sombra (cresce e afina com a altura)
  const shR = r * (1.15 - Math.min(h * 0.06, 0.55));
  const gr = g.createRadialGradient(gx + h * U * 0.1, gy + h * U * 0.06, 0, gx, gy, shR * 1.5);
  gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(gx, gy, shR * 1.5, 0, TAU); g.fill();

  // corpo da bola
  g.save();
  g.translate(gx, by);
  const spin = b.roll || 0;
  const bg = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.75, '#f2f4f3'); bg.addColorStop(1, '#b9c0bd');
  g.fillStyle = bg;
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();

  // padrão (pentágonos)
  g.fillStyle = '#171a1c';
  for (let i = 0; i < 5; i++) {
    const a = spin * 0.6 + (i / 5) * TAU;
    const rr = r * 0.62;
    g.beginPath();
    g.arc(Math.cos(a) * rr, Math.sin(a) * rr, r * 0.26, 0, TAU);
    g.fill();
  }
  g.beginPath(); g.arc(0, 0, r * 0.2, 0, TAU); g.fill();
  // brilho
  g.fillStyle = 'rgba(255,255,255,.75)';
  g.beginPath(); g.arc(-r * 0.36, -r * 0.4, r * 0.22, 0, TAU); g.fill();
  g.restore();
}

// ------------------------------------------------------------
// partículas
// ------------------------------------------------------------
function drawParticles(g, S) {
  for (const p of S.particles) {
    const k = p.life / p.max;
    if (p.kind === 'confetti') {
      g.save();
      g.translate(w2sx(p.x), w2sy(p.y) - p.z * cam.scale * 0.62);
      g.rotate(p.rot);
      g.globalAlpha = Math.min(1, k * 1.6);
      g.fillStyle = p.color;
      g.fillRect(-p.size * cam.scale * 0.5, -p.size * cam.scale * 0.3, p.size * cam.scale, p.size * cam.scale * 0.6);
      g.restore();
    } else if (p.kind === 'dust') {
      g.globalAlpha = k * 0.5;
      g.fillStyle = p.color || '#d9d2b8';
      g.beginPath();
      g.arc(w2sx(p.x), w2sy(p.y), p.size * cam.scale * (1.6 - k), 0, TAU);
      g.fill();
    } else if (p.kind === 'ring') {
      g.globalAlpha = k * 0.8;
      g.strokeStyle = p.color || '#ffffff';
      g.lineWidth = Math.max(1, p.width * cam.scale * k);
      const r = lerp(p.r0, p.r1, 1 - k) * cam.scale;
      g.beginPath(); g.arc(w2sx(p.x), w2sy(p.y), r, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
  }
}

// ------------------------------------------------------------
// frame principal
// ------------------------------------------------------------
export function draw(g, S, t) {
  buildTextures();
  g.setTransform(DPR, 0, 0, DPR, 0, 0);

  // câmera
  cam.base = Math.min(CW / 44, CH / 96);
  cam.zoom = lerp(cam.zoom, cam.zoomTarget, 0.12);
  cam.scale = cam.base * cam.zoom;
  cam.shake = Math.max(0, cam.shake - 0.06);
  cam._sx = cam.shake > 0.01 ? rand(-1, 1) * cam.shake * 14 : 0;
  cam._sy = cam.shake > 0.01 ? rand(-1, 1) * cam.shake * 14 : 0;

  g.fillStyle = '#050d09';
  g.fillRect(0, 0, CW, CH);

  const ox = CW / 2 + cam._sx, oy = CH / 2 + cam._sy;

  // ---- texturas do mundo ----
  g.save();
  g.translate(ox, oy);
  g.scale(cam.scale, cam.scale);
  g.translate(-cam.x, -cam.y);
  g.drawImage(stadTex, SEXT.x0, SEXT.y0, SEXT.x1 - SEXT.x0, SEXT.y1 - SEXT.y0);
  g.drawImage(pitchTex, -PITCH.halfW, -PITCH.halfH, PITCH.W, PITCH.H);
  g.restore();

  const U = cam.scale;

  // ---- arquibancada animada + anúncios ----
  drawCrowd(g, t, S.crowdExcite || 0);
  drawAds(g, t);

  // ---- refletores ----
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const [fx, fy] of [[-30, -46], [30, -46], [-30, 46], [30, 46]]) {
    const gr = g.createRadialGradient(w2sx(fx), w2sy(fy), 0, w2sx(fx), w2sy(fy), 46 * U);
    gr.addColorStop(0, 'rgba(255,247,214,.10)');
    gr.addColorStop(1, 'rgba(255,247,214,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(w2sx(fx), w2sy(fy), 46 * U, 0, TAU); g.fill();
  }
  g.restore();

  // ---- sombras dos jogadores ----
  for (const p of S.players) drawShadow(g, p.x, p.y, 0.9, 0.9, 0.42);

  // ---- jogadores (ordenados por profundidade) ----
  const list = S.players.slice().sort((a, b) => a.y - b.y);
  for (const p of list) drawPlayer(g, p, S, t);

  // ---- bola ----
  drawBall(g, S.ball, t);

  // ---- partículas ----
  drawParticles(g, S);

  // ---- marcador do jogador controlado + stamina ----
  const c = S.controlled;
  if (c && !c.gk) {
    g.save();
    g.translate(w2sx(c.x), w2sy(c.y));
    // anel no chão
    g.strokeStyle = S.teams[c.team].shirt;
    g.globalAlpha = 0.9;
    g.lineWidth = Math.max(2, 0.1 * U);
    g.beginPath(); g.ellipse(0, 0.55 * U, 0.95 * U, 0.42 * U, 0, 0, TAU); g.stroke();
    // seta
    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    const ay = -1.75 * U + Math.sin(t * 4) * 0.08 * U;
    g.beginPath();
    g.moveTo(0, ay + 0.34 * U);
    g.lineTo(-0.3 * U, ay - 0.16 * U);
    g.lineTo(0.3 * U, ay - 0.16 * U);
    g.closePath();
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6;
    g.fill();
    g.restore();
    // barra de stamina
    const bw = 1.3 * U, bh = Math.max(3, 0.17 * U);
    const sx = w2sx(c.x) - bw / 2, sy = w2sy(c.y) - 2.35 * U;
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(sx - 1, sy - 1, bw + 2, bh + 2);
    const st = clamp(c.stamina, 0, 1);
    g.fillStyle = st > 0.55 ? '#4ade80' : st > 0.25 ? '#facc15' : '#f43f5e';
    g.fillRect(sx, sy, bw * st, bh);
  }

  // ---- bandeira de impedimento/contagem do set-piece ----
  if (S.phase === 'setpiece' && S.restart && S.restart.cd > 0) {
    const b = S.ball;
    const pulse = 0.6 + Math.sin(t * 9) * 0.35;
    g.strokeStyle = `rgba(255,213,74,${pulse})`;
    g.lineWidth = Math.max(2, 0.12 * U);
    g.beginPath(); g.arc(w2sx(b.x), w2sy(b.y), (1.6 + (1 - S.restart.cd / 1.5) * 1.4) * U, 0, TAU); g.stroke();
  }

  // ---- vinheta + flash ----
  const vg = g.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.35, CW / 2, CH / 2, Math.max(CW, CH) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.5)');
  g.fillStyle = vg; g.fillRect(0, 0, CW, CH);

  if (cam.flash > 0.01) {
    g.fillStyle = `rgba(${cam.flashColor},${cam.flash * 0.75})`;
    g.fillRect(0, 0, CW, CH);
  }
}

// ------------------------------------------------------------
// radar (minimapa)
// ------------------------------------------------------------
export function drawRadar(g, S, dpr) {
  const w = g.canvas.width / dpr, h = g.canvas.height / dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const pad = 5;
  const s = Math.min((w - pad * 2) / PITCH.W, (h - pad * 2) / PITCH.H);
  if (!(s > 0)) return;
  const ox = (w - PITCH.W * s) / 2, oy = (h - PITCH.H * s) / 2;
  const X = (x) => ox + (x + PITCH.halfW) * s;
  const Y = (y) => oy + (y + PITCH.halfH) * s;

  g.fillStyle = 'rgba(38,110,66,.9)';
  g.fillRect(X(-PITCH.halfW), Y(-PITCH.halfH), PITCH.W * s, PITCH.H * s);
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1;
  g.strokeRect(X(-PITCH.halfW), Y(-PITCH.halfH), PITCH.W * s, PITCH.H * s);
  g.beginPath(); g.moveTo(X(-PITCH.halfW), Y(0)); g.lineTo(X(PITCH.halfW), Y(0)); g.stroke();
  g.beginPath(); g.arc(X(0), Y(0), PITCH.centreR * s, 0, TAU); g.stroke();
  // gols
  g.fillStyle = 'rgba(255,255,255,.75)';
  g.fillRect(X(-PITCH.goalW / 2), Y(PITCH.halfH) - 2, PITCH.goalW * s, 2);
  g.fillRect(X(-PITCH.goalW / 2), Y(-PITCH.halfH), PITCH.goalW * s, 2);

  for (const p of S.players) {
    const isC = S.controlled === p;
    g.fillStyle = isC ? '#ffffff' : (p.team === 0 ? S.teams[0].shirt : '#ff5b5b');
    g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 1;
    const r = p.gk ? 2.2 : 3;
    g.beginPath(); g.arc(X(p.x), Y(p.y), r, 0, TAU);
    g.fill(); g.stroke();
    if (isC) { g.strokeStyle = '#ffd54a'; g.beginPath(); g.arc(X(p.x), Y(p.y), r + 2.4, 0, TAU); g.stroke(); }
  }
  // bola
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(X(S.ball.x), Y(S.ball.y), 2, 0, TAU); g.fill();
}
