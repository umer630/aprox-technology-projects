// Ab Travel Splash — Episode 1: real-time 3D production renderer (Three.js)
import * as THREE from 'three';
import { SEQ_A } from './seqA_house.js';
import { disposeTree, clamp } from './lib/util.js';

const FPS = 24;
const registry = { A: SEQ_A };
export function register(seq) { registry[seq.id] = seq; }

let renderer, comp, cg, W, H, scene, camera, active = null, ctx = null, seqList = [];

function timeline(ids) {
  let t0 = 0; const out = [];
  for (const id of ids) {
    const s = registry[id]; let tt = 0; const shots = s.shots.map(sh => { const o = { ...sh, s0: tt, s1: tt + sh.dur }; tt += sh.dur; return o; });
    out.push({ seq: s, t0, t1: t0 + tt, dur: tt, shots }); t0 += tt;
  }
  return out;
}

async function init({ width = 1920, height = 1080, seqs = ['A'] } = {}) {
  for (const id of seqs) if (!registry[id]) { const m = await import(`./seq${id}.js`); register(m.default); }
  W = width; H = height;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setSize(W, H); renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  comp = document.createElement('canvas'); comp.width = W; comp.height = H; cg = comp.getContext('2d');
  seqList = timeline(seqs);
  const total = seqList.reduce((a, s) => a + s.dur, 0);
  return { duration: total, frames: Math.round(total * FPS), shots: seqList.flatMap(s => s.shots.map(sh => ({ id: sh.id, dur: sh.dur, desc: sh.desc }))) };
}

function activate(entry) {
  if (active === entry) return;
  if (scene) { disposeTree(scene); renderer.renderLists.dispose(); }
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 30000);
  renderer.toneMappingExposure = entry.seq.exposure || 0.82;
  ctx = entry.seq.build(scene, renderer, camera);
  active = entry;
}

function locate(t) {
  let e = seqList.find(s => t >= s.t0 && t < s.t1) || seqList[seqList.length - 1];
  const lt = t - e.t0; const shot = e.shots.find(sh => lt >= sh.s0 && lt < sh.s1) || e.shots[e.shots.length - 1];
  return { e, lt, shot };
}

function renderAt(t) {
  const { e, lt, shot } = locate(t);
  activate(e);
  e.seq.update(lt, ctx, camera, shot);
  camera.fov = 40; shot.cam(lt - shot.s0, ctx, camera, lt);
  camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  return { e, lt, shot };
}

// ---- compositor: motion blur accumulate, vignette, subtitles, titles ----
function drawOverlay(info, t) {
  const { e, lt, shot } = info;
  // vignette
  const vg = cg.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)'); cg.fillStyle = vg; cg.fillRect(0, 0, W, H);
  // selfie/vlog REC indicator
  if (shot.selfie) {
    cg.fillStyle = '#ff2a2a'; if ((lt * 2) % 2 < 1.4) { cg.beginPath(); cg.arc(W * 0.045, H * 0.07, 11, 0, 7); cg.fill(); }
    cg.fillStyle = '#fff'; cg.font = '600 28px DejaVu Sans'; cg.fillText('REC', W * 0.045 + 22, H * 0.07 + 10);
    cg.strokeStyle = 'rgba(255,255,255,0.7)'; cg.lineWidth = 3; const m = 50, L = 60;
    for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { cg.beginPath(); cg.moveTo(x, y + dy * L); cg.lineTo(x, y); cg.lineTo(x + dx * L, y); cg.stroke(); }
  }
  // sequence title (lower-third) first 3.2s of each sequence
  if (lt < 3.4 && e.seq.title) {
    const a = clamp(Math.min(lt / 0.5, (3.4 - lt) / 0.5));
    cg.globalAlpha = a; const x = 90, y = H - 210;
    cg.fillStyle = '#ffc93c'; cg.fillRect(x, y, 8, 74);
    cg.fillStyle = 'rgba(10,20,35,0.72)'; cg.fillRect(x + 8, y, 640, 74);
    cg.fillStyle = '#fff'; cg.font = 'bold 34px DejaVu Sans'; cg.fillText(e.seq.title, x + 30, y + 48);
    cg.globalAlpha = 1;
  }
  // brand bug
  cg.font = 'bold 24px DejaVu Sans'; cg.fillStyle = 'rgba(255,255,255,0.75)'; cg.textAlign = 'right'; cg.fillText('Ab Travel Splash · EP 1', W - 60, 64); cg.textAlign = 'left';
  // subtitles (Roman Urdu)
  for (const [t0, t1, who, text] of (e.seq.subs || [])) {
    if (lt >= t0 && lt < t1) {
      cg.font = '600 40px DejaVu Sans'; const line = (who ? who + ': ' : '') + text; const tw = cg.measureText(line).width;
      cg.fillStyle = 'rgba(0,0,0,0.6)'; cg.fillRect(W / 2 - tw / 2 - 24, H - 128, tw + 48, 64);
      cg.fillStyle = '#fff'; cg.textAlign = 'center';
      if (who) { cg.fillStyle = '#ffd34d'; const ww = cg.measureText(who + ': ').width; cg.textAlign = 'left'; cg.fillText(who + ': ', W / 2 - tw / 2, H - 82); cg.fillStyle = '#fff'; cg.fillText(text, W / 2 - tw / 2 + ww, H - 82); }
      else cg.fillText(line, W / 2, H - 82);
      cg.textAlign = 'left';
    }
  }
  if (e.seq.overlay) e.seq.overlay(cg, W, H, lt, ctx);
}

