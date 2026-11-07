// Environments — reference photos se geometry/colour/proportion samajh kar 3D mein dobara banaye gaye.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mat, mesh, box, rbox, rng, canvasTex, noiseTex, softSprite, TAU } from './util.js';

export function setupSkyAndLight(scene, renderer, { elev = 25, azim = 140, turbidity = 4, rayleigh = 2.4, sunI = 3.0, hemiI = 0.9, fog = [0xc8d4dc, 60, 900], shadowSize = 40, sunColor = '#fff1dc' } = {}) {
  const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
  const u = sky.material.uniforms; u.turbidity.value = turbidity; u.rayleigh.value = rayleigh; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.85;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azim));
  u.sunPosition.value.copy(sun);
  // environment map from sky (reflections on cars, glass)
  const pm = new THREE.PMREMGenerator(renderer); const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000);
  Object.assign(sky2.material.uniforms.sunPosition.value, sun); for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = u[k].value;
  envScene.add(sky2); const rt = pm.fromScene(envScene, 0, 0.1, 2000); scene.environment = rt.texture;
  const dl = new THREE.DirectionalLight(sunColor, sunI); dl.position.copy(sun).multiplyScalar(100); dl.castShadow = true;
  dl.shadow.mapSize.set(2048, 2048); const sc = dl.shadow.camera; sc.left = -shadowSize; sc.right = shadowSize; sc.top = shadowSize; sc.bottom = -shadowSize; sc.near = 1; sc.far = 400;
  dl.shadow.bias = -0.0004; dl.shadow.normalBias = 0.03; dl.shadow.radius = 3;
  scene.add(dl); scene.add(dl.target);
  const hemi = new THREE.HemisphereLight('#cfe2ff', '#7a6a52', hemiI * 0.7); scene.add(hemi);
  if (fog) scene.fog = new THREE.Fog(fog[0], fog[1], fog[2]);
  return { sky, sun, dl, hemi, follow(p) { dl.position.copy(p).add(sun.clone().multiplyScalar(100)); dl.target.position.copy(p); } };
}

export function ground(scene, size = 2000, color = '#8f8a78', y = -0.01, rep = 200) {
  const g = mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color, roughness: 1, map: noiseTex(color, 30, 256, 5, [rep, rep]) }), { cast: false });
  g.rotation.x = -Math.PI / 2; g.position.y = y; scene.add(g); return g;
}

function asphaltTex(seed = 2, lanes = 2, { median = false, edge = '#f2f2f2', dashes = true } = {}) {
  return canvasTex(512, 512, (g, w, h) => {
    const r = rng(seed); g.fillStyle = '#4a4a4c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const c = 60 + r() * 30; g.fillStyle = `rgb(${c},${c},${c + 2})`; g.fillRect(r() * w, r() * h, 2, 2); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(30,30,30,0.15)'; g.beginPath(); g.ellipse(r() * w, r() * h, 40 + r() * 80, 10 + r() * 20, 0, 0, 7); g.fill(); }
  }, { repeat: [1, 1] });
}

// Road strip along X: width, z-center, with lane markings as separate thin meshes
export function road(scene, { length = 600, width = 7, z = 0, x = 0, laneLines = [], edgeLines = true, color = '#505052', y = 0 } = {}) {
  const tex = asphaltTex(3); tex.repeat.set(length / 8, width / 8);
  const m = mesh(new THREE.PlaneGeometry(length, width), new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, roughness: 0.92 }), { cast: false });
  m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.005, z); scene.add(m);
  const lineM = new THREE.MeshStandardMaterial({ color: '#efefe8', roughness: 0.7 });
  for (const lz of laneLines) {
    const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 0.13), lineM, Math.floor(length / 9));
    const o = new THREE.Object3D();
    for (let i = 0; i < dashes.count; i++) { o.position.set(x - length / 2 + i * 9, y + 0.012, z + lz); o.rotation.x = -Math.PI / 2; o.updateMatrix(); dashes.setMatrixAt(i, o.matrix); }
    dashes.receiveShadow = true; scene.add(dashes);
  }
  if (edgeLines) for (const s of [-1, 1]) { const e = mesh(new THREE.PlaneGeometry(length, 0.14), new THREE.MeshStandardMaterial({ color: '#e8d24a', roughness: 0.7 }), { cast: false }); e.rotation.x = -Math.PI / 2; e.position.set(x, y + 0.011, z + s * (width / 2 - 0.25)); scene.add(e); }
  return m;
}

// Kerb (yellow-black — Pakistani roads ka typical kerb paint)
export function kerb(scene, { length = 600, z = 0, x = 0, h = 0.2, w = 0.3, striped = true } = {}) {
  const t = canvasTex(256, 32, (g, W, H) => { for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#1a1a1a' : '#e9c21a'; g.fillRect(i * W / 4, 0, W / 4, H); } }, { repeat: [length / 2, 1] });
  const m = mesh(new THREE.BoxGeometry(length, h, w), striped ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }) : mat('#bdb8aa', 0.9), { cast: false });
  m.position.set(x, h / 2, z); scene.add(m); return m;
}

// Trees: neem / gulmohar / conocarpus type (instanced low-poly canopies)
export function trees(scene, positions, { seed = 4, scale = 1, palette = ['#3e6b2b', '#4d7a32', '#355f27', '#5a8a3a'], trunk = '#5b4632', shape = 'round' } = {}) {
  const r = rng(seed); const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 7); trunkGeo.translate(0, 0.5, 0);
  const leafGeo = blobGeo(seed);
  const tm = mat(trunk, 0.95);
  const leafMats = palette.map((c, i) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, map: leafTex(c, seed + i) }));
  for (const p of positions) {
    const s = scale * (0.75 + r() * 0.5);
    const tr = mesh(trunkGeo, tm); const th = (shape === 'tall' ? 3.5 : 2.4) * s; tr.scale.set(s, th, s); tr.position.set(p[0], 0, p[1]); group.add(tr);
    const n = shape === 'tall' ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const lf = mesh(leafGeo, leafMats[Math.floor(r() * leafMats.length)]);
      const rad = (shape === 'tall' ? 0.9 : 1.1 + r() * 0.5) * s;
      lf.scale.set(rad, rad * (shape === 'tall' ? 1.6 : 0.8), rad);
      lf.position.set(p[0] + (r() - 0.5) * 1.4 * s, th + (shape === 'tall' ? i * 1.3 * s : 0.4 * s + r() * 0.8 * s), p[1] + (r() - 0.5) * 1.4 * s);
      lf.rotation.set(r() * 3, r() * 3, r() * 3); group.add(lf);
    }
  }
  scene.add(group); return group;
}

export function streetLight(scene, x, z, side = 1, h = 8, double = false) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const pm = mat('#8c9196', 0.4, 0.7);
  g.add(box(0.14, h, 0.14, pm, 0, h / 2, 0));
  const arms = double ? [-1, 1] : [side];
  for (const s of arms) { const a = box(0.08, 0.08, 1.6, pm, 0, h - 0.1, -s * 0.8); g.add(a); const lamp = box(0.3, 0.1, 0.55, mat('#ddd', 0.3, 0.3), 0, h - 0.18, -s * 1.5); g.add(lamp); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(g); return g;
}

