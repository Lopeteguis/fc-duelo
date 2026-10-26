// FC DUELO — motor do jogo (física, IA, regras, fluxo)
import { PITCH, RULES, PHYS, TEAMS, DIFFS, clamp, lerp, dist, rand, damp, fmtClock, normAngle, TAU } from './config.js';
import { SFX, setMuted, isMuted } from './audio.js';
import { cam, resize, draw, drawRadar, CW, CH } from './render.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#game');
const ctx = canvas.getContext('2d', { alpha: false });
const radar = $('#radar');
const rctx = radar.getContext('2d');
const FIXED = 1 / 120;

let S = null;
let paused = false;
let slowmo = 0;
let wallT = 0, lastT = 0, acc = 0;
let userIdx = 0, cpuIdx = 1, diffKey = 'medio';
let charge = 0;
let bannerTimer = null;
let rafStarted = false;

const input = {
  joy: false, jx: 0, jy: 0, mag: 0, angle: 0, pointerId: null, ox: 0, oy: 0,
  sprint: false, shoot: false, shootUp: false, pass: false, tackle: false,
  keys: new Set(),
};

const fieldOf = (team) => S.players.find((p) => !p.gk && p.team === team);
const gkOf = (team) => S.players.find((p) => p.gk && p.team === team);

function newStats() { return { shots: 0, on: 0, fouls: 0, corners: 0, saves: 0, passes: 0, tackles: 0, poss: 0 }; }

function mkPlayer(team, gk, num) {
  return {
    team, gk, num,
    x: 0, y: 0, vx: 0, vy: 0, spd: 0, face: team === 0 ? -Math.PI / 2 : Math.PI / 2,
    anim: rand(0, 6), stamina: 1,
    wish: { x: 0, y: 0 }, sprintBtn: false,
    slideT: 0, slideCd: 0, slideDone: false,
    stunT: 0, pinned: 0, spurtT: 0,
    diveT: 0, diveX: 0, diveDir: 0,
    holdT: 0, touchCd: 0, touchOff: 0,
    shootCd: 0, aiT: rand(0, 0.3), driftT: 0, drift: 0, diveCd: 0,
    carded: false, sprintFx: 0,
    hair: ['#241a12', '#3b2a1c', '#111111', '#5a3a20'][(Math.random() * 4) | 0],
  };
}

function newMatch() {
  const A = TEAMS[userIdx], B = TEAMS[cpuIdx];
  S = {
    phase: 'setpiece', time: 0, half: 1, teams: [A, B], score: [0, 0],
    players: [mkPlayer(0, false, 10), mkPlayer(1, false, 9), mkPlayer(0, true, 1), mkPlayer(1, true, 1)],
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, roll: 0, owner: null, lastTouch: null, trail: [], noTouch: null, noTouchT: 0 },
    particles: [], controlled: null, restart: null, crowdExcite: 0,
    stats: [newStats(), newStats()], diff: DIFFS[diffKey], scoring: -1, goalT: 0,
  };
  S.controlled = S.players[0];
  setupScoreboard();
  kickoff(0);
}

function setupScoreboard() {
  const [A, B] = S.teams;
  $('#abbrA').textContent = A.abbr; $('#abbrB').textContent = B.abbr;
  $('#crestA').style.background = `linear-gradient(135deg, ${A.shirt} 55%, ${A.trim} 55%)`;
  $('#crestB').style.background = `linear-gradient(135deg, ${B.shirt} 55%, ${B.trim} 55%)`;
}

function setPiece(type, team, x, y, opts = {}) {
  const b = S.ball;
  b.x = x; b.y = y; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0;
  b.owner = null; b.lastTouch = null; b.trail.length = 0; b.noTouch = null;
  S.phase = 'setpiece';
  S.restart = { type, team, x, y, cd: opts.cd ?? (type === 'kickoff' ? RULES.kickoffCd : RULES.restartCd) };
  const taker = fieldOf(team), other = fieldOf(1 - team);
  const ownDir = team === 0 ? 1 : -1;
  const otherDir = -ownDir;
  const place = (p, px, py) => {
    p.x = clamp(px, -PITCH.halfW + 1, PITCH.halfW - 1);
    p.y = clamp(py, -PITCH.halfH - 2, PITCH.halfH + 2);
    p.vx = p.vy = 0; p.slideT = 0; p.stunT = 0; p.spurtT = 0; p.diveT = 0;
    p.face = normAngle(Math.atan2(y - p.y, x - p.x));
  };
  if (type === 'kickoff') {
    place(taker, x, y + ownDir * 1.5);
    place(other, 0, otherDir * 9);
    taker.face = team === 0 ? -Math.PI / 2 : Math.PI / 2;
    other.face = team === 0 ? Math.PI / 2 : -Math.PI / 2;
  } else if (type === 'penalty') {
    const goalY = team === 0 ? -PITCH.halfH : PITCH.halfH;
    place(taker, x + rand(-0.4, 0.4), y - Math.sign(goalY - y) * 2.4);
    const defY = team === 0 ? PITCH.halfH : -PITCH.halfH;
    place(other, rand(-16, 16), defY + (team === 0 ? -1 : 1) * (PITCH.boxD + 3));
    other.pinned = RULES.frozenWall;
  } else {
    const away = type === 'freeKick' ? 8 : 6.5;
    place(taker, x + rand(-0.6, 0.6), y + ownDir * 1.6);
    place(other, x, y + otherDir * away);
    if (type === 'freeKick') other.pinned = RULES.frozenWall;
  }
  for (const gk of S.players.filter((p) => p.gk)) {
    gk.holdT = 0; gk.diveT = 0; gk.vx = gk.vy = 0;
    const gy = gk.team === 0 ? PITCH.halfH - 5.5 : -PITCH.halfH + 5.5;
    const back = type === 'goalKick' && gk.team === team;
    gk.x = back ? x * 0.5 : clamp(x * 0.35, -PITCH.goalW, PITCH.goalW);
    gk.y = back ? (gk.team === 0 ? PITCH.halfH - 3 : -PITCH.halfH + 3) : gy;
  }
}

