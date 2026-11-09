// Karachi route assets (v3): dukaanon ki qataar, chai/paratha stalls, auto showroom, petrol pump, bijli ke khambe,
// junction (signal + zebra + cross road), FTC flyover ramp, Star Gate, route signs. Sab original 3D geometry.
import * as THREE from 'three';
import { mat, mesh, box, rbox, rng, canvasTex, noiseTex, TAU } from './util.js';
import { road, kerb, trees, streetLight, building } from './env.js';
import { brandBillboard, trafficLight, zebra, roadSign, railway, createTrain } from './world2.js';
import { setupSkyAndLight, buildKarachiRoad } from './env.js';
import { createTraffic } from './vehicles.js';
import { createCar } from './vehicles.js';

const SHOPS = [
  ['Chai Khana', 'چائے خانہ', '#7a3e00'], ['Paratha Point', 'پراٹھا پوائنٹ', '#a33b1a'], ['Tikka House', 'تکہ ہاؤس', '#8a1c1c'], ['Mobile Zone', 'موبائل زون', '#1f4e9c'],
  ['Pharmacy', 'فارمیسی', '#1a7a4a'], ['Auto Parts', 'آٹو پارٹس', '#444'], ['Bakery', 'بیکری', '#b07a1a'], ['General Store', 'جنرل اسٹور', '#2d6b8a'], ['Tailor', 'ٹیلر', '#6a3a8a'], ['Hardware', 'ہارڈویئر', '#5a5a2a']
];
function signTex(en, ur, bg) {
  return canvasTex(512, 128, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 44px DejaVu Sans'; g.textBaseline = 'middle'; g.fillText(en, 16, h / 2); g.textAlign = 'right'; g.direction = 'rtl'; g.font = 'bold 40px DejaVu Sans'; g.fillStyle = '#ffe9a8'; g.fillText(ur, w - 16, h / 2); });
}
// Dukaanon ki qataar road ke saath (side: -1 = z<0, +1 = z>0), facing road
export function shopRow(scene, x0, x1, zFront, side, seed = 1) {
  const r = rng(seed); const g = new THREE.Group(); scene.add(g);
  let x = x0;
  while (x < x1) {
    const w = 5 + r() * 4, d = 8, h = 3.6 + Math.floor(r() * 3) * 3.2; const s = SHOPS[Math.floor(r() * SHOPS.length)];
    const cz = zFront - side * (-d / 2); // building centre peeche
    const wallC = ['#d8cdb8', '#c9bfa8', '#e4dccb', '#b9b2a3'][Math.floor(r() * 4)];
    g.add(box(w - 0.2, h, d, mat(wallC, 0.9), x + w / 2, h / 2, zFront + side * d / 2));
    // shutter/glass front + awning + signboard
    const front = side < 0 ? -1 : 1; const fz = zFront + 0.02 * side * -1;
    g.add(box(w - 0.6, 2.6, 0.05, mat(r() < 0.5 ? '#3a4048' : '#9aa4ad', 0.4, 0.4), x + w / 2, 1.3, zFront - side * 0.01));
    const aw = box(w - 0.3, 0.08, 1.4, mat(['#c62828', '#1f6feb', '#2e7d32', '#f9a825'][Math.floor(r() * 4)], 0.7), x + w / 2, 2.85, zFront - side * 0.7); aw.rotation.x = side * 0.18; g.add(aw);
    const sg = mesh(new THREE.PlaneGeometry(w - 0.8, (w - 0.8) / 4), new THREE.MeshStandardMaterial({ map: signTex(s[0], s[1], s[2]), roughness: 0.6 }), { cast: false });
    sg.position.set(x + w / 2, 3.45, zFront - side * 0.03); sg.rotation.y = side > 0 ? Math.PI : 0; g.add(sg);
    // AC units + paani ki tanki
    if (h > 5) g.add(box(0.8, 0.5, 0.4, mat('#eee', 0.5), x + w * 0.3, h - 1.2, zFront - side * 0.2));
    { const tk = mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.0, 10), mat('#222', 0.7)); tk.position.set(x + w * 0.7, h + 0.5, zFront + side * d * 0.6); g.add(tk); }
    x += w;
  }
  g.traverse(o => o.isMesh && (o.castShadow = true, o.receiveShadow = true));
  return g;
}
// Chai ka stall: chhota kiosk, kettle, benches, chai peete log (static seated figures handled by seq)
export function teaStall(scene, x, z, rotY = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
  g.add(box(2.2, 1.0, 1.0, mat('#7a5534', 0.7), 0, 0.5, 0)); g.add(box(2.4, 0.06, 1.4, mat('#2a6fd6', 0.7), 0, 2.3, 0.1));
  for (const sx of [-1, 1]) g.add(box(0.06, 2.3, 0.06, mat('#555', 0.5, 0.5), sx * 1.15, 1.15, 0.7));
  const ket = mesh(new THREE.SphereGeometry(0.16, 12, 10), mat('#b9bec4', 0.3, 0.9)); ket.position.set(-0.5, 1.15, 0); g.add(ket);
  const st = mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 14), mat('#222', 0.6)); st.position.set(-0.5, 1.02, 0); g.add(st);
  for (let i = 0; i < 6; i++) { const cp = mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.07, 8), mat('#fff', 0.4)); cp.position.set(0.1 + i * 0.12, 1.04, 0.1); g.add(cp); }
  const sg = mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshStandardMaterial({ map: signTex('Karak Chai', 'کڑک چائے', '#7a3e00') }), { cast: false }); sg.position.set(0, 2.0, 0.81); g.add(sg);
  for (const bx of [-1.2, 1.2]) { g.add(box(1.4, 0.06, 0.35, mat('#6b4a2e', 0.7), bx, 0.45, 2.0)); g.add(box(0.06, 0.45, 0.3, mat('#6b4a2e'), bx - 0.6, 0.22, 2.0)); g.add(box(0.06, 0.45, 0.3, mat('#6b4a2e'), bx + 0.6, 0.22, 2.0)); }
  g.traverse(o => o.isMesh && (o.castShadow = true));
  return { g, seats: [new THREE.Vector3(-1.5, 0.45, 2.0), new THREE.Vector3(-0.9, 0.45, 2.0), new THREE.Vector3(1.0, 0.45, 2.0)].map(v => v.applyMatrix4(g.matrixWorld.compose(g.position, g.quaternion, g.scale))) };
}
export function foodCart(scene, x, z, rotY = 0, label = ['Bun Kabab', 'بن کباب']) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
  g.add(box(1.6, 0.9, 0.8, mat('#c62828', 0.6), 0, 0.75, 0)); g.add(box(1.7, 0.05, 0.9, mat('#bbb', 0.3, 0.8), 0, 1.22, 0));
  for (const sx of [-1, 1]) { const w = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 12), mat('#222', 0.8)); w.rotation.x = Math.PI / 2; w.position.set(sx * 0.6, 0.25, 0.42); g.add(w); }
  const tw = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), mat('#111', 0.4, 0.7)); tw.position.set(-0.3, 1.27, 0); g.add(tw);
  g.add(box(1.7, 0.04, 1.0, mat('#f9a825', 0.6), 0, 2.1, 0)); for (const sx of [-1, 1]) g.add(box(0.04, 0.9, 0.04, mat('#666'), sx * 0.8, 1.65, 0.45));
  const sg = mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: signTex(label[0], label[1], '#a33b1a') }), { cast: false }); sg.position.set(0, 1.85, 0.46); g.add(sg);
  g.traverse(o => o.isMesh && (o.castShadow = true)); return g;
}
export function autoShowroom(scene, x, z, side) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const gl = new THREE.MeshPhysicalMaterial({ color: '#9fb7c7', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35 });
  g.add(box(24, 0.15, 14, mat('#e8e8e8', 0.3), 0, 0.075, side * 7)); g.add(box(24, 0.5, 14, mat('#dfe3e6', 0.5), 0, 6.25, side * 7));
  const front = mesh(new THREE.PlaneGeometry(24, 6), gl, { cast: false }); front.position.set(0, 3, side * 0.05); if (side > 0) front.rotation.y = Math.PI; g.add(front);
  g.add(box(24, 6, 0.3, mat('#cfd5da', 0.5), 0, 3, side * 14)); for (const sx of [-1, 1]) g.add(box(0.3, 6, 14, mat('#cfd5da', 0.5), sx * 12, 3, side * 7));
  const sg = mesh(new THREE.PlaneGeometry(14, 1.6), new THREE.MeshStandardMaterial({ map: signTex('Auto Showroom', 'آٹو شوروم', '#b3121e'), emissive: '#fff', emissiveIntensity: 0.05 }), { cast: false }); sg.position.set(0, 7.3, side * 0.1); if (side > 0) sg.rotation.y = Math.PI; g.add(sg);
  for (let i = 0; i < 3; i++) { const c = createCar(i === 1 ? 'van' : 'sedan', 900 + i); c.group.position.set(-7 + i * 7, 0.15, side * 6); c.group.rotation.y = 0.5; g.add(c.group); }
  g.traverse(o => o.isMesh && (o.castShadow = true)); return g;
}
export function petrolPump(scene, x, z, side) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  g.add(box(22, 0.6, 12, mat('#f2f2f2', 0.5), 0, 5.6, side * 7)); g.add(box(22.1, 0.6, 0.1, mat('#1a7a4a', 0.5), 0, 5.6, side * 1.05));
  for (const px of [-6, 0, 6]) { g.add(box(0.5, 5.3, 0.5, mat('#ddd', 0.4), px, 2.65, side * 7)); g.add(box(0.8, 1.6, 0.5, mat('#1a7a4a', 0.5), px + 1.2, 0.8, side * 7)); }
  const sg = mesh(new THREE.PlaneGeometry(6, 1.3), new THREE.MeshStandardMaterial({ map: signTex('Petrol Pump', 'پیٹرول پمپ', '#1a7a4a') }), { cast: false }); sg.position.set(0, 6.6, side * 0.95); if (side > 0) sg.rotation.y = Math.PI; g.add(sg);
  g.traverse(o => o.isMesh && (o.castShadow = true)); return g;
}
// Bijli ke khambe + taar (Karachi ki pehchan)
export function utilityPoles(scene, x0, x1, z, step = 30) {
  const g = new THREE.Group(); scene.add(g); const pm = mat('#7a7a72', 0.8);
  for (let x = x0; x < x1; x += step) { g.add(box(0.25, 9, 0.25, pm, x, 4.5, z)); g.add(box(0.12, 0.12, 1.8, pm, x, 8.6, z)); const tr = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 8), mat('#5a5a5a', 0.6)); tr.position.set(x, 7.6, z + 0.3); g.add(tr); }
  for (const dz of [-0.8, 0, 0.8]) { const w = mesh(new THREE.CylinderGeometry(0.015, 0.015, x1 - x0, 4), mat('#111', 0.8), { cast: false }); w.rotation.z = Math.PI / 2; w.position.set((x0 + x1) / 2, 8.5, z + dz); g.add(w); }
  return g;
}
// Route sign gantry (blue Pakistani urban direction sign)
export function blueSign(scene, x, z, rotY, lines, w = 7) {
  const t = canvasTex(1024, 360, (g, W, H) => { g.fillStyle = '#123e8a'; g.fillRect(0, 0, W, H); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(10, 10, W - 20, H - 20); g.fillStyle = '#fff'; g.font = 'bold 76px DejaVu Sans'; g.textBaseline = 'middle'; lines.forEach((l, i) => g.fillText(l, 40, 80 + i * 105)); });
  const gr = new THREE.Group(); gr.position.set(x, 0, z); gr.rotation.y = rotY; scene.add(gr);
  gr.add(box(0.25, 7.2, 0.25, mat('#888', 0.4, 0.7), -w / 2 - 0.2, 3.6, 0)); gr.add(box(w + 0.6, 0.18, 0.18, mat('#888', 0.4, 0.7), 0, 6.9, 0));
  for (const face of [0, Math.PI]) { const p = mesh(new THREE.PlaneGeometry(w, w * 0.35), new THREE.MeshStandardMaterial({ map: t }), { cast: false }); p.position.set(0, 6.0, face ? -0.03 : 0.03); p.rotation.y = face; gr.add(p); }
  return gr;
}
// Star Gate (Karachi airport ki pehchan) — stylised gate monument ke saath
export function starGate(scene, x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const w = mat('#e9e4d8', 0.6);
  for (const s of [-1, 1]) g.add(box(2.2, 12, 2.2, w, 0, 6, s * 13));
  g.add(box(2.6, 2.0, 28.4, w, 0, 12.6, 0));
  const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? 1.0 : 2.4; i ? star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const sm = mesh(new THREE.ExtrudeGeometry(star, { depth: 0.4, bevelEnabled: false }), mat('#1a7a4a', 0.4, 0.3)); sm.position.set(0, 16.2, -0.2); sm.rotation.y = Math.PI / 2; g.add(sm);
  const t = canvasTex(1024, 128, (c, W, H) => { c.fillStyle = '#e9e4d8'; c.fillRect(0, 0, W, H); c.fillStyle = '#1a3a6a'; c.font = 'bold 70px DejaVu Sans'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('STAR GATE — JINNAH INTERNATIONAL AIRPORT', W / 2, H / 2); });
  for (const f of [1, -1]) { const p = mesh(new THREE.PlaneGeometry(26, 1.6), new THREE.MeshStandardMaterial({ map: t }), { cast: false }); p.position.set(f * 1.31, 12.6, 0); p.rotation.y = f * Math.PI / 2; g.add(p); }
  g.traverse(o => o.isMesh && (o.castShadow = true)); return g;
}