// Building facade texture (windows, AC units, balconies — Karachi style)
function facadeTex(seed, base, floors, cols, { glass = false } = {}) {
  const r = rng(seed);
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 3, 3); }
    const fh = h / floors, cw = w / cols;
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.15, y = f * fh + fh * 0.2;
      if (glass) { g.fillStyle = `rgb(${40 + r() * 30},${70 + r() * 30},${90 + r() * 30})`; g.fillRect(c * cw + 1, f * fh + 2, cw - 2, fh - 3); continue; }
      g.fillStyle = r() < 0.25 ? '#3a3f44' : '#22282e'; g.fillRect(x, y, cw * 0.7, fh * 0.55);
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.strokeRect(x, y, cw * 0.7, fh * 0.55);
      if (r() < 0.3) { g.fillStyle = '#e8e8e2'; g.fillRect(x + cw * 0.5, y + fh * 0.5, cw * 0.25, fh * 0.15); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(c * cw, f * fh + fh * 0.85, cw, 3);
    }
  });
}
export function building(scene, x, z, w, d, h, seed, { base, glass = false, rotY = 0 } = {}) {
  const r = rng(seed);
  const cols = ['#d8cdb8', '#e4dccb', '#c9bfa8', '#b9b2a3', '#e6e1d6', '#d3c3a4', '#a8a59d'];
  const c = base || cols[Math.floor(r() * cols.length)];
  const floors = Math.max(1, Math.round(h / 3.2));
  const t = facadeTex(seed, c, floors, Math.max(2, Math.round(w / 3)), { glass });
  const tSide = facadeTex(seed + 1, c, floors, Math.max(2, Math.round(d / 3)), { glass });
  const plain = mat(c, 0.9);
  const ms = [new THREE.MeshStandardMaterial({ map: tSide, roughness: glass ? 0.25 : 0.9, metalness: glass ? 0.4 : 0 }), new THREE.MeshStandardMaterial({ map: tSide, roughness: 0.9 }), plain, plain,
    new THREE.MeshStandardMaterial({ map: t, roughness: glass ? 0.25 : 0.9, metalness: glass ? 0.4 : 0 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 })];
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ms); b.castShadow = true; b.receiveShadow = true;
  b.position.set(x, h / 2, z); b.rotation.y = rotY; scene.add(b);
  if (r() < 0.5) { const tank = mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 10), mat('#2b2b2b', 0.8)); tank.position.set(x + (r() - 0.5) * w * 0.5, h + 0.6, z); scene.add(tank); }
  return b;
}

// Billboard (bina text ke — sirf colour graphic, gibberish text se bachne ke liye)
export function billboard(scene, x, z, rotY = 0, seed = 1, h = 9) {
  const r = rng(seed); const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
  g.add(box(0.35, h, 0.35, mat('#6b6f73', 0.5, 0.6), 0, h / 2, 0));
  const pal = [['#0b6e4f', '#f2c14e'], ['#c0392b', '#f5f5f5'], ['#1f4e9c', '#f39c12'], ['#6c3483', '#f7dc6f']][Math.floor(r() * 4)];
  const t = canvasTex(512, 256, (c, w, hh) => {
    const gr = c.createLinearGradient(0, 0, w, hh); gr.addColorStop(0, pal[0]); gr.addColorStop(1, pal[0] + 'cc'); c.fillStyle = gr; c.fillRect(0, 0, w, hh);
    c.fillStyle = pal[1]; c.beginPath(); c.arc(w * 0.75, hh * 0.5, hh * 0.35, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(30, 60, 220, 22); c.fillRect(30, 100, 160, 14); c.fillRect(30, 126, 190, 14);
  });
  const panel = mesh(new THREE.BoxGeometry(7, 3.4, 0.2), [mat('#333'), mat('#333'), mat('#333'), mat('#333'), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), mat('#333')]);
  panel.position.y = h + 1.4; g.add(panel); scene.add(g); return g;
}

// ===================== KARACHI HOUSE STREET =====================
export function buildHouseStreet(scene) {
  const r = rng(11);
  ground(scene, 800, '#a29a86');
  road(scene, { length: 400, width: 7.4, z: 5.2, laneLines: [], edgeLines: false });
  // footpaths
  for (const zz of [0.75, 9.6]) { const fp = box(400, 0.15, zz === 0.75 ? 1.5 : 1.4, new THREE.MeshStandardMaterial({ color: '#b8b1a0', roughness: 0.95, map: noiseTex('#b8b1a0', 25, 128, 9, [200, 1]) }), 0, 0.075, zz, { cast: false }); scene.add(fp); }
  kerb(scene, { length: 400, z: 1.5, h: 0.18, w: 0.12 }); kerb(scene, { length: 400, z: 8.9, h: 0.18, w: 0.12 });
  // MAIN HOUSE (two-storey, cream + beige, stone cladding base) — boundary wall z=0, gate x∈[-2,2]
  const cream = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.92, map: noiseTex('#efe6d2', 10, 128, 12, [4, 2]) });
  const beige = mat('#c9ab7c', 0.9); const stone = new THREE.MeshStandardMaterial({ color: '#a89176', roughness: 1, map: stoneTex() });
  const H = new THREE.Group(); scene.add(H);
  // boundary wall with pillars
  const wallH = 2.5;
  for (const [x0, x1] of [[-11, -2.25], [2.25, 11]]) {
    const w = x1 - x0; H.add(box(w, wallH, 0.25, cream, (x0 + x1) / 2, wallH / 2, 0)); H.add(box(w, 0.9, 0.28, stone, (x0 + x1) / 2, 0.45, 0.01));
    H.add(box(w + 0.1, 0.1, 0.36, beige, (x0 + x1) / 2, wallH + 0.05, 0));
  }
  for (const x of [-2.4, 2.4, -11, 11]) { H.add(box(0.5, 2.9, 0.5, beige, x, 1.45, 0)); const lamp = mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshStandardMaterial({ color: '#fff7e0', emissive: '#ffe8b0', emissiveIntensity: 0.2 })); lamp.position.set(x, 3.05, 0); H.add(lamp); }
  // house nameplate (Roman Urdu) on pillar
  const plateT = canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#2b2118'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8d7a8'; g.font = 'bold 34px DejaVu Serif'; g.textAlign = 'center'; g.fillText('Umer House', w / 2, 60); });
  const plate = mesh(new THREE.PlaneGeometry(0.46, 0.17), new THREE.MeshStandardMaterial({ map: plateT, roughness: 0.5 })); plate.position.set(2.4, 1.9, 0.256); H.add(plate);
  // MAIN GATE — do palle (leaves), black wrought metal, hinge pillars par, andar (−Z) ki taraf khulte hain
  const gateM = mat('#16181a', 0.45, 0.75);
  const mkLeaf = (sx) => {
    const pivot = new THREE.Group(); pivot.position.set(sx * 2.15, 0, 0); H.add(pivot);
    const lw = 2.1; const lg = new THREE.Group(); lg.position.x = -sx * lw / 2; pivot.add(lg);
    lg.add(box(lw, 0.08, 0.06, gateM, 0, 0.12, 0)); lg.add(box(lw, 0.08, 0.06, gateM, 0, 2.35, 0)); lg.add(box(lw, 0.06, 0.06, gateM, 0, 1.2, 0));
    lg.add(box(lw, 1.0, 0.03, mat('#1d2023', 0.5, 0.7), 0, 0.68, 0));
    for (let i = 0; i <= 12; i++) lg.add(box(0.03, 1.15, 0.03, gateM, -lw / 2 + i * lw / 12, 1.78, 0));
    for (const s of [-1, 1]) lg.add(box(0.07, 2.35, 0.07, gateM, s * lw / 2, 1.2, 0));
    const knob = mesh(new THREE.SphereGeometry(0.035, 10, 8), mat('#b8955a', 0.3, 0.9)); knob.position.set(sx * (lw / 2 - 0.12), 1.15, 0.05); lg.add(knob);
    return pivot;
  };
  const leafL = mkLeaf(-1), leafR = mkLeaf(1);
  // house body
  const hx = 0, hz = -9;
  H.add(box(14, 3.4, 9, cream, hx, 1.7, hz)); H.add(box(12, 3.2, 8, cream, hx - 1, 3.4 + 1.6, hz - 0.5));
  H.add(box(14.4, 0.25, 9.4, beige, hx, 3.45, hz)); H.add(box(12.4, 0.3, 8.4, beige, hx - 1, 6.7, hz - 0.5));
  H.add(box(14, 0.9, 0.3, stone, hx, 0.45, hz + 4.55));
  // porch, windows with grills, balcony
  const glass = new THREE.MeshPhysicalMaterial({ color: '#1e2a33', roughness: 0.08, metalness: 0.3, clearcoat: 1 });
  for (const [x, y] of [[-4.5, 1.9], [4.5, 1.9], [-4.5, 5.1], [2.5, 5.1]]) {
    H.add(box(1.8, 1.5, 0.08, glass, x, y, hz + 4.52)); H.add(box(2.1, 0.12, 0.3, beige, x, y - 0.82, hz + 4.6)); H.add(box(2.1, 0.12, 0.35, beige, x, y + 0.85, hz + 4.62));
    for (let i = 0; i < 7; i++) H.add(box(0.025, 1.5, 0.025, gateM, x - 0.9 + i * 0.3, y, hz + 4.6));
  }
  H.add(box(1.4, 2.4, 0.1, mat('#5b3a22', 0.6), 0.5, 1.2, hz + 4.52)); // door
  H.add(box(4.6, 0.2, 2.6, beige, 0, 3.0, hz + 5.7)); for (const x of [-2.1, 2.1]) H.add(box(0.25, 3.0, 0.25, beige, x, 1.5, hz + 6.8));
  // balcony railing
  H.add(box(4.2, 0.08, 0.08, gateM, -1, 4.45, hz + 4.62 + 0.3)); for (let i = 0; i < 15; i++) H.add(box(0.03, 0.95, 0.03, gateM, -3.1 + i * 0.3, 3.98, hz + 4.92));
  // inside courtyard floor
  H.add(box(21, 0.06, 4.3, mat('#cfc6b4', 0.85), 0, 0.03, -2.2));
  // bougainvillea + neem tree inside wall
  trees(scene, [[-6.5, -2.2], [7, -2.5]], { seed: 21, scale: 1.25 });
  const bougM = new THREE.MeshStandardMaterial({ color: '#c2266b', roughness: 0.9, flatShading: true });
  for (let i = 0; i < 9; i++) { const b = mesh(new THREE.IcosahedronGeometry(0.55 + r() * 0.3, 1), r() < 0.6 ? bougM : mat('#3d6b2a', 0.9)); b.position.set(-10 + i * 0.8 + r() * 0.3, 2.5 + r() * 0.5, -0.2); scene.add(b); }
  // neighbour houses
  for (const [x, c] of [[-24, '#e2dccb'], [24, '#d9cbb0'], [-46, '#ece6d8'], [46, '#e0d2b8']]) {
    scene.add(box(20, 2.5, 0.25, mat(c, 0.9), x, 1.25, 0)); building(scene, x, -9, 14, 9, 6.5, Math.abs(x), { base: c });
    const gt = box(4, 2.3, 0.08, gateM, x, 1.15, 0.05); scene.add(gt);
  }
  // opposite side houses
  for (let i = -3; i <= 3; i++) { scene.add(box(20, 2.5, 0.25, mat(['#e2dccb', '#d6c9ae', '#ebe4d4'][(i + 3) % 3], 0.9), i * 22, 1.25, 10.5)); building(scene, i * 22, 19, 14, 9, 6.5 + (i % 2) * 3, 200 + i); }
  trees(scene, [[-15, 10], [-30, 9.8], [8, 9.8], [30, 9.8], [-38, 0.6], [16, 0.9]], { seed: 31, scale: 1.0 });
  for (const x of [-20, 12, 40]) streetLight(scene, x, 9.4, -1, 7);
  // parked car across street
  return { leafL, leafR };
}
function stoneTex() {
  const r = rng(5);
  return canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#9a8468'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = -(y % 32); x < w; x += 32) { const c = 130 + r() * 50; g.fillStyle = `rgb(${c},${c * 0.88},${c * 0.7})`; g.fillRect(x + 1, y + 1, 30, 14); } }, { repeat: [6, 1] });
}

