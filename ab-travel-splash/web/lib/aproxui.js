// Aprox AI — phone screen UI (navy / green / white). Saaf, parhne layak Roman Urdu chat. Har frame redraw (typing animation).
import * as THREE from 'three';
import { mat, mesh, rbox, box } from './util.js';

const W = 540, H = 1170;
function wrap(g, text, maxW) { const words = text.split(' '); const lines = ['']; for (const w of words) { const t = (lines[lines.length - 1] + ' ' + w).trim(); if (g.measureText(t).width > maxW && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = t; } return lines; }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// script: [{ who: 'user'|'ai', text, t0, cps }] ; mode: 'driver' | 'ticket'
export function drawAprox(g, t, { script = [], mode = 'driver', ticket = null } = {}) {
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#071a33'); grd.addColorStop(1, '#0b2a4a'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // status bar
  g.fillStyle = '#cfe3ff'; g.font = '600 22px DejaVu Sans'; g.fillText('9:41', 24, 34); g.textAlign = 'right'; g.fillText('4G  ▮▮▮  87%', W - 24, 34); g.textAlign = 'left';
  // header: logo + name
  g.fillStyle = '#1fbf75'; g.beginPath(); g.arc(52, 92, 26, 0, Math.PI * 2); g.fill(); g.fillStyle = '#071a33'; g.font = 'bold 30px DejaVu Sans'; g.textAlign = 'center'; g.fillText('A', 52, 103); g.textAlign = 'left';
  g.fillStyle = '#ffffff'; g.font = 'bold 34px DejaVu Sans'; g.fillText('Aprox AI', 92, 102);
  if (mode === 'ticket' && ticket) {
    g.fillStyle = '#cfe3ff'; g.font = '600 24px DejaVu Sans'; g.fillText('Mera Boarding Pass', 92, 136);
    rr(g, 30, 170, W - 60, 760, 28); g.fillStyle = '#ffffff'; g.fill();
    g.fillStyle = '#123e8a'; rr(g, 30, 170, W - 60, 110, 28); g.fill(); g.fillRect(30, 230, W - 60, 50);
    g.fillStyle = '#fff'; g.font = 'bold 34px DejaVu Sans'; g.fillText('BOARDING PASS', 60, 238);
    g.fillStyle = '#0b2a4a'; g.font = 'bold 84px DejaVu Sans'; g.fillText('KHI', 60, 400); g.textAlign = 'right'; g.fillText('ISB', W - 60, 400); g.textAlign = 'left';
    g.font = '600 26px DejaVu Sans'; g.fillStyle = '#444'; g.fillText('Karachi', 62, 440); g.textAlign = 'right'; g.fillText('Islamabad', W - 62, 440); g.textAlign = 'left';
    g.font = 'bold 40px DejaVu Sans'; g.fillStyle = '#1fbf75'; g.textAlign = 'center'; g.fillText('✈', W / 2, 400); g.textAlign = 'left';
    g.fillStyle = '#333'; g.font = '600 28px DejaVu Sans';
    [['Passenger', ticket.name], ['Seat', ticket.seat], ['Gate', ticket.gate], ['Boarding', ticket.time]].forEach(([k, v], i) => { g.fillStyle = '#777'; g.fillText(k, 62, 510 + i * 64); g.fillStyle = '#0b2a4a'; g.font = 'bold 30px DejaVu Sans'; g.fillText(v, 260, 510 + i * 64); g.font = '600 28px DejaVu Sans'; });
    // QR code (deterministic pattern)
    const qx = W / 2 - 110, qy = 760; for (let i = 0; i < 21; i++) for (let j = 0; j < 21; j++) { const on = ((i * 7 + j * 13 + i * j) % 5) < 2 || (i < 7 && j < 7 && (i % 6 === 0 || j % 6 === 0 || (i > 1 && i < 5 && j > 1 && j < 5))) || (i < 7 && j > 13 && (i % 6 === 0 || j === 14 || j === 20 || (i > 1 && i < 5 && j > 15 && j < 19))); if (on) { g.fillStyle = '#111'; g.fillRect(qx + j * 9, qy + i * 9 - 20, 9, 9); } }
    g.fillStyle = '#9fb3d8'; g.font = '600 22px DejaVu Sans'; g.textAlign = 'center'; g.fillText('Aprox AI se mehfooz ticket', W / 2, 1010); g.textAlign = 'left';
    return;
  }
  // Driver Mode pill
  rr(g, 92, 118, 250, 40, 20); g.fillStyle = '#1fbf75'; g.fill(); g.fillStyle = '#04210f'; g.font = 'bold 22px DejaVu Sans'; g.fillText('●  Driver Mode ON', 106, 146);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(0, 176); g.lineTo(W, 176); g.stroke();
  // chat
  let y = 210;
  for (const m of script) {
    if (t < m.t0) break;
    const n = Math.floor((t - m.t0) * (m.cps || 30)); const txt = m.text.slice(0, n);
    g.font = '600 25px DejaVu Sans'; const lines = wrap(g, txt || ' ', W - 150); const lh = 34; const bh = lines.length * lh + 26; const bw = Math.min(W - 110, Math.max(...lines.map(l => g.measureText(l).width)) + 36);
    const x = m.who === 'user' ? W - 30 - bw : 30;
    rr(g, x, y, bw, bh, 18); g.fillStyle = m.who === 'user' ? '#1fbf75' : '#ffffff'; g.fill();
    g.fillStyle = m.who === 'user' ? '#04210f' : '#0b2a4a'; lines.forEach((l, i) => g.fillText(l, x + 18, y + 38 + i * lh));
    if (m.who === 'ai') { g.fillStyle = '#9fb3d8'; g.font = '600 18px DejaVu Sans'; g.fillText('Aprox AI', x + 4, y + bh + 22); }
    y += bh + 40;
  }
  // input bar
  rr(g, 24, H - 100, W - 120, 64, 32); g.fillStyle = '#12355e'; g.fill(); g.fillStyle = '#7f9cc4'; g.font = '600 22px DejaVu Sans'; g.fillText('Aprox AI se poochiye...', 50, H - 60);
  g.fillStyle = '#1fbf75'; g.beginPath(); g.arc(W - 58, H - 68, 30, 0, Math.PI * 2); g.fill(); g.fillStyle = '#04210f'; g.font = 'bold 30px DejaVu Sans'; g.textAlign = 'center'; g.fillText('➤', W - 56, H - 57); g.textAlign = 'left';
}

// Phone model (screen texture live): origin = phone centre, screen +Z
export function createAproxPhone(opts = {}) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const grp = new THREE.Group();
  grp.add(rbox(0.074, 0.156, 0.009, 0.007, mat('#0d0d0f', 0.3, 0.5)));
  const scr = mesh(new THREE.PlaneGeometry(0.068, 0.147), new THREE.MeshBasicMaterial({ map: tex }), { cast: false }); scr.position.z = 0.0052; grp.add(scr);
  const back = box(0.06, 0.03, 0.002, mat('#222', 0.3), 0, 0.055, -0.0052); grp.add(back);
  return { group: grp, canvas: c, update(t, o) { drawAprox(g, t, { ...opts, ...o }); tex.needsUpdate = true; } };
}

// Screen-recording inset (vlog edit): phone screen ko frame ke kinare par saaf dikhana
export function drawPhoneInset(g, W, H, canvas, alpha = 1, side = 'right') {
  if (alpha <= 0) return; const h = H * 0.78, w = h * canvas.width / canvas.height; const x = side === 'right' ? W - w - 70 : 70, y = (H - h) / 2 - 20;
  g.save(); g.globalAlpha = alpha; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x - 14, y - 14, w + 28, h + 28);
  g.drawImage(canvas, x, y, w, h); g.strokeStyle = '#1fbf75'; g.lineWidth = 4; g.strokeRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = '#1fbf75'; g.font = 'bold 26px DejaVu Sans'; g.fillText('● Screen — Aprox AI', x, y + h + 44); g.restore();
}