function kickoff(team) { setPiece('kickoff', team, 0, 0); }

function startPlay() { S.phase = 'play'; S.restart = null; SFX.whistle(false); }

function banner(main, sub = '', kind = '', dur = 1800) {
  const el = $('#banner'), m = $('#bannerMain'), s = $('#bannerSub');
  m.textContent = main; m.className = kind || ''; s.textContent = sub;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), dur);
}

const SCREENS = ['menu', 'pause', 'half', 'full'];
function onlyScreen(id) { for (const s of SCREENS) $('#' + s).classList.toggle('hidden', s !== id); }

function kickBall(p, ang, power, opts = {}) {
  const b = S.ball;
  const spd = (opts.loft ? 15 : 18) + power * 27;
  const from = { x: b.x, y: b.y };
  b.owner = null; b.lastTouch = p; b.noTouch = p; b.noTouchT = 0.3;
  b.vx = Math.cos(ang) * spd; b.vy = Math.sin(ang) * spd;
  b.vz = opts.loft ? (opts.vz ?? 5 + power * 6) : (power > 0.55 ? (power - 0.5) * 6 : 0);
  b.spin = opts.spin || 0; b.trail.length = 0; p.touchCd = 0.3;
  if (opts.shot) S.stats[p.team].shots++;
  if (opts.pass) S.stats[p.team].passes++;
  SFX.kick(power);
  cam.shake = Math.min(1, cam.shake + power * 0.3);
  ring(from.x, from.y, 'rgba(255,255,255,.7)', 0.2, 1.1, 0.3);
}

function releaseShoot() {
  const p = S.controlled, b = S.ball;
  const power = clamp(charge, 0.16, 1);
  const aim = input.mag > 0.35 ? input.angle : p.face;
  charge = 0;
  if (b.owner === p) kickBall(p, aim, power, { shot: true });
  else if (dist(p.x, p.y, b.x, b.y) < PHYS.kickR + 0.4 && b.z < 2.2) kickBall(p, aim, power, { shot: true });
}

function doPass(p) {
  const b = S.ball;
  if (b.owner !== p) return;
  const gk = gkOf(p.team);
  const tx = gk.x + gk.vx * 0.35, ty = gk.y + gk.vy * 0.35;
  const ang = Math.atan2(ty - p.y, tx - p.x);
  const d = dist(p.x, p.y, tx, ty);
  const power = clamp(d / 44, 0.35, 0.85);
  kickBall(p, ang, power, { loft: true, vz: clamp(d * 0.17, 3.5, 7.5), pass: true });
  SFX.pass();
}

function doTackle(p) {
  const b = S.ball;
  if (b.owner === p) {
    if (p.spurtT > 0) return;
    p.spurtT = 0.45;
    const side = Math.random() < 0.5 ? -1 : 1;
    const a = p.face + side * Math.PI * 0.42;
    p.vx += Math.cos(a) * 8.5; p.vy += Math.sin(a) * 8.5;
    p.face = normAngle(p.face + side * 0.7);
    b.noTouch = null; b.noTouchT = 0;
    dust(p.x, p.y, 6); SFX.tackle();
    if (navigator.vibrate) navigator.vibrate(15);
    return;
  }
  if (p.slideCd > 0 || p.slideT > 0 || p.stunT > 0) return;
  p.slideT = PHYS.slideTime; p.slideCd = PHYS.slideCd + 0.7; p.slideDone = false;
  p.vx = Math.cos(p.face) * PHYS.slideSpeed; p.vy = Math.sin(p.face) * PHYS.slideSpeed;
  dust(p.x, p.y, 10); SFX.tackle();
  if (navigator.vibrate) navigator.vibrate(20);
}

function foul(by, victim) {
  S.stats[by.team].fouls++;
  SFX.whistle(true);
  const boxY = by.team === 0 ? PITCH.halfH : -PITCH.halfH;
  const inBox = Math.abs(victim.x) < PITCH.boxW / 2 && Math.abs(victim.y - boxY) < PITCH.boxD;
  const spot = { x: clamp(victim.x, -PITCH.halfW + 2, PITCH.halfW - 2), y: clamp(victim.y, -PITCH.halfH + 2, PITCH.halfH - 2) };
  const victimTeam = victim.team;
  if (!by.carded && Math.random() < 0.55) {
    by.carded = true;
    setTimeout(() => { banner('CARTÃO AMARELO', `${S.teams[by.team].abbr} · Nº ${by.num}`, 'red', 1700); SFX.card(); }, 350);
  }
  if (inBox) {
    const py = boxY + (by.team === 0 ? -1 : 1) * PITCH.penSpot;
    setPiece('penalty', victimTeam, 0, py);
    banner('PÊNALTI!', S.teams[victimTeam].abbr, 'gold', 1900);
  } else {
    setPiece('freeKick', victimTeam, spot.x, spot.y);
    banner('FALTA', `${S.teams[by.team].abbr} · ${S.teams[victimTeam].abbr}`, 'gold', 1500);
  }
}

function goalLine(sign) {
  const conceding = sign > 0 ? 0 : 1;
  const scoring = 1 - conceding;
  S.score[scoring]++; S.stats[scoring].on++;
  S.phase = 'goal'; S.scoring = scoring; S.goalT = RULES.goalCel;
  slowmo = 1.4; cam.zoomTarget = 1.55; cam.shake = 1; cam.flash = 1; cam.flashColor = '255,255,255';
  S.crowdExcite = 1;
  const b = S.ball;
  confetti(b.x, b.y, S.teams[scoring]);
  SFX.goal();
  if (navigator.vibrate) navigator.vibrate([50, 70, 130]);
  const who = fieldOf(scoring);
  banner('GOL!', `${S.teams[scoring].abbr} · Nº ${who.num} · ${S.score[0]}–${S.score[1]}`, 'gold', 2600);
  S.ball.owner = null; S.ball.vx *= 0.2; S.ball.vy *= 0.2;
}