async function renderFrame(f, { samples = 1, shutter = 0.5, quality = 0.92, overlay = true } = {}) {
  const t = f / FPS; let info;
  for (let k = 0; k < samples; k++) {
    const tt = t + (samples > 1 ? (k / samples - 0.5) * shutter / FPS : 0);
    // shot boundary ke paar blur na ho
    const base = locate(t); const sub = locate(Math.max(0, tt));
    info = renderAt(sub.shot === base.shot ? tt : t);
    cg.globalAlpha = 1 / (k + 1); cg.drawImage(renderer.domElement, 0, 0); cg.globalAlpha = 1;
  }
  info = locate(t);
  if (overlay) drawOverlay(info, t);
  return comp.toDataURL('image/jpeg', quality);
}

async function renderThumb(t, { quality = 0.93 } = {}) {
  renderAt(t); cg.drawImage(renderer.domElement, 0, 0);
  const g = cg;
  const vg = g.createLinearGradient(0, H * 0.45, 0, H); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.78)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  const sx = W / 1920;
  g.save(); g.scale(sx, sx);
  g.fillStyle = '#ffc93c'; g.fillRect(70, 70, 330, 74); g.fillStyle = '#10213a'; g.font = 'bold 50px DejaVu Sans'; g.fillText('EPISODE 1', 92, 127);
  g.lineWidth = 14; g.strokeStyle = '#0b1424'; g.lineJoin = 'round';
  g.font = 'bold 150px DejaVu Sans';
  g.strokeText('KARACHI', 70, 830); g.fillStyle = '#ffffff'; g.fillText('KARACHI', 70, 830);
  g.font = 'bold 150px DejaVu Sans'; g.strokeText('→ ISLAMABAD', 70, 980); g.fillStyle = '#ffd34d'; g.fillText('→ ISLAMABAD', 70, 980);
  g.font = 'bold 44px DejaVu Sans'; g.lineWidth = 8; g.strokeText('AB TRAVEL SPLASH', 1420, 120); g.fillStyle = '#fff'; g.fillText('AB TRAVEL SPLASH', 1420, 120);
  g.restore();
  return comp.toDataURL('image/jpeg', quality);
}

function subtitles() {
  const out = [];
  for (const e of seqList) for (const [t0, t1, who, text] of (e.seq.subs || [])) out.push({ t0: e.t0 + t0, t1: e.t0 + t1, who, text });
  return { subs: out, shots: seqList.flatMap(e => e.shots.map(sh => ({ seq: e.seq.id, id: sh.id, t0: e.t0 + sh.s0, t1: e.t0 + sh.s1, desc: sh.desc }))) };
}

window.SPLASH = { init, renderFrame, renderThumb, subtitles, locate: (t) => { const l = locate(t); return { seq: l.e.seq.id, shot: l.shot.id, lt: l.lt }; } };
window.SPLASH_READY = true;
