// Episode 1 v2 assets: ghar ka andar, brand banners, traffic lights, zebra crossing, railway + train,
// metro, workshop, airport entry checkpoint + ramps, Islamabad airport, baggage belt, Corolla Grande, malls, food court.
import * as THREE from 'three';
import { mat, mesh, box, rbox, rng, canvasTex, noiseTex, softSprite, TAU } from './util.js';
import { createWheel } from './vehicles.js';

// ---------------- BRAND BANNERS ----------------
export const BRANDS = [
  { name: 'Aprox AI', tag: 'Aap ka smart AI saathi', bg: ['#0b1f4d', '#1f6feb'], fg: '#ffffff', ac: '#38d9ff' },
  { name: 'Aprox Attendant', tag: 'Hazri ab AI ke zariye', bg: ['#0f3d2e', '#1fa37a'], fg: '#ffffff', ac: '#ffe066' },
  { name: 'Aprox Technology', tag: 'Software · AI · Cybersecurity', bg: ['#1a1a2e', '#5b2be0'], fg: '#ffffff', ac: '#ffb703' },
  { name: 'Next Group', tag: 'Agla qadam, behtar kal', bg: ['#4a0d0d', '#d62828'], fg: '#ffffff', ac: '#fcbf49' },
  { name: 'Thanda Cola', tag: 'Garmi ka pakka ilaaj!', bg: ['#7a0010', '#e3001b'], fg: '#ffffff', ac: '#ffffff' }
];
export function bannerTex(b, w = 1024, h = 400) {
  return canvasTex(w, h, (g) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, b.bg[0]); gr.addColorStop(1, b.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = b.ac; g.globalAlpha = 0.18; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w * 0.85, h * 0.5, 40 + i * 45, 0, TAU); g.lineWidth = 10; g.strokeStyle = b.ac; g.stroke(); } g.globalAlpha = 1;
    g.fillStyle = b.ac; g.fillRect(50, h * 0.62, 120, 10);
    g.fillStyle = b.fg; g.font = `bold ${Math.round(h * 0.26)}px DejaVu Sans`; g.textBaseline = 'alphabetic'; g.fillText(b.name, 50, h * 0.5);
    g.font = `600 ${Math.round(h * 0.12)}px DejaVu Sans`; g.fillText(b.tag, 50, h * 0.84);
  });
}
export function brandBillboard(scene, x, z, rotY, brandIdx, h = 9, W = 9) {
  const b = BRANDS[brandIdx % BRANDS.length];
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
  const pm = mat('#6b6f73', 0.5, 0.6);
  g.add(box(0.45, h, 0.45, pm, 0, h / 2, 0));
  const t = bannerTex(b);
  const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.08 });
  const panel = mesh(new THREE.BoxGeometry(W, W * 0.39, 0.25), [mat('#333'), mat('#333'), mat('#333'), mat('#333'), face, face]);
  panel.position.y = h + W * 0.2; g.add(panel);
  g.add(box(W, 0.1, 0.6, pm, 0, h + 0.05, 0.3));
  g.traverse(o => o.isMesh && (o.castShadow = true));
  return g;
}
// Building ki deewar par lamba banner
export function wallBanner(parent, w, h, brandIdx, x, y, z, rotY = 0) {
  const t = bannerTex(BRANDS[brandIdx % BRANDS.length]);
  const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, side: THREE.DoubleSide }), { cast: false });
  m.position.set(x, y, z); m.rotation.y = rotY; parent.add(m); return m;
}
// Highway sign (green) — Roman + Urdu
export function roadSign(scene, x, z, rotY, lines, urdu = null, w = 6, h = 2.4, H = 6) {
  const t = canvasTex(1024, 410, (g, W, Hh) => {
    g.fillStyle = '#0d6b3a'; g.fillRect(0, 0, W, Hh); g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(12, 12, W - 24, Hh - 24);
    g.fillStyle = '#fff'; g.font = 'bold 92px DejaVu Sans'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, 50, 100 + i * 120));
    if (urdu) { g.textAlign = 'right'; g.direction = 'rtl'; g.font = 'bold 96px DejaVu Sans'; g.fillText(urdu, W - 50, Hh - 90); }
  });
  const gr = new THREE.Group(); gr.position.set(x, 0, z); gr.rotation.y = rotY; scene.add(gr);
  for (const s of [-1, 1]) gr.add(box(0.18, H, 0.18, mat('#9aa0a6', 0.4, 0.7), s * w * 0.4, H / 2, 0));
  const p = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.5 })); p.position.y = H + h / 2 - 0.3; gr.add(p);
  return gr;
}

// ---------------- TRAFFIC LIGHT + ZEBRA ----------------
export function trafficLight(scene, x, z, rotY = 0, arm = 4) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
  const pm = mat('#2c2f33', 0.5, 0.6);
  g.add(box(0.2, 6, 0.2, pm, 0, 3, 0)); g.add(box(0.14, 0.14, arm, pm, 0, 5.9, arm / 2));
  const housing = box(0.45, 1.3, 0.4, mat('#111', 0.6), 0, 5.2, arm - 0.2); g.add(housing);
  const lamps = {};
  [['red', '#ff2a1a', 0.4], ['amber', '#ffb000', 0], ['green', '#18e05a', -0.4]].forEach(([k, c, dy]) => {
    const m = new THREE.MeshStandardMaterial({ color: '#222', emissive: c, emissiveIntensity: 0.05 });
    const l = mesh(new THREE.CircleGeometry(0.14, 16), m, { cast: false }); l.position.set(0.231, 5.2 + dy, arm - 0.2); l.rotation.y = Math.PI / 2; g.add(l);
    const l2 = l.clone(); l2.position.x = -0.231; l2.rotation.y = -Math.PI / 2; g.add(l2);
    lamps[k] = m;
  });
  g.traverse(o => o.isMesh && (o.castShadow = true));
  return { group: g, set(state) { for (const k of Object.keys(lamps)) { lamps[k].emissiveIntensity = k === state ? 3.0 : 0.04; lamps[k].color.set(k === state ? '#fff' : '#222'); } } };
}
export function zebra(scene, x, z, roadWidth, alongX = false, stripeW = 0.5, len = 3.2) {
  const m = mat('#f2f2ee', 0.7); const n = Math.floor(roadWidth / (stripeW * 2));
  const g = new THREE.Group(); scene.add(g);
  for (let i = 0; i < n; i++) {
    const s = mesh(new THREE.PlaneGeometry(alongX ? stripeW : len, alongX ? len : stripeW), m, { cast: false }); s.rotation.x = -Math.PI / 2;
    const o = -roadWidth / 2 + stripeW + i * stripeW * 2;
    s.position.set(alongX ? x + o : x, 0.014, alongX ? z : z + o); g.add(s);
  }
  return g;
}