// ===================== KARACHI ARTERIAL ROAD (Shahrah-e-Faisal style) =====================
export function buildKarachiRoad(scene, opts = {}) {
  ground(scene, 3000, '#a0957c');
  // dual carriageway along X: +X lanes at z∈[-8,-0.8] (LEFT side), −X lanes at z∈[0.8,8]
  road(scene, { length: 1200, width: 7.4, z: -4.6, laneLines: [0] });
  road(scene, { length: 1200, width: 7.4, z: 4.6, laneLines: [0] });
  // median: green with conocarpus + kerb
  const med = box(1200, 0.25, 1.4, mat('#5f7d3a', 1), 0, 0.125, 0, { cast: false }); scene.add(med);
  kerb(scene, { length: 1200, z: -0.72, w: 0.14, h: 0.28 }); kerb(scene, { length: 1200, z: 0.72, w: 0.14, h: 0.28 });
  kerb(scene, { length: 1200, z: -8.35, w: 0.14, h: 0.22 }); kerb(scene, { length: 1200, z: 8.35, w: 0.14, h: 0.22 });
  const tp = []; for (let x = -600; x < 600; x += 7) tp.push([x, 0]);
  if (!opts.noMedianTrees) trees(scene, tp, { seed: 41, scale: 0.75, shape: 'tall', palette: ['#4f7a2e', '#5b8a35', '#466e29'] });
  for (let x = -600; x < 600; x += 38) streetLight(scene, x, opts.metro ? -8.6 : 0, opts.metro ? -1 : 1, 10, !opts.metro);
  // service footpaths
  for (const z of [-9.4, 9.4]) scene.add(box(1200, 0.15, 2, mat('#b5ad9a', 0.95), 0, 0.075, z, { cast: false }));
  // buildings (mixed: plazas, glass towers, older blocks)
  const r = rng(43);
  for (const side of [-1, 1]) {
    let x = -600;
    while (x < 600) {
      const w = 12 + r() * 22, d = 12 + r() * 10, tall = r() < 0.18, h = tall ? 35 + r() * 45 : 8 + r() * 18;
      const off = (opts.railway && side < 0) ? 12 : 0;
      if (opts.skip && opts.skip(x, w, side)) { x += w + 4; continue; }
      building(scene, x + w / 2, side * (13 + off + d / 2 + r() * 6), w, d, h, Math.floor(x * 7 + side * 3 + 1000), { glass: tall && r() < 0.7 });
      x += w + 2 + r() * 8;
    }
    const tp2 = []; for (let x2 = -600; x2 < 600; x2 += 9 + r() * 6) tp2.push([x2, side * (10.8 + r() * 1.2)]);
    trees(scene, tp2, { seed: 50 + side, scale: 0.9 });
  }
  if (opts.brands) { for (let i = 0; i < 22; i++) opts.brands(scene, -560 + i * 52, (i % 2 ? 1 : -1) * 11.6, i % 2 ? Math.PI - 0.5 : 0.5, i); }
  else for (let i = 0; i < 10; i++) billboard(scene, -500 + i * 110, (i % 2 ? 1 : -1) * 12, (i % 2 ? 1 : 0) * Math.PI, i + 3);
  // pedestrian bridge (Karachi signature)
  for (const bx of (opts.noBridges ? [] : [-180, 140])) {
    const pb = new THREE.Group(); pb.position.x = bx; scene.add(pb);
    const pm = mat('#1f6f8b', 0.6, 0.3);
    pb.add(box(2.4, 0.5, 22, pm, 0, 6.2, 0)); for (const z of [-10, 0, 10]) pb.add(box(0.4, 6, 0.4, mat('#9aa', 0.6), 0, 3, z));
    for (const s of [-1, 1]) pb.add(box(2.4, 1.1, 0.06, mat('#d0d6d8', 0.4, 0.5), 0, 7.0, s * 11));
    for (const s of [-1, 1]) pb.add(box(0.06, 1.0, 22, mat('#c7cdd0', 0.4, 0.6), s * 1.2, 6.95, 0));
    pb.traverse(o => o.isMesh && (o.castShadow = true));
  }
}