function checkBounds() {
  const b = S.ball; const r = 0.34;
  if (Math.abs(b.x) > PITCH.halfW + r) {
    const team = b.lastTouch ? 1 - b.lastTouch.team : 1;
    const y = clamp(b.y, -PITCH.halfH + 2, PITCH.halfH - 2);
    setPiece('kickIn', team, Math.sign(b.x) * (PITCH.halfW - 1.2), y);
    banner('LANÇAMENTO', S.teams[team].abbr, '', 1300);
    return;
  }
  if (Math.abs(b.y) > PITCH.halfH + r) {
    const sign = Math.sign(b.y);
    const inGoal = Math.abs(b.x) < PITCH.goalW / 2;
    const overBar = b.z > PITCH.barH;
    if (inGoal && !overBar) { goalLine(sign); return; }
    if (inGoal && overBar) {
      const defending = sign > 0 ? 0 : 1;
      setPiece('goalKick', defending, rand(-6, 6), sign * (PITCH.halfH - 4.5));
      banner('POR CIMA', S.teams[defending].abbr, '', 1300);
      return;
    }
    const defending = sign > 0 ? 0 : 1;
    const attacking = 1 - defending;
    const lastTeam = b.lastTouch ? b.lastTouch.team : defending;
    if (lastTeam === defending) {
      const cx = Math.sign(b.x) || 1;
      setPiece('corner', attacking, cx * (PITCH.halfW - 1.2), sign * (PITCH.halfH - 1.2));
      S.stats[attacking].corners++;
      banner('ESCANTEIO', S.teams[attacking].abbr, 'gold', 1600);
      SFX.whistle(false);
    } else {
      setPiece('goalKick', defending, rand(-7, 7), sign * (PITCH.halfH - 4.5));
      banner('TIRO DE META', S.teams[defending].abbr, '', 1400);
    }
  }
}

function postsCollide() {
  const b = S.ball; const rr = 0.34 + PITCH.postR;
  for (const sy of [1, -1]) for (const sx of [1, -1]) {
    const px = sx * PITCH.goalW / 2, py = sy * PITCH.halfH;
    if (b.z > PITCH.barH) continue;
    const d = dist(b.x, b.y, px, py);
    if (d < rr) {
      const nx = (b.x - px) / (d || 1), ny = (b.y - py) / (d || 1);
      const dot = b.vx * nx + b.vy * ny;
      if (dot < 0) {
        b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
        b.vx *= 0.62; b.vy *= 0.62;
        b.x = px + nx * (rr + 0.02); b.y = py + ny * (rr + 0.02); b.spin = 0;
        SFX.post(); cam.shake = 1;
        ring(b.x, b.y, 'rgba(255,213,74,.9)', 0.3, 1.4, 0.4);
        banner('NA TRAVE!', '', '', 1100);
      }
    }
  }
}

function captureBall() {
  const b = S.ball;
  if (b.z > 1.7 || b.owner) return;
  const sp = Math.hypot(b.vx, b.vy);
  let best = null, bestD = 1e9, second = 1e9;
  for (const p of S.players) {
    if (p.stunT > 0 || p.pinned > 0) continue;
    const reach = p.gk ? (1.95 + (p.diveT > 0 ? 1.25 : 0)) : PHYS.ctrlR;
    const d = dist(p.x, p.y, b.x, b.y);
    if (p === b.noTouch && b.noTouchT > 0) continue;
    if (d < reach) { if (d < bestD) { second = bestD; bestD = d; best = p; } else if (d < second) second = d; }
  }
  if (!best) return;
  if (best.gk) { if (b.z < 2.7 && sp < 50) gkCatch(best, sp); return; }
  if (second < 1.2 && Math.random() < 0.5) return;
  if (sp < 21) {
    b.owner = best; b.lastTouch = best; b.vx = b.vy = b.vz = b.spin = 0; b.trail.length = 0; best.touchCd = 0;
  } else {
    const ang = Math.atan2(b.y - best.y, b.x - best.x);
    const a2 = ang + rand(-0.7, 0.7); const ns = sp * 0.45;
    b.vx = Math.cos(a2) * ns; b.vy = Math.sin(a2) * ns; b.lastTouch = best;
    ring(b.x, b.y, 'rgba(255,255,255,.5)', 0.2, 0.9, 0.3); SFX.bounce();
  }
}

function gkCatch(gk, sp) {
  const b = S.ball;
  const wasShot = sp > 10 && b.lastTouch && b.lastTouch.team !== gk.team;
  b.owner = gk; b.lastTouch = gk; b.vx = b.vy = b.vz = 0; b.z = 0; b.spin = 0; b.trail.length = 0;
  gk.holdT = 1.3; gk.diveT = 0;
  if (wasShot) {
    S.stats[gk.team].saves++;
    S.stats[b.lastTouch.team].on++;
    banner('DEFESA!', S.teams[gk.team].abbr, '', 1300); cam.shake = 0.5;
  }
  SFX.catchBall();
  ring(gk.x, gk.y, 'rgba(120,220,255,.8)', 0.3, 1.3, 0.35);
}

function gkPunt(gk) {
  const b = S.ball;
  if (b.owner !== gk) { gk.holdT = 0; return; }
  const dir = gk.team === 0 ? -1 : 1;
  const ang = Math.atan2(dir * 1.6, rand(-0.75, 0.75));
  kickBall(gk, ang, rand(0.6, 0.85), { loft: true, vz: rand(7.5, 10.5) });
  gk.holdT = 0;
}