// ---------------- RAILWAY + TRAIN ----------------
export function railway(scene, z, length = 1600, x0 = 0, y = 0) {
  const g = new THREE.Group(); scene.add(g);
  g.add(box(length, 0.35, 4.2, mat('#7d7468', 1), x0, y + 0.17, z, { cast: false })); // ballast
  const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.15, 2.6), mat('#5a4a3a', 0.9), Math.floor(length / 0.7));
  const o = new THREE.Object3D(); for (let i = 0; i < sl.count; i++) { o.position.set(x0 - length / 2 + i * 0.7, y + 0.42, z); o.updateMatrix(); sl.setMatrixAt(i, o.matrix); } sl.receiveShadow = true; g.add(sl);
  for (const s of [-0.72, 0.72]) g.add(box(length, 0.14, 0.08, mat('#8f9499', 0.3, 0.9), x0, y + 0.55, z + s, { cast: false }));
  return g;
}
export function createTrain(scene, cars = 6) {
  const g = new THREE.Group(); scene.add(g);
  const green = new THREE.MeshPhysicalMaterial({ color: '#1f5e3a', roughness: 0.45, clearcoat: 0.4 }); const yellow = mat('#e8b923', 0.5); const cream = mat('#e9e2cf', 0.6);
  const win = mat('#1b232b', 0.2, 0.4);
  // locomotive
  const loco = new THREE.Group(); g.add(loco);
  loco.add(rbox(17, 3.6, 3.0, 0.25, green)); loco.children[0].position.y = 2.5;
  loco.add(box(17.05, 0.35, 3.05, yellow, 0, 1.6, 0)); loco.add(box(0.1, 1.0, 2.4, win, 8.53, 3.4, 0)); loco.add(box(3, 0.6, 2.6, mat('#2a2a2a'), 2, 4.6, 0));
  const wheels = [];
  for (const x of [-6, -4.5, 4.5, 6]) for (const s of [-0.72, 0.72]) { const w = createWheel(0.5, 0.16, '#333', 6); w.position.set(x, 1.05, s); loco.add(w); wheels.push(w); }
  for (let c = 0; c < cars; c++) {
    const car = new THREE.Group(); car.position.x = -18 - c * 21.5; g.add(car);
    const b = rbox(21, 3.5, 3.0, 0.2, cream); b.position.y = 2.5; car.add(b);
    car.add(box(21.05, 0.6, 3.05, green, 0, 1.2 + 0.6, 0)); car.add(box(21.05, 0.25, 3.05, green, 0, 4.15, 0));
    for (let k = -9; k <= 9; k += 1.6) for (const s of [-1, 1]) car.add(box(1.0, 0.8, 0.05, win, k, 3.0, s * 1.53));
    for (const x of [-8, -6.8, 6.8, 8]) for (const s of [-0.72, 0.72]) { const w = createWheel(0.45, 0.14, '#333', 6); w.position.set(x, 1.0, s); car.add(w); wheels.push(w); }
  }
  g.traverse(o => o.isMesh && (o.castShadow = true));
  return { group: g, wheels, update(x, d) { g.position.x = x; for (const w of wheels) w.rotation.z = -d / 0.5; } };
}

// ---------------- METRO (Islamabad/Rawalpindi Metro Bus elevated) ----------------
export function metroGuideway(scene, z, length = 1600, H = 8) {
  const g = new THREE.Group(); scene.add(g);
  g.add(box(length, 0.8, 8, mat('#cfcac0', 0.8), 0, H, z));
  for (const s of [-1, 1]) g.add(box(length, 1.0, 0.25, mat('#e2ddd2', 0.7), 0, H + 0.9, z + s * 3.9));
  for (let x = -length / 2; x < length / 2; x += 30) g.add(box(1.6, H, 1.6, mat('#c4bfb4', 0.85), x, H / 2, z));
  g.traverse(o => o.isMesh && (o.castShadow = true, o.receiveShadow = true));
  return g;
}
export function createMetroBus(scene) {
  const g = new THREE.Group(); scene.add(g);
  const red = new THREE.MeshPhysicalMaterial({ color: '#c8102e', roughness: 0.35, clearcoat: 0.8 });
  const b = rbox(18, 3.0, 2.55, 0.25, red); b.position.y = 1.9; g.add(b);
  g.add(box(18.05, 1.0, 2.6, mat('#1b232b', 0.15, 0.4), 0, 2.4, 0));
  g.add(box(0.5, 2.6, 2.4, mat('#222'), 0, 1.9, 0));
  const wheels = []; for (const x of [-6.5, -1, 6.5]) for (const s of [-1.1, 1.1]) { const w = createWheel(0.5, 0.3, '#888', 5); w.position.set(x, 0.5, s); g.add(w); wheels.push(w); }
  g.traverse(o => o.isMesh && (o.castShadow = true));
  return { group: g, update(x, d) { g.position.x = x; for (const w of wheels) w.rotation.z = -d / 0.5; } };
}