export const LANE_Z = -2.75, RAIL_Z = -17;
export const SHAHRAH_LANES = [
  { z: -6.45, dir: 1, speed: 11.5, count: 14, kinds: ['sedan', 'hatch', 'hatch', 'van', 'sedan', 'bus'] },
  { z: -7.75, dir: 1, speed: 9.0, count: 14, kinds: ['bike', 'bike', 'rickshaw', 'bike'] },
  { z: 2.75, dir: -1, speed: 14, count: 12, kinds: ['sedan', 'hatch', 'sedan', 'van'] },
  { z: 6.45, dir: -1, speed: 11, count: 12, kinds: ['sedan', 'hatch', 'van', 'bus', 'rickshaw'] },
  { z: 7.75, dir: -1, speed: 9, count: 12, kinds: ['bike', 'bike', 'rickshaw'] }
];
// Shahrah-e-Faisal: chauri sadak, office towers, petrol pump, Drigh Road par Circular Railway, banners
export function buildKarachiScene(scene, renderer, seed = 12) {
  const L = setupSkyAndLight(scene, renderer, { elev: 30, azim: 150, sunI: 3.3, fog: [0xd9d3c4, 80, 520], shadowSize: 45, sunColor: '#fff0d6' });
  buildKarachiRoad(scene, { railway: true, brands: (s, x, z, r, i) => brandBillboard(s, x, z, r, [2, 1, 0, 3, 4][i % 5]) });
  railway(scene, RAIL_Z, 1400);
  const train = createTrain(scene, 7); train.group.position.z = RAIL_Z;
  petrolPump(scene, 120, 13.5, 1); utilityPoles(scene, -300, 300, 11.6, 34);
  const traffic = createTraffic(scene, { lanes: SHAHRAH_LANES, seed });
  return { L, traffic, train };
}