function updateBall(dt) {
  const b = S.ball;
  if (S.phase === 'setpiece') {
    b.x = S.restart.x; b.y = S.restart.y; b.z = 0; b.vx = b.vy = b.vz = 0; b.owner = null; return;
  }
  if (b.noTouchT > 0) b.noTouchT -= dt;
  if (b.owner) {
    const p = b.owner;
    if (p.stunT > 0 || (p.pinned > 0)) { b.owner = null; }
    else {
      const gap = 0.95 + (p.sprintBtn ? 0.55 : 0) + (p.spurtT > 0 ? 1.15 : 0);
      if (p.touchCd <= 0) { p.touchCd = rand(0.16, 0.3); p.touchOff = rand(-0.3, 0.3); }
      const a = p.face + p.touchOff;
      const tx = p.x + Math.cos(a) * gap, ty = p.y + Math.sin(a) * gap;
      const k = 1 - Math.exp(-15 * dt);
      b.x += (tx - b.x) * k; b.y += (ty - b.y) * k;
      b.z = Math.max(0, b.z - 8 * dt);
      b.vx = p.vx; b.vy = p.vy; b.roll += p.spd * dt * 1.4; b.lastTouch = p;
      if (dist(b.x, b.y, p.x, p.y) > 3.4) b.owner = null;
      pushTrail(b, dt); return;
    }
  }
  captureBall();
  if (b.owner) { pushTrail(b, dt); return; }
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.z > 0 || b.vz !== 0) {
    b.z += b.vz * dt; b.vz -= PHYS.gravity * dt;
    if (b.z <= 0) { b.z = 0; if (Math.abs(b.vz) > 1.8) { b.vz = -b.vz * PHYS.bounce; SFX.bounce(); } else b.vz = 0; }
  }
  const ground = b.z <= 0.0001;
  const drag = Math.exp(-(ground ? PHYS.ballDrag : 0.16) * dt);
  b.vx *= drag; b.vy *= drag;
  if (ground) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0.01) { const ns = Math.max(0, sp - PHYS.ballRoll * dt); b.vx *= ns / sp; b.vy *= ns / sp; }
    else { b.vx = 0; b.vy = 0; }
  }
  if (b.spin) {
    const sp = Math.hypot(b.vx, b.vy);
    const a = Math.atan2(b.vy, b.vx) + b.spin * dt;
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    b.spin *= Math.exp(-PHYS.spinDecay * dt);
    if (Math.abs(b.spin) < 0.03) b.spin = 0;
  }
  b.roll += Math.hypot(b.vx, b.vy) * dt * 1.7;
  postsCollide(); pushTrail(b, dt);
}

function pushTrail(b, dt) {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 14 || b.z > 1) {
    b._t = (b._t || 0) - dt;
    if (b._t <= 0) { b._t = 0.03; b.trail.push({ x: b.x, y: b.y, z: b.z }); if (b.trail.length > 8) b.trail.shift(); }
  } else if (b.trail.length) b.trail.shift();
}

function contests(dt) {
  const b = S.ball; const o = b.owner;
  if (!o) return;
  for (const p of S.players) {
    if (p === o || p.gk || o.gk || p.pinned > 0) continue;
    const d = dist(p.x, p.y, o.x, o.y);
    if (p.slideT > 0 && !p.slideDone) {
      if (d < 1.35) { p.slideDone = true; stealBall(p, o, true); }
      else if (d < 1.05) { p.slideDone = true; foul(p, o); }
      continue;
    }
    if (d < PHYS.stealR && p.stunT <= 0) {
      const toP = Math.atan2(p.y - o.y, p.x - o.x);
      const behind = Math.abs(normAngle(toP - o.face)) > 1.6 ? 1.4 : 1;
      const base = p.team === 0 ? 1.5 : S.diff.aiSteal * 1.4;
      if (Math.random() < base * behind * dt) stealBall(p, o, false);
    }
  }
}

function stealBall(p, o, hard) {
  const b = S.ball;
  b.owner = p; b.lastTouch = p; b.noTouch = o; b.noTouchT = 0.25; b.vx = b.vy = 0; b.trail.length = 0;
  o.stunT = hard ? 0.4 : 0.28; p.touchCd = 0;
  S.stats[p.team].tackles++;
  SFX.tackle(); dust(b.x, b.y, 8);
  if (p.team === 0) banner('DESARME!', '', '', 900);
}

function updatePlayer(p, dt) {
  p.slideCd -= dt; p.spurtT -= dt; p.touchCd -= dt; p.shootCd -= dt; p.diveCd -= dt;
  if (p.pinned > 0) { p.pinned -= dt; if (Math.hypot(S.ball.vx, S.ball.vy) > 1) p.pinned = 0; }
  if (p.diveT > 0) {
    p.diveT -= dt; p.x = damp(p.x, p.diveX, 16, dt); p.spd = 6;
    p.face = p.diveDir > 0 ? 0 : Math.PI;
    if (p.diveT <= 0) { p.diveT = 0; p.slideCd = 0.4; }
    return;
  }
  if (p.slideT > 0) {
    p.slideT -= dt; p.vx *= Math.exp(-5 * dt); p.vy *= Math.exp(-5 * dt);
    p.x += p.vx * dt; p.y += p.vy * dt; p.spd = Math.hypot(p.vx, p.vy);
    p.x = clamp(p.x, -PITCH.halfW + 0.5, PITCH.halfW - 0.5);
    p.y = clamp(p.y, -PITCH.halfH - 2.4, PITCH.halfH + 2.4);
    if (p.slideT <= 0) { p.slideT = 0; p.stunT = Math.max(p.stunT, 0.35); }
    return;
  }
  if (p.stunT > 0) { p.stunT -= dt; p.wish = { x: 0, y: 0 }; p.sprintBtn = false; }
  if (p.pinned > 0) p.wish = { x: 0, y: 0 };
  const stamF = p.stamina > 0.25 ? 1 : 0.72 + p.stamina * 0.9;
  const spTarget = (p.sprintBtn && p.stamina > 0.04 ? PHYS.sprint : PHYS.run) * stamF * (p.gk ? 0.92 : 1);
  const m = Math.hypot(p.wish.x, p.wish.y);
  const dvx = m > 0.001 ? (p.wish.x / m) * spTarget * Math.min(m, 1) : 0;
  const dvy = m > 0.001 ? (p.wish.y / m) * spTarget * Math.min(m, 1) : 0;
  const k = 1 - Math.exp(-PHYS.accel * dt);
  p.vx += (dvx - p.vx) * k; p.vy += (dvy - p.vy) * k;
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.spd = Math.hypot(p.vx, p.vy);
  if (m > 0.15) {
    const want = Math.atan2(p.wish.y, p.wish.x);
    const rate = S.ball.owner === p ? 22 : 13;
    p.face = normAngle(p.face + normAngle(want - p.face) * (1 - Math.exp(-rate * dt)));
  }
  if (p.gk && p.diveT <= 0) {
    const target = p.team === 0 ? -Math.PI / 2 : Math.PI / 2;
    p.face = normAngle(p.face + normAngle(target - p.face) * (1 - Math.exp(-6 * dt)));
  }
  if (p.sprintBtn && p.spd > 3) {
    p.stamina -= dt * 0.15; p.sprintFx -= dt;
    if (p.sprintFx <= 0) { p.sprintFx = 0.14; dust(p.x, p.y, 1); }
  } else { p.stamina += dt * (p.spd > 2 ? 0.05 : 0.085); }
  p.stamina = clamp(p.stamina, 0, 1);
  p.anim += p.spd * dt * 1.3;
  p.x = clamp(p.x, -PITCH.halfW + 0.45, PITCH.halfW - 0.45);
  p.y = clamp(p.y, -PITCH.halfH - 2.6, PITCH.halfH + 2.6);
}