// ---------------- ROADSIDE WORKSHOP ----------------
export function buildWorkshop(scene, at) {
  const g = new THREE.Group(); g.position.copy(at); scene.add(g);
  const tin = new THREE.MeshStandardMaterial({ color: '#8a8f94', roughness: 0.6, metalness: 0.5, map: canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#8a8f94'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { c.fillStyle = '#6f757a'; c.fillRect(x, 0, 3, h); } c.fillStyle = 'rgba(140,70,20,0.35)'; for (let i = 0; i < 30; i++) c.fillRect(Math.random() * w, Math.random() * h, 6, 10); }, { repeat: [4, 1] }) });
  // shed: open front facing +Z
  g.add(box(10, 0.2, 8, mat('#4a4744', 0.95), 0, 0.1, -4, { cast: false }));
  const roof = box(11, 0.12, 9, tin, 0, 4.2, -4); roof.rotation.x = 0.06; g.add(roof);
  for (const [x, z] of [[-5, 0], [5, 0], [-5, -8], [5, -8]]) g.add(box(0.2, 4.2, 0.2, mat('#3a3a3a', 0.6, 0.5), x, 2.1, z));
  g.add(box(10, 4, 0.15, mat('#c9c0aa', 0.95), 0, 2, -8));
  // signboard
  const st = canvasTex(1024, 220, (c, w, h) => { c.fillStyle = '#f4c20d'; c.fillRect(0, 0, w, h); c.fillStyle = '#b3141b'; c.font = 'bold 110px DejaVu Sans'; c.textBaseline = 'middle'; c.fillText('Auto Workshop', 40, h / 2 - 10); c.fillStyle = '#222'; c.font = '600 40px DejaVu Sans'; c.fillText('Engine · Radiator · Tuning', 44, h - 30); c.textAlign = 'right'; c.direction = 'rtl'; c.font = 'bold 80px DejaVu Sans'; c.fillStyle = '#b3141b'; c.fillText('ورکشاپ', w - 40, h / 2 - 10); });
  const sign = mesh(new THREE.PlaneGeometry(8, 1.7), new THREE.MeshStandardMaterial({ map: st, roughness: 0.6 })); sign.position.set(0, 5.2, 0.4); g.add(sign);
  g.add(box(8.2, 0.15, 0.15, mat('#333'), 0, 4.3, 0.35));
  // tyres stack, oil drums, toolbox, bench, jack
  const tyreM = mat('#151515', 0.9);
  for (let k = 0; k < 2; k++) for (let i = 0; i < 5; i++) { const t = mesh(new THREE.TorusGeometry(0.33, 0.14, 8, 18), tyreM); t.rotation.x = Math.PI / 2; t.position.set(-4 + k * 0.9, 0.16 + i * 0.28, -6.5); g.add(t); }
  for (const [x, c] of [[3.6, '#1e4f8a'], [4.3, '#a32020']]) { const d = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), mat(c, 0.6, 0.3)); d.position.set(x, 0.45, -7); g.add(d); }
  g.add(box(1.8, 0.9, 0.6, mat('#b22222', 0.5, 0.4), 2, 0.45, -7.4)); g.add(box(2.4, 0.08, 0.8, mat('#5a4a3a'), -1, 0.85, -7.3));
  for (let i = 0; i < 6; i++) g.add(box(0.05, 0.4, 0.02, mat('#888', 0.3, 0.9), -2 + i * 0.25, 2, -7.9));
  g.add(box(0.6, 0.25, 0.4, mat('#c22', 0.5), 1.0, 0.13, -1.0)); // jack
  g.traverse(o => o.isMesh && (o.castShadow = true, o.receiveShadow = true));
  return g;
}