// ===================== JINNAH INTERNATIONAL — exterior =====================
// Reference: beige twin end-towers with pointed-arch recess, dark curtain-wall centre, long canopy, flag on top.
export function buildJinnahTerminal(scene) {
  ground(scene, 3000, '#9e9278');
  const beige = new THREE.MeshStandardMaterial({ color: '#e6dcc6', roughness: 0.85, map: noiseTex('#e6dcc6', 12, 128, 61, [6, 6]) });
  const darkGlass = new THREE.MeshPhysicalMaterial({ color: '#2a2f38', roughness: 0.12, metalness: 0.6, clearcoat: 1, map: curtainTex() });
  const T = new THREE.Group(); T.position.set(0, 0, -40); scene.add(T);
  // central block
  T.add(box(70, 24, 22, beige, 0, 12, -4));
  const cw = mesh(new THREE.BoxGeometry(48, 15, 0.4), darkGlass); cw.position.set(0, 14.5, 7.2); T.add(cw);
  // top band with stepped crown
  T.add(box(70, 4, 1.2, beige, 0, 24, 7.2)); T.add(box(14, 2.4, 1.2, beige, 0, 27, 7.2)); T.add(box(8, 1.6, 1.2, beige, 0, 29, 7.2));
  // signage: "Jinnah International" (English) + Urdu, logo plate
  const signT = canvasTex(2048, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#4a3a22'; g.font = 'bold 92px DejaVu Serif'; g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillText('Jinnah International', 40, h / 2 + 4);
    g.textAlign = 'right'; g.direction = 'rtl'; g.font = 'bold 96px DejaVu Sans'; g.fillText('جناح انٹرنیشنل', w - 40, h / 2 + 4);
  });
  const sign = mesh(new THREE.PlaneGeometry(46, 3.6), new THREE.MeshStandardMaterial({ map: signT, transparent: true, roughness: 0.6 }), { cast: false }); sign.position.set(0, 24, 7.85); T.add(sign);
  // end towers with pointed arch recess
  for (const s of [-1, 1]) {
    const tw = new THREE.Group(); tw.position.set(s * 40, 0, 0); T.add(tw);
    tw.add(box(14, 30, 26, beige, 0, 15, -2));
    const arch = new THREE.Shape(); arch.moveTo(-3.4, 0); arch.lineTo(-3.4, 20); arch.lineTo(-1.6, 22.5); arch.lineTo(0, 24.5); arch.lineTo(1.6, 22.5); arch.lineTo(3.4, 20); arch.lineTo(3.4, 0); arch.closePath();
    const ag = new THREE.ExtrudeGeometry(arch, { depth: 0.4, bevelEnabled: false }); const am = mesh(ag, darkGlass); am.position.set(0, 4, 11.0); tw.add(am);
    tw.add(box(15, 1.2, 27, beige, 0, 30.4, -2));
  }
  // wings
  for (const s of [-1, 1]) { T.add(box(60, 11, 18, beige, s * 77, 5.5, -2)); const wg = mesh(new THREE.BoxGeometry(56, 6, 0.3), darkGlass); wg.position.set(s * 77, 6.5, 7.05); T.add(wg); }
  // long canopy / departure portico
  T.add(box(190, 1.4, 12, beige, 0, 9.2, 14)); T.add(box(190, 0.5, 12.5, mat('#bfae8a', 0.8), 0, 8.3, 14));
  for (let x = -90; x <= 90; x += 10) T.add(box(0.9, 8.3, 0.9, beige, x, 4.15, 19.4));
  // ground-floor glass + doors
  const gf = mesh(new THREE.BoxGeometry(150, 6.5, 0.3), new THREE.MeshPhysicalMaterial({ color: '#2b3540', roughness: 0.1, metalness: 0.5 })); gf.position.set(0, 3.25, 7.2); T.add(gf);
  for (let i = -3; i <= 3; i++) { const dr = box(3, 3, 0.1, new THREE.MeshPhysicalMaterial({ color: '#9fb7c7', roughness: 0.05, transparent: true, opacity: 0.5 }), i * 9, 1.5, 7.45); T.add(dr); }
  // flag pole + Pakistan flag on roof
  T.add(box(0.15, 8, 0.15, mat('#ccc', 0.3, 0.8), 0, 33, 4));
  const flag = mesh(new THREE.PlaneGeometry(3, 2, 12, 6), new THREE.MeshStandardMaterial({ map: pakFlag(), side: THREE.DoubleSide, roughness: 0.8 })); flag.position.set(1.55, 35.8, 4); T.add(flag);
  // forecourt: drop-off road (left-hand), palms, hedges
  road(scene, { length: 400, width: 10, z: -16, laneLines: [0] });
  kerb(scene, { length: 400, z: -21.1, h: 0.25, w: 0.2 }); kerb(scene, { length: 400, z: -10.9, h: 0.25, w: 0.2 });
  scene.add(box(400, 0.25, 11.6, new THREE.MeshStandardMaterial({ color: '#cfc8b8', roughness: 0.9, map: noiseTex('#cfc8b8', 16, 128, 66, [120, 4]) }), 0, 0.125, -27.0, { cast: false }));
  road(scene, { length: 600, width: 14, z: 6, laneLines: [-3.5, 0, 3.5] });
  const pal = []; for (let x = -150; x < 150; x += 14) pal.push([x, -9.5]);
  palms(scene, pal);
  for (let x = -150; x < 150; x += 3) { const h = mesh(new THREE.BoxGeometry(2.6, 0.9, 1.2), mat('#41662a', 1)); h.position.set(x, 0.45, -8.6); scene.add(h); }
  for (let x = -120; x < 120; x += 40) streetLight(scene, x, -10, 1, 9);
  return { T, flag };
}
function curtainTex() {
  return canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#272c34'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6b6252'; g.lineWidth = 3;
    for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }, { repeat: [3, 2] });
}
export function pakFlag() {
  return canvasTex(300, 200, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w * 0.25, h); g.fillStyle = '#01411c'; g.fillRect(w * 0.25, 0, w * 0.75, h);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(w * 0.62, h * 0.5, h * 0.3, 0, TAU); g.fill();
    g.fillStyle = '#01411c'; g.beginPath(); g.arc(w * 0.66, h * 0.44, h * 0.27, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.save(); g.translate(w * 0.72, h * 0.36); g.rotate(-0.6); g.beginPath();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU * 2 / 5; g.lineTo(Math.cos(a) * 18, Math.sin(a) * 18); } g.closePath(); g.fill(); g.restore();
  });
}
export function palms(scene, pos, seed = 9) {
  const r = rng(seed); const frondG = new THREE.ConeGeometry(0.35, 3.2, 4, 1); frondG.translate(0, 1.6, 0);
  const fm = new THREE.MeshStandardMaterial({ color: '#3f6a2a', roughness: 0.9, flatShading: true }); const tm = mat('#7a6648', 0.95);
  for (const [x, z] of pos) {
    const h = 6 + r() * 3; const tr = mesh(new THREE.CylinderGeometry(0.18, 0.28, h, 8), tm); tr.position.set(x, h / 2, z); scene.add(tr);
    for (let i = 0; i < 9; i++) { const f = mesh(frondG, fm); f.position.set(x, h, z); f.rotation.set(1.1 + r() * 0.5, (i / 9) * TAU + r() * 0.3, 0, 'YXZ'); f.scale.set(1, 1, 0.25); scene.add(f); }
  }
}