function collidePlayers() {
  const ps = S.players;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j];
    if (a.slideT > 0 || b.slideT > 0) continue;
    const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy); const min = 1.05;
    if (d < min && d > 0.0001) {
      const push = (min - d) / 2;
      a.x -= (dx / d) * push; a.y -= (dy / d) * push;
      b.x += (dx / d) * push; b.y += (dy / d) * push;
    }
  }
}

function gkThink(gk, dt) {
  const D = S.diff, b = S.ball;
  const ownGoalY = gk.team === 0 ? PITCH.halfH : -PITCH.halfH;
  const s = gk.team === 0 ? -1 : 1;
  if (gk.holdT > 0) { gk.holdT -= dt; gk.wish = { x: 0, y: 0 }; gk.sprintBtn = false; if (gk.holdT <= 0) gkPunt(gk); return; }
  if (gk.diveT > 0) { gk.wish = { x: 0, y: 0 }; return; }
  const dirToGoal = Math.sign(ownGoalY - b.y) || 1;
  const sp = Math.hypot(b.vx, b.vy);
  let danger = false, intercept = null, tHit = 99;
  if (sp > 14 && Math.sign(b.vy) === dirToGoal && Math.abs(b.vy) > 5) {
    const t = (ownGoalY - b.y) / b.vy;
    if (t > 0 && t < 1.8) {
      const ix = b.x + b.vx * t;
      if (Math.abs(ix) < PITCH.goalW / 2 + 3) { danger = true; tHit = t; intercept = clamp(ix, -PITCH.goalW / 2 - 1.7, PITCH.goalW / 2 + 1.7); }
    }
  }
  const distGoal = Math.abs(b.y - ownGoalY);
  let tx, ty;
  if (danger && tHit < D.gkReact + 0.75 && gk.diveCd <= 0) {
    const gap = Math.abs(intercept - gk.x);
    if (gap < D.gkReach + 2.2 || tHit < 0.55) {
      gk.diveT = 0.5; gk.diveCd = 1.1; gk.diveX = intercept; gk.diveDir = Math.sign(intercept - gk.x) || 1;
      gk.wish = { x: gk.diveDir * 0.2, y: 0 }; dust(gk.x, gk.y, 6); return;
    }
    tx = intercept; ty = ownGoalY + s * 3;
  } else if (!b.owner && distGoal < 22) { ty = ownGoalY + s * clamp((22 - distGoal) * 0.45, 2.5, 10); tx = clamp(b.x * 0.7, -14, 14); }
  else if (b.owner && b.owner.team !== gk.team && distGoal < 26) { ty = ownGoalY + s * clamp((26 - distGoal) * 0.4, 2.5, 8); tx = clamp(b.x * 0.6, -12, 12); }
  else { ty = ownGoalY + s * 6; tx = clamp(b.x * 0.4, -8, 8); }
  gk.wish = { x: tx - gk.x, y: ty - gk.y };
  gk.sprintBtn = Math.hypot(tx - gk.x, ty - gk.y) > 4;
}