// ---------------- HOME INTERIOR (bedroom + bathroom + dining) ----------------
// Bedroom: x∈[0,6], z∈[0,5]. Bathroom: x∈[6,9], z∈[0,3]. Dining: x∈[-6,0], z∈[0,5]. Floor y=0, ceiling 3.1.
export function buildHomeInterior(scene) {
  const tile = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#e3d9c6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#cdbfa7'; g.lineWidth = 3; for (let i = 0; i <= w; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }, { repeat: [6, 6] });
  const floor = mesh(new THREE.PlaneGeometry(20, 12), new THREE.MeshPhysicalMaterial({ map: tile, roughness: 0.3, clearcoat: 0.4 }), { cast: false }); floor.rotation.x = -Math.PI / 2; floor.position.set(1.5, 0, 2.5); scene.add(floor);
  const ceil = mesh(new THREE.PlaneGeometry(20, 12), mat('#f6f3ec', 0.9), { cast: false }); ceil.rotation.x = Math.PI / 2; ceil.position.set(1.5, 3.1, 2.5); scene.add(ceil);
  const wallM = new THREE.MeshStandardMaterial({ color: '#efe7d6', roughness: 0.95, map: noiseTex('#efe7d6', 8, 128, 77, [4, 2]) });
  const bedroomWall = new THREE.MeshStandardMaterial({ color: '#cfe0e6', roughness: 0.95 });
  const W = (w, h, d, m, x, y, z) => scene.add(box(w, h, d, m, x, y, z, { cast: false }));
  W(15.2, 3.1, 0.15, wallM, 1.5, 1.55, -0.07);          // back wall (z=0)
  W(0.15, 3.1, 5, bedroomWall, 9.07, 1.55, 2.5);        // right wall
  W(0.15, 3.1, 5, wallM, -6.07, 1.55, 2.5);             // left wall
  W(0.12, 3.1, 1.6, bedroomWall, 0, 1.55, 0.8); W(0.12, 3.1, 2.0, bedroomWall, 0, 1.55, 4.0); W(0.12, 0.8, 1.4, bedroomWall, 0, 2.7, 2.3); // bedroom/dining partition with doorway
  W(0.12, 3.1, 3, mat('#d5e3e8', 0.6), 6.0, 1.55, 1.5);  // bathroom wall
  W(1.6, 3.1, 0.12, mat('#d5e3e8', 0.6), 8.2, 1.55, 3.0); W(0.6, 0.8, 0.12, mat('#d5e3e8', 0.6), 6.8, 2.7, 3.0);
  // window + curtains (bedroom back wall)
  const wnd = mesh(new THREE.PlaneGeometry(1.8, 1.3), new THREE.MeshBasicMaterial({ color: '#cfe6f5' }), { cast: false }); wnd.position.set(3.2, 1.75, 0.01); scene.add(wnd);
  for (const s of [-1, 1]) scene.add(box(0.7, 2.1, 0.05, mat('#3a5f8a', 0.95), 3.2 + s * 1.15, 1.75, 0.08));
  // BED (double), headboard back wall, pillows, blanket
  const bed = new THREE.Group(); bed.position.set(1.6, 0, 1.2); scene.add(bed);
  bed.add(box(1.7, 0.45, 2.1, mat('#6b4a2e', 0.6), 0, 0.22, 1.05)); bed.add(box(1.6, 0.22, 2.0, mat('#f1efe8', 0.95), 0, 0.56, 1.05));
  bed.add(box(1.8, 1.1, 0.1, mat('#5a3d24', 0.6), 0, 0.75, 0));
  const pl = []; for (const s of [-0.4, 0.4]) { const p = rbox(0.6, 0.15, 0.35, 0.06, mat('#ffffff', 0.9)); p.position.set(s, 0.74, 0.3); bed.add(p); pl.push(p); }
  const blanket = box(1.66, 0.1, 1.45, mat('#2f6f8f', 0.95), 0, 0.71, 1.4); bed.add(blanket);
  // side table + alarm clock + lamp
  scene.add(box(0.5, 0.55, 0.45, mat('#6b4a2e', 0.6), 0.45, 0.27, 0.35));
  const clock = rbox(0.18, 0.12, 0.08, 0.02, mat('#222', 0.4)); clock.position.set(0.45, 0.62, 0.35); scene.add(clock);
  const cf = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#050505'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff3b30'; g.font = 'bold 40px DejaVu Sans Mono'; g.fillText('6:00', 12, 46); });
  const cfm = mesh(new THREE.PlaneGeometry(0.15, 0.075), new THREE.MeshBasicMaterial({ map: cf }), { cast: false }); cfm.position.set(0.45, 0.62, 0.395); scene.add(cfm);
  // WARDROBE (almari) with 2 doors — right wall side
  const war = new THREE.Group(); war.position.set(5.2, 0, 4.6); war.rotation.y = Math.PI; scene.add(war);
  war.add(box(1.6, 2.2, 0.6, mat('#7a5534', 0.55), 0, 1.1, 0));
  const doors = [];
  for (const s of [-1, 1]) { const piv = new THREE.Group(); piv.position.set(s * 0.8, 0, 0.31); war.add(piv); const d = box(0.79, 2.1, 0.04, mat('#8a6440', 0.5), -s * 0.395, 1.1, 0); piv.add(d); const h = box(0.03, 0.25, 0.04, mat('#c9a24a', 0.3, 0.9), -s * 0.7, 1.15, 0.04); piv.add(h); doors.push({ piv, s }); }
  // clothes inside (stacks + hanging shirts)
  const clothCols = ['#3a6ea5', '#e8e4da', '#7b2d2d', '#2f4f4f', '#c9b98f', '#111'];
  const stacks = [];
  for (let i = 0; i < 4; i++) { const c = box(0.34, 0.1, 0.3, mat(clothCols[i], 0.95), -0.5 + i * 0.33, 1.3, 0.0); war.add(c); stacks.push(c); }
  for (let i = 0; i < 6; i++) { const sh = box(0.05, 0.6, 0.4, mat(clothCols[(i + 2) % 6], 0.95), -0.6 + i * 0.24, 1.75, 0); war.add(sh); }
  war.add(box(1.5, 0.03, 0.5, mat('#6b4a2e'), 0, 1.24, 0));
  // dressing mirror + chair
  scene.add(box(0.9, 1.2, 0.04, mirrorMat(), 7.0, 1.6, 4.92));
  // ceiling fan
  const fan = new THREE.Group(); fan.position.set(2.5, 2.85, 2.4); scene.add(fan);
  fan.add(box(0.05, 0.3, 0.05, mat('#ddd'), 0, 0.12, 0)); fan.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 16), mat('#e8e8e8', 0.4)));
  for (let i = 0; i < 3; i++) { const b = box(0.65, 0.015, 0.12, mat('#e8e2d6', 0.5), 0.42, 0, 0); const p = new THREE.Group(); p.rotation.y = i * TAU / 3; p.add(b); fan.add(p); }
  // BATHROOM: sink + mirror + tiles
  const btile = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#dfeef2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b9d3da'; g.lineWidth = 3; for (let i = 0; i <= w; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }, { repeat: [3, 3] });
  const bw = mesh(new THREE.PlaneGeometry(3, 3.1), new THREE.MeshStandardMaterial({ map: btile, roughness: 0.3 }), { cast: false }); bw.position.set(7.55, 1.55, 0.01); scene.add(bw);
  scene.add(box(0.9, 0.15, 0.5, mat('#f7f7f7', 0.2), 7.55, 0.85, 0.3)); scene.add(box(0.25, 0.85, 0.25, mat('#f2f2f2', 0.3), 7.55, 0.42, 0.2));
  scene.add(box(0.04, 0.2, 0.04, mat('#ccc', 0.2, 1), 7.55, 1.02, 0.1));
  const mirror = box(0.85, 1.0, 0.03, mirrorMat(), 7.55, 1.75, 0.03); scene.add(mirror);
  // DINING: table + 4 chairs + food
  const tb = new THREE.Group(); tb.position.set(-3, 0, 2.5); scene.add(tb);
  tb.add(box(1.8, 0.06, 1.0, mat('#6b4a2e', 0.45), 0, 0.76, 0)); for (const [x, z] of [[-0.8, -0.42], [0.8, -0.42], [-0.8, 0.42], [0.8, 0.42]]) tb.add(box(0.07, 0.76, 0.07, mat('#5a3d24'), x, 0.38, z));
  for (const [x, z, r] of [[-0.45, 0.85, Math.PI], [0.45, 0.85, Math.PI], [-0.45, -0.85, 0], [0.45, -0.85, 0]]) { const ch = new THREE.Group(); ch.position.set(x, 0, z); ch.rotation.y = r; tb.add(ch); ch.add(box(0.45, 0.05, 0.45, mat('#7a5534'), 0, 0.46, 0)); ch.add(box(0.45, 0.5, 0.05, mat('#7a5534'), 0, 0.72, -0.21)); for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) ch.add(box(0.04, 0.46, 0.04, mat('#5a3d24'), a, 0.23, b)); }
  const plateM = mat('#fafafa', 0.3); const paratha = mat('#d9a556', 0.8); const chai = mat('#a8714a', 0.4);
  for (const [x, z] of [[-0.45, 0.25], [0.45, -0.25]]) { const p = mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.02, 20), plateM); p.position.set(x, 0.8, z); tb.add(p); const pr = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.015, 20), paratha); pr.position.set(x, 0.815, z); tb.add(pr);
    const cup = mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.08, 14), mat('#fff', 0.3)); cup.position.set(x + 0.22, 0.83, z); tb.add(cup); const tea = mesh(new THREE.CircleGeometry(0.036, 14), chai); tea.rotation.x = -Math.PI / 2; tea.position.set(x + 0.22, 0.865, z); tb.add(tea); }
  const egg = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 16), mat('#fff8e7', 0.5)); egg.position.set(0, 0.8, 0); tb.add(egg); const yolk = mesh(new THREE.SphereGeometry(0.03, 10, 6, 0, TAU, 0, Math.PI / 2), mat('#f2a900', 0.4)); yolk.position.set(0, 0.805, 0); tb.add(yolk);
  const pot = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.18, 14), mat('#c0c4c8', 0.3, 0.9)); pot.position.set(0.1, 0.88, 0.3); tb.add(pot);
  // lights
  scene.add(new THREE.HemisphereLight('#fff6e8', '#bfae94', 1.25));
  const key = new THREE.DirectionalLight('#fff1d8', 1.6); key.position.set(4, 8, 9); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 8, bottom: -8, near: 0.5, far: 40 }); key.shadow.bias = -0.0005; key.shadow.radius = 5; scene.add(key);
  const bulb = new THREE.PointLight('#ffe9c4', 5, 9, 1.6); bulb.position.set(2.5, 2.6, 2.4); scene.add(bulb);
  const bulb2 = new THREE.PointLight('#ffe9c4', 4, 8, 1.6); bulb2.position.set(-3, 2.6, 2.5); scene.add(bulb2);
  scene.background = new THREE.Color('#d9d2c4');
  scene.traverse(o => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });
  return { bed, blanket, fan, doors, stacks, clock, table: tb };
}