// ===================== CHECK-IN HALL (interior) =====================
export function buildCheckinHall(scene) {
  const floorT = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#e9e6df'; g.fillRect(0, 0, w, h); g.strokeStyle = '#cfcac0'; g.lineWidth = 2;
    for (let i = 0; i <= w; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }, { repeat: [30, 30] });
  const floor = mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshPhysicalMaterial({ map: floorT, roughness: 0.18, clearcoat: 0.6 }), { cast: false }); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const ceil = mesh(new THREE.PlaneGeometry(240, 240), mat('#f4f4f2', 0.9), { cast: false }); ceil.rotation.x = Math.PI / 2; ceil.position.y = 11; scene.add(ceil);
  // ceiling light grid
  const lightM = new THREE.MeshBasicMaterial({ color: '#fffdf4' });
  const lg = new THREE.InstancedMesh(new THREE.CircleGeometry(0.22, 12), lightM, 400); const o = new THREE.Object3D(); let k = 0;
  for (let x = -60; x < 60; x += 6) for (let z = -60; z < 40; z += 5) { o.position.set(x, 10.98, z); o.rotation.set(Math.PI / 2, 0, 0); o.updateMatrix(); if (k < 400) lg.setMatrixAt(k++, o.matrix); }
  lg.count = k; scene.add(lg);
  for (const x of [-30, -15, 0, 15, 30]) for (const z of [-25, 5]) scene.add(box(1.2, 11, 1.2, mat('#f0eee9', 0.5), x, 5.5, z));
  // back wall
  scene.add(box(240, 11, 0.5, mat('#e8e4dc', 0.8), 0, 5.5, -32));
  // check-in counters row (z = -8), queue barriers
  const counterM = mat('#f2f2f0', 0.35); const blue = mat('#1e4a8a', 0.5);
  const counters = [];
  for (let i = -5; i <= 5; i++) {
    const x = i * 3.2; const c = new THREE.Group(); c.position.set(x, 0, -8); scene.add(c);
    c.add(box(2.4, 1.05, 0.8, counterM, 0, 0.525, 0)); c.add(box(2.42, 0.06, 0.85, mat('#9aa', 0.3, 0.5), 0, 1.08, 0));
    c.add(box(2.4, 0.18, 0.02, blue, 0, 0.85, 0.41));
    const scr = box(0.5, 0.35, 0.05, mat('#111', 0.3), 0.6, 1.3, -0.2); scr.rotation.x = 0.2; c.add(scr);
    // bag scale/belt beside counter
    c.add(box(0.75, 0.32, 0.9, mat('#3a3d40', 0.5, 0.4), -1.6, 0.16, 0.0)); c.add(box(0.75, 0.04, 0.85, mat('#1a1a1a', 0.8), -1.6, 0.34, 0.0));
    // counter header sign (no fake names / numbers — sirf icon)
    const hs = box(2.4, 0.5, 0.08, blue, 0, 2.9, -0.3); c.add(hs);
    c.add(box(0.06, 1.8, 0.06, mat('#aaa', 0.3, 0.8), 0, 2.0, -0.3));
    c.add(box(2.4, 2.2, 0.2, mat('#d8d4cc', 0.6), 0, 1.6, -1.2));
    counters.push(c);
  }
  // stanchions
  const postM = mat('#c0c4c8', 0.2, 1); const beltM = mat('#1e4a8a', 0.6);
  for (let row = 0; row < 3; row++) for (let i = -6; i <= 6; i++) {
    const p = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 8), postM); p.position.set(i * 2.2, 0.475, -3 + row * 1.6); scene.add(p);
    const base = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12), postM); base.position.set(i * 2.2, 0.015, -3 + row * 1.6); scene.add(base);
    if (i < 6) scene.add(box(2.2, 0.05, 0.01, beltM, i * 2.2 + 1.1, 0.9, -3 + row * 1.6));
  }
  // big glass facade at front with daylight
  const facade = mesh(new THREE.PlaneGeometry(240, 11), new THREE.MeshBasicMaterial({ color: '#dfe9f2' }), { cast: false }); facade.position.set(0, 5.5, 40); facade.rotation.y = Math.PI; scene.add(facade);
  // lights
  const amb = new THREE.HemisphereLight('#ffffff', '#d8d2c4', 1.4); scene.add(amb);
  const key = new THREE.DirectionalLight('#fff6e8', 1.6); key.position.set(10, 30, 25); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 100 }); key.shadow.radius = 6; key.shadow.bias = -0.0005; scene.add(key);
  scene.background = new THREE.Color('#e9e7e2'); scene.fog = new THREE.Fog('#e9e7e2', 30, 120);
  return { counters };
}

// ===================== RUNWAY / AIRSIDE =====================
export function buildRunway(scene, { terrain = 'karachi' } = {}) {
  ground(scene, 8000, terrain === 'karachi' ? '#b09f7c' : '#6f8a4a', -0.02, 600);
  // runway along X, width 46, centre z=0
  const len = 3400;
  const rwT = canvasTex(1024, 256, (g, w, h) => {
    const r = rng(8); g.fillStyle = '#3d3e40'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 20000; i++) { const c = 50 + r() * 25; g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.fillStyle = '#e8e8e8'; for (let x = 0; x < w; x += 128) g.fillRect(x, h / 2 - 3, 64, 6); // centreline
    g.fillRect(0, 8, w, 5); g.fillRect(0, h - 13, w, 5);
    g.fillStyle = 'rgba(20,20,20,0.35)'; for (let i = 0; i < 40; i++) g.fillRect(r() * w, h / 2 - 30 + r() * 60, 60 + r() * 120, 6 + r() * 10); // tyre marks
  }, { repeat: [len / 120, 1] });
  const rw = mesh(new THREE.PlaneGeometry(len, 46), new THREE.MeshStandardMaterial({ map: rwT, roughness: 0.9 }), { cast: false }); rw.rotation.x = -Math.PI / 2; rw.position.set(len / 2 - 300, 0.01, 0); scene.add(rw);
  // threshold piano keys
  for (let i = -7; i <= 7; i++) { if (i === 0) continue; const k = mesh(new THREE.PlaneGeometry(30, 1.8), mat('#efefef', 0.8), { cast: false }); k.rotation.x = -Math.PI / 2; k.position.set(-270, 0.02, i * 2.9); scene.add(k); }
  // taxiway (parallel, z=-150) + yellow centreline, connectors
  const tw = mesh(new THREE.PlaneGeometry(len, 23), mat('#47484a', 0.95), { cast: false }); tw.rotation.x = -Math.PI / 2; tw.position.set(len / 2 - 300, 0.01, -150); scene.add(tw);
  const yl = mesh(new THREE.PlaneGeometry(len, 0.3), mat('#e6c229', 0.6), { cast: false }); yl.rotation.x = -Math.PI / 2; yl.position.set(len / 2 - 300, 0.02, -150); scene.add(yl);
  const conn = mesh(new THREE.PlaneGeometry(23, 150), mat('#47484a', 0.95), { cast: false }); conn.rotation.x = -Math.PI / 2; conn.position.set(-240, 0.012, -75); scene.add(conn);
  const yl2 = mesh(new THREE.PlaneGeometry(0.3, 150), mat('#e6c229', 0.6), { cast: false }); yl2.rotation.x = -Math.PI / 2; yl2.position.set(-240, 0.022, -75); scene.add(yl2);
  // edge lights
  const elG = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 6), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffffee', emissiveIntensity: 0.4 }), 400);
  const o = new THREE.Object3D(); let k = 0; for (let x = -300; x < len - 300 && k < 398; x += 60) for (const z of [-24, 24]) { o.position.set(x, 0.2, z); o.updateMatrix(); elG.setMatrixAt(k++, o.matrix); } elG.count = k; scene.add(elG);
  // terminal far side + hangars
  for (let i = 0; i < 5; i++) building(scene, -100 + i * 140, -320, 90, 40, 16 + (i % 2) * 8, 700 + i, { base: '#d9c9a6' });
  for (let i = 0; i < 4; i++) { const h = mesh(new THREE.CylinderGeometry(25, 25, 60, 16, 1, false, 0, Math.PI), mat('#c9cdd1', 0.5, 0.4)); h.rotation.z = Math.PI / 2; h.rotation.y = Math.PI / 2; h.position.set(700 + i * 80, 0, -260); scene.add(h); }
  // control tower
  const ct = new THREE.Group(); ct.position.set(300, 0, -260); scene.add(ct);
  ct.add(mesh(new THREE.CylinderGeometry(3, 4, 40, 12), mat('#e2dccd', 0.8))); ct.children[0].position.y = 20;
  const cab = mesh(new THREE.CylinderGeometry(7, 5.5, 6, 12), new THREE.MeshPhysicalMaterial({ color: '#2b3a48', roughness: 0.1, metalness: 0.5 })); cab.position.y = 43; ct.add(cab);
  ct.add(mesh(new THREE.CylinderGeometry(7.5, 7.5, 1, 12), mat('#ddd', 0.6))); ct.children[2].position.y = 46.5;
  // far scrub
  const sc = []; const r = rng(77); for (let i = 0; i < 160; i++) sc.push([-400 + r() * 3600, (r() < 0.5 ? -1 : 1) * (80 + r() * 400)]);
  trees(scene, sc, { seed: 81, scale: 0.8, palette: terrain === 'karachi' ? ['#6b7a3c', '#7a8445', '#5e6c35'] : ['#3e6b2b', '#4d7a32'] });
}

// ===================== CLOUD LAYER (cruise) =====================
export function buildClouds(scene, { y = -60, count = 900, spread = 4000, seed = 5, tint = '#ffffff' } = {}) {
  const tex = softSprite('#ffffff', 128);
  const m = new THREE.SpriteMaterial({ map: tex, color: tint, transparent: true, depthWrite: false, fog: true, opacity: 0.95 });
  const r = rng(seed); const g = new THREE.Group(); scene.add(g);
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(m); const sz = 60 + r() * 140; s.scale.set(sz * 1.6, sz * 0.8, 1);
    s.position.set((r() - 0.5) * spread, y + (r() - 0.5) * 30, (r() - 0.5) * spread); g.add(s);
  }
  // solid cloud floor beneath sprites
  const floor = mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshStandardMaterial({ color: '#f1f4f8', roughness: 1 }), { cast: false }); floor.rotation.x = -Math.PI / 2; floor.position.y = y - 25; scene.add(floor);
  return g;
}