function aiField(p, dt) {
  const D = S.diff, b = S.ball, opp = S.players[p.team === 0 ? 1 : 0];
  if (p.stunT > 0 || p.slideT > 0 || p.pinned > 0 || p.diveT > 0) { p.wish = { x: 0, y: 0 }; p.sprintBtn = false; return; }
  p.aiT -= dt; p.driftT -= dt;
  if (p.driftT <= 0) { p.driftT = rand(1.8, 3.4); p.drift = rand(-1, 1); }
  const ownGoalY = p.team === 0 ? PITCH.halfH : -PITCH.halfH;
  const oppGoalY = -ownGoalY;
  let tx, ty, sprint = false;
  if (b.owner === p) {
    const dGoal = dist(p.x, p.y, 0, oppGoalY);
    const dOpp = dist(p.x, p.y, opp.x, opp.y);
    if (p.shootCd <= 0 && dGoal < 31 && Math.random() < dt * (dGoal < 19 ? 3.4 : 1.5)) {
      const err = D.aiShootErr * (0.55 + dGoal / 34) * (dOpp < 3 ? 1.7 : 1);
      const aimX = rand(-PITCH.goalW / 2 * 0.8, PITCH.goalW / 2 * 0.8);
      const ang = Math.atan2(oppGoalY - p.y, aimX - p.x) + rand(-err, err);
      kickBall(p, ang, clamp(0.42 + dGoal / 46, 0.45, 0.95), { shot: true });
      p.shootCd = 1.8; return;
    }
    if (dOpp < 2.3 && Math.random() < D.aiPass * dt * 4) { doPass(p); return; }
    tx = p.drift * 13; ty = oppGoalY;
    if (dOpp < 3.6) {
      const dirY = Math.sign(oppGoalY - p.y) || -Math.sign(ownGoalY);
      const lat = Math.sign(p.x - opp.x) || (Math.random() < 0.5 ? -1 : 1);
      tx = p.x + lat * 7; ty = p.y + dirY * 6;
    }
    sprint = dGoal > 14 && p.stamina > 0.35;
  } else if (b.owner === opp) {
    const ax = 0 - opp.x, ay = ownGoalY - opp.y; const al = Math.hypot(ax, ay) || 1;
    tx = opp.x + (ax / al) * 1.4 + opp.vx * 0.22; ty = opp.y + (ay / al) * 1.4 + opp.vy * 0.22;
    const d = dist(p.x, p.y, opp.x, opp.y);
    sprint = d > 4.5 && p.stamina > 0.3;
    if (d < 1.7 && p.slideCd <= 0 && Math.random() < D.aiTackle * dt * 2.4) {
      p.face = Math.atan2(opp.y - p.y, opp.x - p.x);
      if (d < 1.9 && Math.random() < 0.45) doTackle(p);
    }
  } else {
    const lead = b.owner ? 0 : 0.3;
    tx = b.x + b.vx * lead; ty = b.y + b.vy * lead;
    const dBall = dist(p.x, p.y, b.x, b.y);
    if (dBall > 24) { tx = lerp(b.x, 0, 0.25); ty = lerp(b.y, ownGoalY, 0.35); }
    sprint = dBall > 7 && p.stamina > 0.3;
    if (Math.abs(b.y - ownGoalY) > 40 && dBall > 30) { tx = b.x * 0.4; ty = ownGoalY - Math.sign(ownGoalY) * 22; }
  }
  p.wish = { x: tx - p.x, y: ty - p.y };
  p.sprintBtn = sprint;
}

function handleInput(dt) {
  const p = S.controlled;
  let kx = 0, ky = 0; const K = input.keys;
  if (K.has('arrowleft') || K.has('a')) kx -= 1;
  if (K.has('arrowright') || K.has('d')) kx += 1;
  if (K.has('arrowup') || K.has('w')) ky -= 1;
  if (K.has('arrowdown') || K.has('s')) ky += 1;
  let jx = input.jx, jy = input.jy;
  if (kx || ky) { const l = Math.hypot(kx, ky); jx = kx / l; jy = ky / l; }
  const mag = Math.hypot(jx, jy);
  p.wish = mag > 0.001 ? { x: jx, y: jy } : { x: 0, y: 0 };
  p.sprintBtn = (input.sprint || K.has('shift')) && mag > 0.15 && p.stamina > 0.04;
  if (mag > 0.15) p.face = Math.atan2(jy, jx);
  if (input.shoot) charge = Math.min(1, charge + dt / 0.85);
  if (input.shootUp) { input.shootUp = false; if (S.phase === 'play') releaseShoot(); charge = 0; }
  if (input.pass) { input.pass = false; if (S.phase === 'play') doPass(p); }
  if (input.tackle) { input.tackle = false; if (S.phase === 'play') doTackle(p); }
}

function checkClock() {
  if (S.half === 1 && S.time >= RULES.halfReal) {
    S.phase = 'half'; SFX.whistle(true);
    $('#halfScore').textContent = `${S.score[0]} – ${S.score[1]}`;
    $('#halfStats').innerHTML = statsHTML(true);
    onlyScreen('half'); paused = true;
  } else if (S.half === 2 && S.time >= RULES.matchReal) {
    S.phase = 'full'; SFX.whistle(true); setTimeout(() => SFX.whistle(true), 500); showFullTime();
  }
}

function possPct() {
  const a = S.stats[0].poss, b = S.stats[1].poss; const t = a + b;
  if (t < 0.5) return [50, 50];
  return [Math.round(a / t * 100), Math.round(100 - a / t * 100)];
}

function statsHTML(compact) {
  const A = S.stats[0], B = S.stats[1]; const [pa, pb] = possPct();
  const rows = [
    ['POSSE', `${pa}%`, `${pb}%`, pa, pb],
    ['FINALIZAÇÕES', A.shots, B.shots, A.shots, B.shots],
    ['NO ALVO', A.on, B.on, A.on, B.on],
    ['PASSES', A.passes, B.passes, A.passes, B.passes],
    ['DESARMES', A.tackles, B.tackles, A.tackles, B.tackles],
  ];
  if (!compact) rows.push(['FALTAS', A.fouls, B.fouls, A.fouls, B.fouls], ['ESCANTEIOS', A.corners, B.corners, A.corners, B.corners], ['DEFESAS', A.saves, B.saves, A.saves, B.saves]);
  return rows.map(([label, l, r, a, b]) => {
    const t = (a + b) || 1; const pa2 = Math.round(a / t * 100), pb2 = 100 - pa2;
    return `<div class="statRow"><span class="l">${l}</span><span class="mid">${label}</span><span class="r">${r}</span><span class="statBar"><i style="width:${pa2}%;background:${S.teams[0].shirt}"></i><i style="width:${pb2}%;background:${S.teams[1].shirt}"></i></span></div>`;
  }).join('');
}

function showFullTime() {
  const [a, b] = S.score;
  $('#fullScore').textContent = `${a} – ${b}`;
  $('#resultLine').textContent = a > b ? 'VITÓRIA ' + S.teams[0].abbr : b > a ? 'VITÓRIA ' + S.teams[1].abbr : 'EMPATE';
  $('#statBox').innerHTML = statsHTML(false);
  onlyScreen('full'); paused = true;
}