// ---------------- AIRPORT ENTRY CHECKPOINT + RAMPS ----------------
// Road along +X. Checkpoint at x=0. After x=40: departure ramp (left, z<0 ... upar) + arrival road (neeche).
export function buildAirportApproach(scene) {
  const g = new THREE.Group(); scene.add(g);
  const concrete = new THREE.MeshStandardMaterial({ color: '#c9c3b6', roughness: 0.9, map: noiseTex('#c9c3b6', 18, 128, 99, [40, 4]) });
  // booth + canopy
  g.add(box(30, 0.6, 22, mat('#d8cfba', 0.8), 0, 7, 0)); for (const [x, z] of [[-14, -10], [14, -10], [-14, 10], [14, 10], [0, -10], [0, 10]]) g.add(box(0.7, 7, 0.7, mat('#e8e1cf', 0.7), x, 3.5, z));
  const st = canvasTex(2048, 200, (c, w, h) => { c.fillStyle = '#0d4f8b'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 96px DejaVu Sans'; c.textBaseline = 'middle'; c.fillText('Jinnah International Airport', 40, h / 2); c.textAlign = 'right'; c.direction = 'rtl'; c.font = 'bold 84px DejaVu Sans'; c.fillText('جناح انٹرنیشنل ایئرپورٹ', w - 40, h / 2); });
  for (const s2 of [-1, 1]) for (const face of [0, 1]) { const sg = mesh(new THREE.PlaneGeometry(22, 2.15), new THREE.MeshStandardMaterial({ map: st })); sg.position.set(s2 * (15.35 + face * 0.1), 6.4, 0); sg.rotation.y = s2 * Math.PI / 2 + (face ? Math.PI : 0); g.add(sg); }
  const booth = new THREE.Group(); booth.position.set(0, 0, -1.2); g.add(booth);
  booth.add(box(2.2, 2.6, 1.6, mat('#e9e5da', 0.6), 0, 1.3, 0)); booth.add(box(2.25, 0.9, 1.65, mat('#1b232b', 0.15, 0.4), 0, 1.9, 0)); booth.add(box(2.6, 0.15, 2, mat('#c62828', 0.5), 0, 2.7, 0));
  // boom barrier (left lane z<0, ... barrier at x=2)
  const piv = new THREE.Group(); piv.position.set(2.0, 1.0, -2.2); g.add(piv);
  g.add(box(0.5, 1.0, 0.5, mat('#333', 0.5), 2.0, 0.5, -2.2));
  const t = canvasTex(256, 16, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#d32f2f' : '#ffffff'; c.fillRect(i * 32, 0, 32, h); } });
  const arm = mesh(new THREE.BoxGeometry(0.12, 0.12, 6), new THREE.MeshStandardMaterial({ map: t })); arm.position.z = -3; piv.add(arm);
  // speed breaker
  g.add(box(0.5, 0.08, 7, mat('#e6c229', 0.6), -6, 0.04, -4.2));
  // ramp split: departure ramp rises along +X from x=40 to x=110 (y 0→6.5) on z∈[-9,-2]; arrival road stays at y=0 on z∈[2,9]
  const L = 70, H = 6.5;
  const ramp = mesh(new THREE.BoxGeometry(Math.hypot(L, H), 0.5, 7.4), concrete); ramp.position.set(40 + L / 2, H / 2 - 0.2, -5.5); ramp.rotation.z = Math.atan2(H, L); g.add(ramp);
  g.add(box(200, 0.5, 7.4, concrete, 110 + 100, H - 0.2, -5.5));
  for (let x = 60; x < 300; x += 14) { const hgt = x < 110 ? (x - 40) / L * H : H; g.add(box(0.8, hgt, 0.8, mat('#d8d2c4', 0.8), x, hgt / 2, -5.5)); }
  for (const s of [-1, 1]) { const par = mesh(new THREE.BoxGeometry(Math.hypot(L, H), 0.9, 0.2), mat('#e8e2d4', 0.8)); par.position.set(40 + L / 2, H / 2 + 0.45, -5.5 + s * 3.7); par.rotation.z = Math.atan2(H, L); g.add(par); g.add(box(200, 0.9, 0.2, mat('#e8e2d4', 0.8), 210, H + 0.45, -5.5 + s * 3.7)); }
  // direction signs
  const sign = (txt, ur, arrow, x, z, col) => { const tx = canvasTex(1024, 320, (c, w, h) => { c.fillStyle = col; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 120px DejaVu Sans'; c.textBaseline = 'middle'; c.fillText(arrow + ' ' + txt, 40, h * 0.33); c.textAlign = 'right'; c.direction = 'rtl'; c.font = 'bold 100px DejaVu Sans'; c.fillText(ur, w - 40, h * 0.75); });
    const p = mesh(new THREE.PlaneGeometry(6, 1.9), new THREE.MeshStandardMaterial({ map: tx, side: THREE.DoubleSide })); p.position.set(x, 6.2, z); p.rotation.y = -Math.PI / 2; g.add(p); g.add(box(6, 0.15, 0.15, mat('#666'), x, 7.25, z)); };
  sign('Departures', 'روانگی', '↑', 30, -5.5, '#0d4f8b'); sign('Arrivals', 'آمد', '↓', 30, -13.5, '#1b6e3a');
  g.add(box(0.3, 7.3, 0.3, mat('#666'), 30.2, 3.6, -1.5)); g.add(box(0.3, 7.3, 0.3, mat('#666'), 30.2, 3.6, -17.5)); g.add(box(0.2, 0.2, 16.5, mat('#666'), 30.2, 7.3, -9.5));
  // Arrivals: ground level slip road (left), ramp ke neeche se terminal ki taraf
  const ar = mesh(new THREE.PlaneGeometry(380, 7), new THREE.MeshStandardMaterial({ color: '#4c4c4e', roughness: 0.92 }), { cast: false }); ar.rotation.x = -Math.PI / 2; ar.position.set(215, 0.006, -13.5); g.add(ar);
  const sl = mesh(new THREE.PlaneGeometry(40, 7), new THREE.MeshStandardMaterial({ color: '#4c4c4e', roughness: 0.92 }), { cast: false }); sl.rotation.x = -Math.PI / 2; sl.rotation.z = 0.2; sl.position.set(22, 0.006, -10.5); g.add(sl);
  g.traverse(o => o.isMesh && (o.castShadow = true, o.receiveShadow = true));
  return { boom: piv, rampL: L, rampH: H };
}

// ---------------- ISLAMABAD INTERNATIONAL AIRPORT (new terminal, wavy white roof) ----------------
export function buildIIAPExterior(scene) {
  const g = new THREE.Group(); scene.add(g);
  // wavy roof: displaced plane
  const geo = new THREE.PlaneGeometry(260, 70, 120, 30); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, 22 + 3.5 * Math.sin(x * 0.06) + 2.5 * Math.cos(z * 0.05) - Math.pow(Math.abs(z) / 35, 2) * 4); }
  geo.computeVertexNormals();
  const roof = mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#f4f6f7', roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide })); g.add(roof);
  // glass facade
  const glassT = canvasTex(512, 256, (c, w, h) => { c.fillStyle = '#5c8fb0'; c.fillRect(0, 0, w, h); c.strokeStyle = '#dfe9ef'; c.lineWidth = 3; for (let x = 0; x <= w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y <= h; y += 48) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } }, { repeat: [10, 2] });
  const f = mesh(new THREE.BoxGeometry(240, 18, 50), [mat('#e8ecee'), mat('#e8ecee'), mat('#eef1f2'), mat('#cfd3d5'), new THREE.MeshPhysicalMaterial({ map: glassT, roughness: 0.1, metalness: 0.5 }), new THREE.MeshPhysicalMaterial({ map: glassT, roughness: 0.1, metalness: 0.5 })]);
  f.position.set(0, 9, 0); g.add(f);
  for (let x = -110; x <= 110; x += 20) g.add(box(1.2, 22, 1.2, mat('#eef0f1', 0.4), x, 11, 33));
  const st = canvasTex(2048, 360, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#0f5f6b'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 130px DejaVu Sans'; c.fillText('Islamabad International Airport', w / 2, h * 0.3); c.direction = 'rtl'; c.font = 'bold 120px DejaVu Sans'; c.fillText('اسلام آباد انٹرنیشنل ایئرپورٹ', w / 2, h * 0.76); });
  const sgn = mesh(new THREE.PlaneGeometry(90, 15.8), new THREE.MeshStandardMaterial({ map: st, transparent: true }), { cast: false }); sgn.position.set(0, 13, 25.3); g.add(sgn);
  // dome / pyramid glass sections (reference render)
  const dome = mesh(new THREE.SphereGeometry(30, 32, 16, 0, TAU, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#7fb3cf', roughness: 0.1, metalness: 0.4, map: glassT })); dome.scale.y = 0.5; dome.position.set(170, 0, 30); g.add(dome);
  // parking (car rows) + kerb road
  g.traverse(o => o.isMesh && (o.castShadow = true, o.receiveShadow = true));
  return g;
}
export function buildCarousel(scene, at) {
  const g = new THREE.Group(); g.position.copy(at); scene.add(g);
  const steel = mat('#b7bcc2', 0.3, 0.8);
  // oval belt: two straights + two semicircles
  g.add(box(10, 0.5, 2.4, steel, 0, 0.25, 0)); for (const s of [-1, 1]) { const c = mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 24), steel); c.position.set(s * 5, 0.25, 0); g.add(c); }
  const belt = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.8 });
  g.add(box(10, 0.05, 2.0, belt, 0, 0.52, 0)); for (const s of [-1, 1]) { const c = mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.05, 24), belt); c.position.set(s * 5, 0.52, 0); g.add(c); }
  g.add(box(10, 0.5, 0.6, mat('#7a8088', 0.4, 0.6), 0, 0.9, 0)); // centre
  const sc = canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#081420'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd34d'; c.font = 'bold 54px DejaVu Sans'; c.textBaseline = 'middle'; c.fillText('Baggage · KHI', 24, h / 2); });
  const sm = mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: sc })); sm.position.set(0, 2.6, 0); g.add(sm); g.add(box(0.1, 2.2, 0.1, mat('#555'), 0, 1.4, 0));
  g.traverse(o => o.isMesh && (o.castShadow = true, o.receiveShadow = true));
  return g;
}