// ===================== ISLAMABAD: avenue + Margalla Hills =====================
export function margallaHills(scene, { z0 = -900, width = 6000, seed = 3, height = 420, color = '#3f5f2e' } = {}) {
  const seg = 220; const geo = new THREE.PlaneGeometry(width, 1600, seg, 70); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position; const r = rng(seed); const ph = [r() * 10, r() * 10, r() * 10, r() * 10];
  const cols = []; const cA = new THREE.Color(color), cB = new THREE.Color('#6d7f45'), cC = new THREE.Color('#8a8a7a');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); const dz = (-z + 800) / 1600; // 0 at near edge → 1 far
    const ridge = Math.sin(x * 0.0021 + ph[0]) * 0.35 + Math.sin(x * 0.0057 + ph[1]) * 0.22 + Math.sin(x * 0.013 + ph[2]) * 0.1 + Math.sin(x * 0.031 + z * 0.02 + ph[3]) * 0.05;
    const prof = Math.pow(Math.min(1, dz * 1.8), 1.3);
    const hgt = height * prof * (0.75 + ridge) + (Math.sin(x * 0.07 + z * 0.05) * 6 + Math.sin(x * 0.17 - z * 0.13) * 3) * prof;
    pos.setY(i, Math.max(0, hgt));
    const c = cA.clone().lerp(cB, Math.max(0, Math.sin(x * 0.02 + z * 0.03) * 0.3)).lerp(cC, Math.max(0, (hgt / height - 0.85)) * 1.5);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const m = mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false }), { cast: false });
  m.position.set(0, 0, z0 - 800); scene.add(m); return m;
}

export function buildIslamabadAvenue(scene, R = scene, { hills = true } = {}) {
  ground(scene, 6000, '#86a85a', -0.02, 300);
  scene = R;
  road(scene, { length: 2000, width: 11, z: -8.5, laneLines: [-1.8, 1.8] }); // +X lanes LEFT side
  road(scene, { length: 2000, width: 11, z: 8.5, laneLines: [-1.8, 1.8] });
  scene.add(box(2000, 0.3, 6, mat('#5f8a3a', 1), 0, 0.15, 0, { cast: false }));
  kerb(scene, { length: 2000, z: -3.05, w: 0.15, h: 0.32 }); kerb(scene, { length: 2000, z: 3.05, w: 0.15, h: 0.32 });
  kerb(scene, { length: 2000, z: -14.1, w: 0.15, h: 0.25 }); kerb(scene, { length: 2000, z: 14.1, w: 0.15, h: 0.25 });
  const r = rng(91); const tp = []; for (let x = -1000; x < 1000; x += 6 + r() * 5) { tp.push([x, (r() - 0.5) * 3]); tp.push([x + 2, -17 - r() * 8]); tp.push([x + 3, 17 + r() * 8]); }
  trees(scene, tp, { seed: 92, scale: 1.1, palette: ['#3a6a27', '#4d7f30', '#2f5a22', '#5a8f36'] });
  for (let x = -1000; x < 1000; x += 42) streetLight(scene, x, 0, 1, 10, true);
}

// ===================== FAISAL MOSQUE =====================
// Reference: 8-facet tent-like prayer hall, 4 pencil minarets (~88 m), crescent finial, white marble courtyard.
export function buildFaisalMosque(scene, at = new THREE.Vector3(0, 0, 0), scale = 1) {
  const M = new THREE.Group(); M.position.copy(at); M.scale.setScalar(scale); scene.add(M);
  const white = new THREE.MeshPhysicalMaterial({ color: '#f4f3ef', roughness: 0.35, clearcoat: 0.3 });
  const ribbed = new THREE.MeshPhysicalMaterial({ color: '#f1efe9', roughness: 0.45, map: ribTex() });
  const marble = new THREE.MeshPhysicalMaterial({ color: '#efeee9', roughness: 0.15, clearcoat: 0.8 });
  // platform + courtyard
  M.add(box(190, 3, 150, marble, 0, 1.5, 10)); M.add(box(200, 0.6, 160, mat('#e6e3da', 0.5), 0, 0.3, 10));
  // tent hall: base square half-size a, corners low, mid-edge apex high
  const a = 31, hApex = 40, hCorner = 6, hTop = 36;
  const C = [[-a, hCorner, -a], [a, hCorner, -a], [a, hCorner, a], [-a, hCorner, a]].map(p => new THREE.Vector3(...p));
  const Mid = [[0, hApex, -a * 0.86], [a * 0.86, hApex, 0], [0, hApex, a * 0.86], [-a * 0.86, hApex, 0]].map(p => new THREE.Vector3(...p));
  const top = new THREE.Vector3(0, hTop, 0);
  const tri = (p1, p2, p3, m) => { const g = new THREE.BufferGeometry().setFromPoints([p1, p2, p3]); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2)); g.computeVertexNormals(); const me = mesh(g, m); me.material.side = THREE.DoubleSide; M.add(me); return me; };
  const ground0 = [[-a, 3, -a], [a, 3, -a], [a, 3, a], [-a, 3, a]].map(p => new THREE.Vector3(...p));
  for (let i = 0; i < 4; i++) {
    const c0 = C[i], c1 = C[(i + 1) % 4], m = Mid[i];
    const g0 = ground0[i], g1 = ground0[(i + 1) % 4];
    // big triangular facade (front face) — ribbed with recess
    tri(g0, g1, m, ribbed);
    // roof shells sloping to corners
    tri(m, c1, Mid[(i + 1) % 4], white); tri(m, Mid[(i + 1) % 4], top, white);
    // corner walls
    tri(g1, c1, m, white);
  }
  // facade dark glass inner triangle (front +Z)
  for (let i = 0; i < 4; i++) {
    const ang = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][i];
    const sh = new THREE.Shape(); sh.moveTo(-14, 0); sh.lineTo(14, 0); sh.lineTo(0, 26); sh.closePath();
    const gm = mesh(new THREE.ShapeGeometry(sh), new THREE.MeshPhysicalMaterial({ color: '#c9d2d8', roughness: 0.2, metalness: 0.3, map: lattice() }), { cast: false });
    const holder = new THREE.Group(); holder.rotation.y = ang; M.add(holder);
    gm.position.set(0, 3.1, a * 0.93); gm.rotation.x = -Math.atan2(a * 0.14, hApex); holder.add(gm);
    // entrance portico
    holder.add(box(26, 1.0, 8, white, 0, 9, a + 4)); for (let k = -3; k <= 3; k++) holder.add(box(0.8, 6, 0.8, white, k * 4, 6, a + 7.5));
  }
  // crescent finial at top
  const cres = mesh(new THREE.TorusGeometry(1.8, 0.25, 8, 24, Math.PI * 1.3), mat('#c9a646', 0.3, 0.9)); cres.position.set(0, hTop + 6, 0); cres.rotation.z = Math.PI * 0.85; M.add(cres);
  M.add(box(0.3, 4, 0.3, mat('#c9a646', 0.3, 0.9), 0, hTop + 2.2, 0));
  // roof shell edges (white beams) — tent ki tez lakeerein
  const beamM = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 0.5 });
  const beam = (a2, b2, r = 0.45) => { const d = b2.clone().sub(a2); const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), beamM); m.position.copy(a2).add(b2).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); M.add(m); };
  for (let i = 0; i < 4; i++) { beam(Mid[i], C[(i + 1) % 4]); beam(Mid[i], C[i]); beam(Mid[i], top, 0.35); beam(ground0[i], C[i], 0.6); }
  // minarets (4) — Turkish pencil style: podium, fluted shaft, do balconies, nukeela cone, sunehra finial
  const gold = mat('#c9a646', 0.3, 0.9);
  for (const [x, z] of [[-48, -48], [48, -48], [48, 48], [-48, 48]]) {
    const mn = new THREE.Group(); mn.position.set(x, 3, z); M.add(mn);
    const pod = mesh(new THREE.CylinderGeometry(4.2, 4.6, 6, 16), white); pod.position.y = 3; mn.add(pod);
    const shaft = mesh(new THREE.CylinderGeometry(2.0, 2.7, 64, 16), ribbed); shaft.position.y = 38; mn.add(shaft);
    for (const [yb, rb] of [[52, 3.2], [68, 2.9]]) { const bal = mesh(new THREE.CylinderGeometry(rb, rb - 0.8, 1.8, 16), white); bal.position.y = yb; mn.add(bal); const rail = mesh(new THREE.TorusGeometry(rb - 0.1, 0.12, 6, 24), white); rail.rotation.x = Math.PI / 2; rail.position.y = yb + 1.2; mn.add(rail); }
    const up = mesh(new THREE.CylinderGeometry(1.7, 2.0, 6, 16), ribbed); up.position.y = 72; mn.add(up);
    const cap = mesh(new THREE.ConeGeometry(2.0, 15, 16), white); cap.position.y = 82.5; mn.add(cap);
    const tip = mesh(new THREE.ConeGeometry(0.28, 3.2, 8), gold); tip.position.y = 91.5; mn.add(tip);
  }
  // sahn (courtyard) — saamne (south, +Z) portico + hauz (pool) + fountain
  const pool = mesh(new THREE.BoxGeometry(34, 0.3, 14), new THREE.MeshPhysicalMaterial({ color: '#4fa3c7', roughness: 0.05, clearcoat: 1, transmission: 0.0 })); pool.position.set(0, 3.15, 55); M.add(pool);
  M.add(box(36, 0.8, 16, marble, 0, 2.7, 55)); const fnt = mesh(new THREE.CylinderGeometry(1.2, 1.6, 1.4, 16), white); fnt.position.set(0, 3.8, 55); M.add(fnt);
  M.add(box(150, 1.2, 9, white, 0, 10.6, 83)); for (let k = -18; k <= 18; k++) M.add(box(0.8, 7, 0.8, white, k * 4, 6.5, 80));
  M.add(box(24, 14, 4, white, 0, 10, 86)); // main darwaza
  const arch = new THREE.Shape(); arch.moveTo(-5, 0); arch.lineTo(-5, 7); arch.lineTo(0, 11); arch.lineTo(5, 7); arch.lineTo(5, 0); arch.closePath();
  const ag = mesh(new THREE.ShapeGeometry(arch), mat('#6f8796', 0.3, 0.3), { cast: false }); ag.position.set(0, 3, 88.05); M.add(ag);
  // long arcade wings (front)
  for (const s of [-1, 1]) { M.add(box(10, 10, 100, white, s * 85, 8, 20)); for (let k = 0; k < 12; k++) M.add(box(0.7, 7, 0.7, white, s * 79.5, 6.5, -28 + k * 8.5)); }
  // planters (courtyard reference)
  for (let i = -3; i <= 3; i++) { M.add(box(5, 1.2, 5, white, i * 16, 3.6, 70)); const p = mesh(new THREE.IcosahedronGeometry(1.8, 1), new THREE.MeshStandardMaterial({ color: '#4c7a2e', flatShading: true })); p.position.set(i * 16, 5, 70); p.scale.y = 0.6; M.add(p); }
  M.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return M;
}
function ribTex() {
  return canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#f1efe9'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { g.fillStyle = '#d7d3c9'; g.fillRect(x, 0, 3, h); } }, { repeat: [3, 1] });
}
function lattice() {
  return canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#9fb0bb'; g.fillRect(0, 0, w, h); g.strokeStyle = '#eef0ee'; g.lineWidth = 3;
    for (let i = -w; i < w * 2; i += 20) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } }, { repeat: [4, 4] });
}

function blobGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 3); const p = g.attributes.position; const r = rng(seed + 99);
  const k = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.16 * Math.sin(x * 5 + k[0]) * Math.sin(y * 4 + k[1]) + 0.1 * Math.sin(z * 7 + k[2] + x * 3) + 0.06 * Math.sin((x + y + z) * 13);
    p.setXYZ(i, x * n, y * n, z * n); }
  g.computeVertexNormals(); return g;
}
function leafTex(c, seed) {
  const r = rng(seed); const base = new THREE.Color(c);
  return canvasTex(128, 128, (g, w, h) => { g.fillStyle = c; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const k = 0.6 + r() * 0.8; g.fillStyle = `rgb(${base.r * 255 * k | 0},${base.g * 255 * k | 0},${base.b * 255 * k | 0})`; g.beginPath(); g.ellipse(r() * w, r() * h, 2 + r() * 3, 1 + r() * 2, r() * 3, 0, 7); g.fill(); } });
}

// ===================== GATE LOUNGE + GLASS JET BRIDGE (Karachi) =====================
// Reference: glass-sided jet bridge (white frame, blue carpet), steel gate seating, big glass wall with aircraft outside.
// Aircraft origin par (nose +X). Port door (x=14, z=-1.98). Bridge floor = cabin floor height FL.
export function buildGateAndBridge(scene, FL = 2.25) {
  const white = mat('#f2f3f4', 0.45, 0.2), steel = mat('#b9bfc5', 0.35, 0.8);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#cfe0ea', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const carpetT = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#1f3f7a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2b4f92'; g.lineWidth = 6; for (let i = -w; i < w * 2; i += 28) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 40, h / 2); g.lineTo(i, h); g.stroke(); } }, { repeat: [2, 14] });
  const B = new THREE.Group(); scene.add(B);
  const X = 14, z0 = -3.4, z1 = -40, Wd = 2.6, Hh = 2.6; const L = z0 - z1, zc = (z0 + z1) / 2;
  // tunnel
  B.add(box(Wd, 0.12, L, mat('#d9dcdf', 0.6), X, FL - 0.06, zc));
  { const c = mesh(new THREE.PlaneGeometry(Wd - 0.1, L), new THREE.MeshStandardMaterial({ map: carpetT, roughness: 0.95 }), { cast: false }); c.rotation.x = -Math.PI / 2; c.position.set(X, FL + 0.005, zc); B.add(c); }
  B.add(box(Wd + 0.2, 0.25, L, white, X, FL + Hh, zc));
  for (const s of [-1, 1]) {
    const gl = mesh(new THREE.PlaneGeometry(L, Hh), glass, { cast: false }); gl.rotation.y = Math.PI / 2; gl.position.set(X + s * Wd / 2, FL + Hh / 2, zc); B.add(gl);
    B.add(box(0.1, 0.18, L, white, X + s * Wd / 2, FL + 0.09, zc));
    B.add(box(0.05, 0.05, L, steel, X + s * (Wd / 2 - 0.12), FL + 0.95, zc)); // handrail
    for (let z = z0; z >= z1; z -= 2.2) { const p = box(0.12, Hh, 0.12, white, X + s * Wd / 2, FL + Hh / 2, z); B.add(p); const d = box(0.07, 3.3, 0.07, white, X + s * Wd / 2, FL + Hh / 2, z - 1.1); d.rotation.x = s * 0.75; B.add(d); }
  }
  // ceiling lights inside
  for (let z = z0 - 1; z > z1; z -= 2.2) { const l = mesh(new THREE.PlaneGeometry(1.4, 0.3), new THREE.MeshBasicMaterial({ color: '#fffaf0' }), { cast: false }); l.rotation.x = Math.PI / 2; l.position.set(X, FL + Hh - 0.13, z); B.add(l); }
  // cab + bellows at aircraft door
  B.add(box(3.4, 3.0, 1.6, mat('#e6e8ea', 0.5), X, FL + 1.35, -2.6));
  for (let i = 0; i < 5; i++) B.add(box(3.0 - i * 0.05, 2.7, 0.08, mat('#2a2c2e', 0.9), X, FL + 1.3, -1.95 - i * 0.12));
  // drive leg + wheels
  B.add(box(0.35, FL, 0.35, steel, X, FL / 2, -16)); B.add(box(2.6, 0.4, 0.8, mat('#3b3f44', 0.6, 0.4), X, 0.6, -16));
  for (const s of [-1, 1]) { const w = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.35, 16), mat('#111', 0.9)); w.rotation.z = Math.PI / 2; w.position.set(X + s * 1.0, 0.4, -16); B.add(w); }
  // stairs (reference)
  for (let i = 0; i < 9; i++) B.add(box(0.9, 0.05, 0.3, mat('#d8b424', 0.6), X + 1.9, FL - 0.25 * i - 0.25, -6 - i * 0.28));
  // TERMINAL GATE LOUNGE (z < -40): floor at FL, glass wall at z=-40.2
  const lfloorT = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#e6e2da'; g.fillRect(0, 0, w, h); g.strokeStyle = '#cbc5ba'; g.lineWidth = 2; for (let i = 0; i <= w; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }, { repeat: [25, 6] });
  const T = new THREE.Group(); scene.add(T);
  T.add(box(200, FL, 30, mat('#d9d2c2', 0.8), X, FL / 2 - 0.01, -55));
  { const f = mesh(new THREE.PlaneGeometry(200, 30), new THREE.MeshPhysicalMaterial({ map: lfloorT, roughness: 0.2, clearcoat: 0.6 }), { cast: false }); f.rotation.x = -Math.PI / 2; f.position.set(X, FL + 0.01, -55); T.add(f); }
  T.add(box(200, 0.4, 30, mat('#f4f4f2', 0.8), X, FL + 8, -55));
  for (let x = -60; x <= 90; x += 4) { T.add(box(0.2, 8, 0.25, steel, x, FL + 4, -40.2)); }
  { const gw = mesh(new THREE.PlaneGeometry(200, 8), glass, { cast: false }); gw.position.set(X, FL + 4, -40.25); T.add(gw); }
  T.add(box(200, 8, 0.3, mat('#ebe8e2', 0.7), X, FL + 4, -70));
  for (let x = -40; x < 70; x += 12) for (let z = -44; z > -66; z -= 2.2) if (Math.abs(x - X) > 4) {
    const row = new THREE.Group(); row.position.set(x, FL, z); T.add(row);
    for (let k = 0; k < 6; k++) { row.add(box(0.5, 0.06, 0.48, steel, k * 0.55 - 1.4, 0.45, 0)); const bk = box(0.5, 0.45, 0.05, steel, k * 0.55 - 1.4, 0.7, -0.24); bk.rotation.x = -0.15; row.add(bk); }
    row.add(box(3.3, 0.06, 0.2, mat('#555', 0.5, 0.6), 0, 0.2, 0));
  }
  for (let x = -60; x < 90; x += 8) { const l = mesh(new THREE.CircleGeometry(0.25, 12), new THREE.MeshBasicMaterial({ color: '#fffbee' }), { cast: false }); l.rotation.x = Math.PI / 2; for (const z of [-46, -54, -62]) { const c = l.clone(); c.position.set(x, FL + 7.79, z); T.add(c); } }
  // gate sign (no number/name — sirf "Gate" + icon)
  const st = canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#123a75'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd34d'; g.font = 'bold 70px DejaVu Sans'; g.fillText('GATE  ✈', 30, 90); });
  const sg = mesh(new THREE.PlaneGeometry(3, 0.75), new THREE.MeshBasicMaterial({ map: st }), { cast: false }); sg.position.set(X, FL + 3.4, -40.6); sg.rotation.y = Math.PI; T.add(sg);
  const sg2 = sg.clone(); sg2.rotation.y = 0; sg2.position.z = -41.0; T.add(sg2);
  B.traverse(o => { if (o.isMesh && o.material !== glass) { o.castShadow = true; o.receiveShadow = true; } });
  T.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  return { X, FL, z1 };
}