function ring(x, y, color, r0, r1, life) { S.particles.push({ kind: 'ring', x, y, color, r0, r1, life, max: life, width: 0.14 }); }
function dust(x, y, n) { for (let i = 0; i < n; i++) S.particles.push({ kind: 'dust', x: x + rand(-0.4, 0.4), y: y + rand(-0.4, 0.4), vx: rand(-2, 2), vy: rand(-2, 2), life: rand(0.3, 0.7), max: 0.7, size: rand(0.3, 0.6), color: '#ddd6bd' }); }
function confetti(x, y, team) {
  const cols = [team.shirt, team.trim, '#ffffff', '#ffd54a'];
  for (let i = 0; i < 90; i++) S.particles.push({ kind: 'confetti', x: x + rand(-10, 10), y: y + rand(-6, 6), z: rand(1, 7), vx: rand(-3, 3), vy: rand(-3, 3), vz: rand(2, 9), rot: rand(0, TAU), vr: rand(-6, 6), life: rand(1.6, 3.4), max: 3.4, size: rand(0.2, 0.42), color: cols[(Math.random() * cols.length) | 0] });
}
function updateParticles(dt) {
  const ps = S.particles;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]; p.life -= dt;
    if (p.kind === 'confetti') { p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= 16 * dt; p.z += p.vz * dt; if (p.z < 0) { p.z = 0; p.vz *= -0.35; } p.rot += p.vr * dt; }
    else if (p.kind === 'dust') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; }
  }
  S.particles = ps.filter((p) => p.life > 0);
  if (S.particles.length > 420) S.particles.splice(0, S.particles.length - 420);
}

function step(dt) {
  if (!S || S.phase === 'half' || S.phase === 'full') return;
  if (S.phase === 'play' || S.phase === 'setpiece') S.time += dt;
  if (S.phase === 'setpiece') {
    S.restart.cd -= dt; handleInput(dt);
    gkThink(S.players[2], dt); gkThink(S.players[3], dt); aiField(S.players[1], dt);
    for (const p of S.players) updatePlayer(p, dt);
    collidePlayers(); updateBall(dt); updateParticles(dt);
    if (S.restart.cd <= 0) startPlay();
    return;
  }
  if (S.phase === 'goal') {
    S.goalT -= dt; updateParticles(dt);
    for (const p of S.players) { p.anim += p.spd * dt; p.x = clamp(p.x + p.vx * dt, -33, 33); p.y = clamp(p.y + p.vy * dt, -54, 54); p.vx *= 0.95; p.vy *= 0.95; }
    updateBall(dt);
    if (S.goalT <= 0) { cam.zoomTarget = 1; const conceding = 1 - S.scoring; S.crowdExcite = 0; kickoff(conceding); }
    return;
  }
  handleInput(dt); gkThink(S.players[2], dt); gkThink(S.players[3], dt); aiField(S.players[1], dt);
  for (const p of S.players) updatePlayer(p, dt);
  collidePlayers(); contests(dt); updateBall(dt); checkBounds(); updateParticles(dt);
  const o = S.ball.owner;
  if (o) S.stats[o.team].poss += dt;
  else if (S.ball.lastTouch) S.stats[S.ball.lastTouch.team].poss += dt;
  checkClock();
}

function updateCamera(dt) {
  if (!S) return;
  const b = S.ball;
  const halfV = CH / 2 / cam.scale, halfH = CW / 2 / cam.scale;
  const limY = Math.max(0, PITCH.halfH + 9 - halfV), limX = Math.max(0, PITCH.halfW + 7 - halfH);
  cam.x = damp(cam.x, clamp(b.x, -limX, limX), 5, dt);
  cam.y = damp(cam.y, clamp(b.y - 2.4, -limY, limY), 4.2, dt);
}

function updateFx(dt) {
  cam.flash = Math.max(0, cam.flash - dt * 1.6);
  if (S) S.crowdExcite = Math.max(0, S.crowdExcite - dt * 0.28);
}

function syncHUD() {
  if (!S) return;
  $('#sbScore').textContent = `${S.score[0]}–${S.score[1]}`;
  $('#sbMin').textContent = fmtClock(S.time, RULES.matchReal);
  $('#sbHalf').textContent = S.half === 1 ? '1º TEMPO' : '2º TEMPO';
  $('#powerWrap').classList.toggle('on', input.shoot && S.phase === 'play');
  $('#powerFill').style.width = `${Math.round(charge * 100)}%`;
  const lbl = $('#tackleLbl');
  const want = S.ball.owner === S.controlled ? 'FINTA' : 'DESARME';
  if (lbl.textContent !== want) lbl.textContent = want;
}

function frame(ts) {
  requestAnimationFrame(frame);
  const dtReal = lastT ? Math.min(0.05, (ts - lastT) / 1000) : 0;
  lastT = ts; wallT += dtReal;
  if (!paused && S && S.phase !== 'half' && S.phase !== 'full') {
    const scale = slowmo > 0 ? 0.33 : 1;
    if (slowmo > 0) slowmo -= dtReal;
    acc += dtReal * scale;
    let n = 0;
    while (acc >= FIXED && n < 8) { step(FIXED); acc -= FIXED; n++; }
    if (acc > FIXED * 8) acc = 0;
  }
  if (S) { updateCamera(dtReal); updateFx(dtReal); draw(ctx, S, wallT); drawRadar(rctx, S, Math.min(window.devicePixelRatio || 1, 2.5)); syncHUD(); }
}