// ---------------- TOYOTA COROLLA GRANDE 1.8 (E170 proportions 4.62 x 1.775 x 1.475) ----------------
export function createCorolla(color = '#f4f4f2') {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.8 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#0d1318', roughness: 0.05, transparent: true, opacity: 0.6, clearcoat: 1, side: THREE.DoubleSide });
  const W = 1.775, R = 0.32, fa = 1.38, ra = -1.32;
  const ex = (pts, w, m, bev = 0.05) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) { if (p.arc) s.absarc(p.arc[0], p.arc[1], p.arc[2], 0, Math.PI, false); else s.lineTo(p[0], p[1]); } s.closePath(); const geo = new THREE.ExtrudeGeometry(s, { depth: w - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 14 }); geo.translate(0, 0, -(w - bev * 2) / 2); return mesh(geo, m); };
  g.add(ex([[2.31, 0.36], [fa + 0.38, 0.36], { arc: [fa, R, 0.38] }, [ra + 0.38, 0.36], { arc: [ra, R, 0.38] }, [-2.31, 0.36], [-2.31, 0.78], [-2.2, 0.98], [-1.55, 1.0], [0.85, 0.96], [2.15, 0.84], [2.31, 0.62]], W, paint));
  g.add(ex([[-1.62, 0.99], [-0.95, 1.44], [0.25, 1.47], [0.95, 0.97]], W - 0.14, glass, 0.03));
  const roof = rbox(1.15, 0.05, W - 0.16, 0.02, paint); roof.position.set(-0.36, 1.46, 0); g.add(roof);
  for (const s of [-1, 1]) { const b = box(0.08, 0.48, 0.05, mat('#111'), -0.32, 1.2, s * (W / 2 - 0.08)); g.add(b); }
  // grille chrome + headlights + taillights
  g.add(box(0.05, 0.12, 0.9, mat('#d0d3d6', 0.15, 1), 2.31, 0.72, 0)); g.add(box(0.05, 0.22, 1.0, mat('#111', 0.5), 2.3, 0.5, 0));
  for (const s of [-1, 1]) { const h = rbox(0.1, 0.12, 0.42, 0.03, new THREE.MeshStandardMaterial({ color: '#eef3ff', emissive: '#fff8e8', emissiveIntensity: 0.25, roughness: 0.1 })); h.position.set(2.24, 0.75, s * 0.62); g.add(h);
    const tl = rbox(0.06, 0.14, 0.42, 0.03, new THREE.MeshStandardMaterial({ color: '#b5100c', emissive: '#5a0000', emissiveIntensity: 0.6 })); tl.position.set(-2.3, 0.86, s * 0.6); g.add(tl);
    const mir = rbox(0.1, 0.1, 0.18, 0.03, paint); mir.position.set(0.82, 1.05, s * (W / 2 + 0.1)); g.add(mir); }
  // plates (blank)
  for (const x of [2.33, -2.33]) g.add(box(0.02, 0.11, 0.52, mat('#f3f3ee', 0.5), x, 0.5, 0));
  g.add(box(4.2, 0.2, W - 0.3, mat('#111', 0.9), 0, 0.3, 0));
  // RIGHT driver door (Pakistan RHD → +Z side) hinged at front edge
  const doorPiv = new THREE.Group(); doorPiv.position.set(0.88, 0, W / 2 + 0.005); g.add(doorPiv);
  const door = box(1.05, 0.55, 0.05, paint, -0.525, 0.68, 0.02); doorPiv.add(door);
  const dwin = box(0.95, 0.4, 0.03, glass, -0.5, 1.15, 0.0); dwin.rotation.x = 0.1; doorPiv.add(dwin);
  doorPiv.add(box(0.14, 0.03, 0.03, mat('#ccc', 0.2, 1), -0.85, 0.85, 0.05));
  g.add(box(1.0, 0.5, 0.02, mat('#141414', 0.9), 0.36, 0.68, W / 2 - 0.02)); // opening shadow
  // interior seats + steering (right)
  for (const z of [0.4, -0.4]) { g.add(box(0.5, 0.1, 0.48, mat('#2b2b2b', 0.9), 0.1, 0.55, z)); const bk = box(0.1, 0.6, 0.48, mat('#2b2b2b', 0.9), -0.17, 0.85, z); bk.rotation.z = -0.15; g.add(bk); }
  const sw = mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 24), mat('#111', 0.6)); sw.position.set(0.55, 0.98, 0.4); sw.rotation.y = Math.PI / 2; sw.rotateX(-0.45); g.add(sw);
  const wheels = []; for (const ax of [fa, ra]) for (const s of [-1, 1]) { const w = createWheel(R, 0.2, '#b9bcc0', 5); w.position.set(ax, R, s * (W / 2 - 0.12)); g.add(w); wheels.push(w); }
  g.traverse(o => o.isMesh && (o.castShadow = true));
  return { group: g, wheels, doorPiv, R, seats: { driver: new THREE.Vector3(0.12, 0.45, 0.4), passenger: new THREE.Vector3(0.12, 0.45, -0.4) },
    roll(d) { for (const w of wheels) w.rotation.z = -d / R; }, setDoor(o) { doorPiv.rotation.y = o * 1.15; } };
}