// ===================== ISLAMABAD AIRPORT ARRIVAL HALL =====================
// Reference: white coffered ceiling with round downlight grid, white pillars, polished floor with dark inlay stripes, teal signage band.
export function buildArrivalHall(scene) {
  const floorT = canvasTex(1024, 1024, (g, w, h) => { g.fillStyle = '#eceae6'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8d4cd'; g.lineWidth = 2; for (let i = 0; i <= w; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
    g.fillStyle = '#6b6560'; for (let k = 0; k < 4; k++) g.fillRect(380 + k * 70, 300, 30, 420); }, { repeat: [12, 12] });
  const f = mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshPhysicalMaterial({ map: floorT, roughness: 0.12, clearcoat: 0.9 }), { cast: false }); f.rotation.x = -Math.PI / 2; scene.add(f);
  const ceil = mesh(new THREE.PlaneGeometry(200, 200), mat('#f6f6f4', 0.9), { cast: false }); ceil.rotation.x = Math.PI / 2; ceil.position.y = 9; scene.add(ceil);
  const lg = new THREE.InstancedMesh(new THREE.CircleGeometry(0.18, 12), new THREE.MeshBasicMaterial({ color: '#fffcf2' }), 1600); const o = new THREE.Object3D(); let k = 0;
  for (let x = -60; x < 60; x += 2.5) for (let z = -60; z < 40; z += 2.5) { o.position.set(x, 8.98, z); o.rotation.set(Math.PI / 2, 0, 0); o.updateMatrix(); if (k < 1600) lg.setMatrixAt(k++, o.matrix); }
  lg.count = k; scene.add(lg);
  for (const x of [-18, -6, 6, 18]) for (const z of [-30, -12, 6]) scene.add(box(1.4, 9, 1.4, mat('#f3f3f1', 0.4), x, 4.5, z));
  // teal signage band (Roman/English + Urdu, no brand names)
  const bandT = canvasTex(2048, 128, (g, w, h) => { g.fillStyle = '#0f6b6b'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.font = 'bold 64px DejaVu Sans'; g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillText('Welcome to Islamabad International Airport', 40, h / 2 + 2);
    g.textAlign = 'right'; g.direction = 'rtl'; g.fillText('خوش آمدید', w - 40, h / 2 + 2); });
  const band = mesh(new THREE.BoxGeometry(44, 1.6, 0.3), [mat('#0f6b6b'), mat('#0f6b6b'), mat('#0f6b6b'), mat('#0f6b6b'), new THREE.MeshBasicMaterial({ map: bandT }), mat('#0f6b6b')], { cast: false });
  band.position.set(0, 6.6, -14); scene.add(band);
  scene.add(box(200, 9, 0.4, mat('#e9e7e2', 0.7), 0, 4.5, -45));
  // benches + exit glass
  for (let x = -14; x <= 14; x += 7) for (const z of [-24, -20]) { const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g); for (let i = 0; i < 4; i++) g.add(box(0.5, 0.06, 0.5, mat('#9aa1a8', 0.35, 0.8), i * 0.55 - 0.8, 0.45, 0)); g.add(box(2.3, 0.45, 0.05, mat('#9aa1a8', 0.35, 0.8), 0, 0.7, -0.24)); }
  const exitG = mesh(new THREE.PlaneGeometry(200, 9), new THREE.MeshBasicMaterial({ color: '#e3eef5' }), { cast: false }); exitG.position.set(0, 4.5, 30); exitG.rotation.y = Math.PI; scene.add(exitG);
  scene.add(new THREE.HemisphereLight('#ffffff', '#dcd8d0', 1.5));
  const key = new THREE.DirectionalLight('#fff7ea', 1.4); key.position.set(-10, 30, 20); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 100 }); key.shadow.radius = 6; key.shadow.bias = -0.0005; scene.add(key);
  scene.background = new THREE.Color('#ecebe7'); scene.fog = new THREE.Fog('#ecebe7', 30, 110);
}

// ===================== ISLAMABAD GLASS TOWERS (reference skyline) =====================
export function islamabadTowers(scene, at) {
  const g = new THREE.Group(); g.position.copy(at); scene.add(g);
  const gl = new THREE.MeshPhysicalMaterial({ color: '#5d7f95', roughness: 0.12, metalness: 0.5, clearcoat: 1 });
  const bands = canvasTex(64, 512, (c, w, h) => { c.fillStyle = '#6f8fa3'; c.fillRect(0, 0, w, h); c.fillStyle = '#dfe6ea'; for (let y = 0; y < h; y += 16) c.fillRect(0, y, w, 3); }, { repeat: [10, 1] });
  const bm = new THREE.MeshPhysicalMaterial({ map: bands, roughness: 0.15, metalness: 0.4 });
  for (const [x, z, h, r] of [[0, 0, 120, 13], [34, 6, 110, 12], [-34, 6, 105, 12]]) {
    const t = mesh(new THREE.CylinderGeometry(r * 0.9, r, h, 6), bm); t.position.set(x, h / 2, z); g.add(t);
    const top = mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.9, 6, 6), gl); top.position.set(x, h + 3, z); g.add(top);
  }
  g.add(box(110, 22, 40, mat('#d9d6cf', 0.7), 0, 11, 10));
  // badi LED screen (bina brand/text — sirf gradient)
  const scr = canvasTex(256, 512, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d5fb8'); gr.addColorStop(1, '#58b7f0'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
  const s = mesh(new THREE.PlaneGeometry(14, 40), new THREE.MeshBasicMaterial({ map: scr }), { cast: false }); s.position.set(0, 70, 11.6); g.add(s);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