const joyBase = $('#joyBase'), joyKnob = $('#joyKnob');
const JOY_R = 52;
function joyStart(e) {
  if (input.pointerId !== null) return;
  SFX.unlock();
  input.pointerId = e.pointerId; input.ox = e.clientX; input.oy = e.clientY;
  input.joy = true; input.jx = 0; input.jy = 0; input.mag = 0;
  joyBase.classList.add('on');
  joyBase.style.left = `${e.clientX - 64}px`; joyBase.style.top = `${e.clientY - 64}px`;
  joyKnob.style.transform = 'translate(0px,0px)';
  $('#joyHint').classList.add('off');
}
function joyMove(e) {
  if (e.pointerId !== input.pointerId) return;
  let dx = e.clientX - input.ox, dy = e.clientY - input.oy;
  const m = Math.hypot(dx, dy); const k = m > JOY_R ? JOY_R / m : 1;
  joyKnob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
  const nm = Math.min(m, JOY_R) / JOY_R;
  input.jx = (dx / (m || 1)) * nm; input.jy = (dy / (m || 1)) * nm;
  input.mag = nm; input.angle = Math.atan2(dy, dx);
}
function joyEnd(e) {
  if (e.pointerId !== input.pointerId) return;
  input.pointerId = null; input.joy = false; input.jx = input.jy = input.mag = 0;
  joyBase.classList.remove('on');
}

function bindButton(el, down, up) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); SFX.unlock(); try { el.setPointerCapture(e.pointerId); } catch (_) {} el.classList.add('pressed'); down && down(); });
  const end = () => { if (!el.classList.contains('pressed')) return; el.classList.remove('pressed'); up && up(); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
}

function wireInput() {
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); if (e.pointerType === 'mouse' && e.button !== 0) return; joyStart(e); });
  window.addEventListener('pointermove', joyMove);
  window.addEventListener('pointerup', joyEnd);
  window.addEventListener('pointercancel', joyEnd);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  bindButton($('#btnShoot'), () => { input.shoot = true; }, () => { input.shoot = false; input.shootUp = true; });
  bindButton($('#btnSprint'), () => { input.sprint = true; }, () => { input.sprint = false; });
  bindButton($('#btnPass'), () => { input.pass = true; }, null);
  bindButton($('#btnTackle'), () => { input.tackle = true; }, null);
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    SFX.unlock();
    if (k === ' ' && !e.repeat) input.shoot = true;
    input.keys.add(k);
    if (k === 'e' && !e.repeat) input.pass = true;
    if (k === 'q' && !e.repeat) input.tackle = true;
    if ((k === 'p' || k === 'escape') && !e.repeat) togglePause();
    if (k === 'm' && !e.repeat) toggleMute();
  });
  window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); input.keys.delete(k); if (k === ' ') { input.shoot = false; input.shootUp = true; } });
}

function togglePause() {
  if (!S || S.phase === 'half' || S.phase === 'full') return;
  paused = !paused;
  if (paused) { $('#pauseScore').textContent = `${S.score[0]} – ${S.score[1]}`; onlyScreen('pause'); }
  else onlyScreen(null);
  SFX.ui();
}
function toggleMute() {
  const next = !isMuted(); setMuted(next);
  const b = $('#btnMute'); b.textContent = next ? 'MUDO' : 'SOM'; b.classList.toggle('off', next); SFX.ui();
}

function buildKits() {
  const make = (rowSel, getIdx, setIdx) => {
    const row = $(rowSel); row.innerHTML = '';
    TEAMS.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'kit' + (i === getIdx() ? ' active' : '');
      b.innerHTML = `<div class="stripe" style="background:linear-gradient(135deg,${t.shirt} 0 58%,${t.trim} 58% 100%)"></div><span class="tag">${t.abbr}</span>`;
      b.addEventListener('click', () => { setIdx(i); SFX.ui(); buildKits(); });
      row.appendChild(b);
    });
  };
  make('#kitUser', () => userIdx, (i) => { userIdx = i; if (cpuIdx === i) cpuIdx = (i + 1) % TEAMS.length; });
  make('#kitCpu', () => cpuIdx, (i) => { cpuIdx = i; if (userIdx === i) userIdx = (i + 1) % TEAMS.length; });
}

function wireMenu() {
  buildKits();
  document.querySelectorAll('#diffRow .pill').forEach((p) => {
    p.addEventListener('click', () => { document.querySelectorAll('#diffRow .pill').forEach((x) => x.classList.remove('active')); p.classList.add('active'); diffKey = p.dataset.d; SFX.ui(); });
  });
  $('#btnStart').addEventListener('click', () => { SFX.unlock(); SFX.ui(); startMatch(); });
  $('#btnPause').addEventListener('click', togglePause);
  $('#btnMute').addEventListener('click', toggleMute);
  $('#btnResume').addEventListener('click', togglePause);
  $('#btnRestart').addEventListener('click', () => { onlyScreen(null); paused = false; startMatch(); });
  $('#btnQuit').addEventListener('click', () => { paused = false; S = null; onlyScreen('menu'); $('#hud').classList.add('hidden'); });
  $('#btnSecondHalf').addEventListener('click', () => { S.half = 2; paused = false; onlyScreen(null); kickoff(1); banner('2º TEMPO', '', 'gold', 1500); });
  $('#btnRematch').addEventListener('click', () => { paused = false; onlyScreen(null); startMatch(); });
  $('#btnMenu').addEventListener('click', () => { paused = false; S = null; onlyScreen('menu'); $('#hud').classList.add('hidden'); });
}

function startMatch() {
  onlyScreen(null); $('#hud').classList.remove('hidden'); onResize();
  paused = false; charge = 0; newMatch();
  banner('KICK OFF', S.teams[0].abbr + ' × ' + S.teams[1].abbr, 'gold', 1600);
}

function onResize() {
  resize(canvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  radar.width = Math.round(radar.clientWidth * dpr);
  radar.height = Math.round(radar.clientHeight * dpr);
}

window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
document.addEventListener('visibilitychange', () => { if (document.hidden && S && !paused && S.phase !== 'half' && S.phase !== 'full') togglePause(); });

onResize(); wireInput(); wireMenu(); onlyScreen('menu');
window.__fcduelo = { get state() { return S; } };
if (!rafStarted) { rafStarted = true; requestAnimationFrame(frame); }