// ---------------- MALL / big building ----------------
export function buildMall(scene, x, z, w, d, h, name, rotY = 0, seed = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
  const gl = canvasTex(512, 512, (c, W, H) => { const r = rng(seed); c.fillStyle = '#4f7590'; c.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 32) for (let xx = 0; xx < W; xx += 32) { const k = 70 + r() * 40; c.fillStyle = `rgb(${k * 0.6},${k * 0.9},${k * 1.1})`; c.fillRect(xx + 1, y + 1, 30, 30); } }, { repeat: [w / 20, h / 20] });
  const glass = new THREE.MeshPhysicalMaterial({ map: gl, roughness: 0.12, metalness: 0.5 });
  g.add(box(w, h * 0.35, d, mat('#e4dfd5', 0.7), 0, h * 0.175, 0));
  const tw = mesh(new THREE.BoxGeometry(w * 0.6, h, d * 0.6), glass); tw.position.y = h / 2 + h * 0.02; g.add(tw);
  const st = canvasTex(1024, 180, (c, W, H) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); c.fillStyle = '#b3123b'; c.font = 'bold 120px DejaVu Sans'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillText(name, W / 2, H / 2); });
  const s = mesh(new THREE.PlaneGeometry(w * 0.7, w * 0.7 * 0.176), new THREE.MeshStandardMaterial({ map: st, emissive: '#ffffff', emissiveMap: st, emissiveIntensity: 0.15 }), { cast: false }); s.position.set(0, h * 0.3, d / 2 + 0.05); g.add(s);
  wallBanner(g, w * 0.5, h * 0.18, seed, 0, h * 0.62, d * 0.3 + 0.05);
  g.traverse(o => o.isMesh && (o.castShadow = true, o.receiveShadow = true));
  return g;
}

// ---------------- FOOD COURT (airport lounge) ----------------
export function buildFoodCourt(scene, at) {
  const g = new THREE.Group(); g.position.copy(at); scene.add(g);
  const stall = (x, name, bg, fg, sub) => {
    const s = new THREE.Group(); s.position.set(x, 0, 0); g.add(s);
    s.add(box(6, 1.1, 1.0, mat('#f2efe8', 0.4), 0, 0.55, 0)); s.add(box(6, 3.2, 0.2, mat('#efe9df', 0.6), 0, 1.6, -2.2));
    const t = canvasTex(1024, 220, (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = 'bold 120px DejaVu Sans'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillText(name, w / 2, h * 0.45); if (sub) { c.font = '600 40px DejaVu Sans'; c.fillText(sub, w / 2, h * 0.86); } });
    const sg = mesh(new THREE.PlaneGeometry(6, 1.3), new THREE.MeshStandardMaterial({ map: t, emissive: '#fff', emissiveMap: t, emissiveIntensity: 0.25 }), { cast: false }); sg.position.set(0, 3.6, -2.0); s.add(sg);
    const menu = canvasTex(512, 256, (c, w, h) => { c.fillStyle = '#111'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd34d'; c.font = 'bold 34px DejaVu Sans'; ['Burger  Rs 650', 'Fries  Rs 300', 'Chai  Rs 150', 'Paratha Roll  Rs 450'].forEach((l, i) => c.fillText(l, 20, 50 + i * 55)); });
    const mn = mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: menu }), { cast: false }); mn.position.set(0, 2.2, -2.05); s.add(mn);
  };
  stall(-7, "McDonald's", '#da291c', '#ffc72c', 'Burgers · Fries · Breakfast');
  stall(0, 'Chai Khana', '#2d5016', '#f2e6c9', 'Karak chai · Paratha');
  stall(7, 'Karachi Biryani', '#7a3e00', '#ffe8b0', 'Biryani · Haleem');
  // tables
  const tabs = [];
  for (let i = -2; i <= 2; i++) for (const z of [4, 7]) {
    const t = new THREE.Group(); t.position.set(i * 4, 0, z); g.add(t); tabs.push(t);
    { const a = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 20), mat('#f5f5f2', 0.3)); a.position.y = 0.75; t.add(a); const b = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 8), mat('#888', 0.3, 0.8)); b.position.y = 0.37; t.add(b); }
  }
  g.traverse(o => o.isMesh && (o.castShadow = true, o.receiveShadow = true));
  return { g, tabs };
}
// Food tray with burger + fries + drink
export function foodTray() {
  const g = new THREE.Group();
  g.add(box(0.42, 0.02, 0.3, mat('#c0392b', 0.5), 0, 0, 0));
  const bun = mat('#c8873a', 0.6); const b1 = mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, TAU, 0, Math.PI / 2), bun); b1.position.set(-0.08, 0.04, 0); g.add(b1);
  { const m = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 14), mat('#4a2a18', 0.7)); m.position.set(-0.08, 0.025, 0); g.add(m); }
  { const m = mesh(new THREE.CylinderGeometry(0.062, 0.06, 0.015, 14), bun); m.position.set(-0.08, 0.012, 0); g.add(m); }
  const box1 = box(0.07, 0.08, 0.04, mat('#da291c', 0.6), 0.08, 0.05, -0.05); g.add(box1);
  for (let i = 0; i < 6; i++) g.add(box(0.008, 0.06, 0.008, mat('#f2c14e', 0.6), 0.06 + i * 0.008, 0.1, -0.05));
  { const m = mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.14, 12), mat('#f4f4f4', 0.5)); m.position.set(0.12, 0.08, 0.07); g.add(m); }
  return g;
}

function mirrorMat() { return new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#eef4f6'); gr.addColorStop(0.5, '#c9d6db'); gr.addColorStop(1, '#e3ebee'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 6; g.beginPath(); g.moveTo(20, 110); g.lineTo(60, 20); g.stroke(); }) }); }
