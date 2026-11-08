// Vehicles: sab local +X ki taraf face karte hain. Pakistan = right-hand drive (driver seat +Z side).
import * as THREE from 'three';
import { mat, mesh, box, rbox, rng, canvasTex } from './util.js';
import { mergeChildren } from './optimize.js';

const glassMat = () => new THREE.MeshPhysicalMaterial({ color: '#0d1318', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.62, clearcoat: 1, envMapIntensity: 1.5, side: THREE.DoubleSide });

function profileExtrude(points, width, material, bevel = 0.05, holes = null) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.arc) shape.absarc(p.arc[0], p.arc[1], p.arc[2], 0, Math.PI, false);
    else shape.lineTo(p[0], p[1]);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8 });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  return mesh(geo, material);
}

export function createWheel(r = 0.39, w = 0.26, rimColor = '#1c1c1c', spokes = 6) {
  const g = new THREE.Group();
  const tyre = mesh(new THREE.TorusGeometry(r * 0.78, r * 0.24, 8, 18), mat('#141414', 0.92)); tyre.scale.z = w / (r * 0.48); g.add(tyre);
  const rim = mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w * 0.7, 14), mat(rimColor, 0.35, 0.7)); rim.rotation.x = Math.PI / 2; g.add(rim);
  const sm = mat('#2c2c2c', 0.4, 0.6);
  for (let i = 0; i < spokes; i++) {
    const s = box(r * 1.1, r * 0.12, 0.04, sm); s.rotation.z = (i / spokes) * Math.PI; s.position.z = w * 0.36; g.add(s);
    const s2 = s.clone(); s2.position.z = -w * 0.36; g.add(s2);
  }
  const hub = mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, w * 0.8, 12), mat('#888', 0.3, 0.9)); hub.rotation.x = Math.PI / 2; g.add(hub);
  mergeChildren(g);
  return g;
}

function addLights(g, front, rear, y, halfW, { headColor = '#f4f6ff', tailColor = '#c4100c' } = {}) {
  for (const s of [-1, 1]) {
    const h = rbox(0.06, 0.12, 0.34, 0.02, new THREE.MeshStandardMaterial({ color: headColor, emissive: '#fff8e8', emissiveIntensity: 0.25, roughness: 0.1 })); h.position.set(front, y, s * (halfW - 0.22)); g.add(h);
    const t = rbox(0.05, 0.22, 0.1, 0.02, new THREE.MeshStandardMaterial({ color: tailColor, emissive: '#5a0000', emissiveIntensity: 0.6, roughness: 0.2 })); t.position.set(rear, y + 0.05, s * (halfW - 0.08)); g.add(t);
  }
}

function seat(g, x, z, color = '#222') {
  const sm = mat(color, 0.9);
  g.add(box(0.5, 0.12, 0.5, sm, x, 0.75, z));
  const back = box(0.1, 0.62, 0.5, sm, x - 0.27, 1.05, z); back.rotation.z = -0.15; g.add(back);
  g.add(box(0.08, 0.16, 0.22, sm, x - 0.32, 1.42, z));
}

// TOYOTA REVO-style double cab (reference images se proportions): 5.33 x 1.855 x 1.815 m
export function createRevo(color = '#f2f3f1') {
  const g = new THREE.Group(); g.name = 'revo';
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.55 });
  const plastic = mat('#0c0c0c', 0.8); const chrome = mat('#c9ccd0', 0.15, 1);
  const W = 1.84, hw = W / 2, fa = 1.45, ra = -1.635, R = 0.39;
  const lower = profileExtrude([
    [2.66, 0.55], [fa + 0.49, 0.55], { arc: [fa, R, 0.49] }, [ra + 0.49, 0.55], { arc: [ra, R, 0.49] },
    [-2.66, 0.55], [-2.66, 0.86], [-0.82, 0.86], [-0.82, 1.13], [1.02, 1.16], [2.38, 1.11], [2.62, 1.0], [2.68, 0.78]
  ].map(p => p.arc ? p : p), W, paint, 0.06);
  g.add(lower);
  // bed side walls + tailgate
  for (const s of [-1, 1]) g.add(box(1.84, 0.27, 0.07, paint, -1.74, 0.995, s * (hw - 0.035)));
  g.add(box(0.06, 0.03, W - 0.1, plastic, -0.85, 1.12, 0));
  const bedFloor = box(1.8, 0.02, W - 0.16, mat('#1b1b1b', 0.95), -1.74, 0.87, 0); g.add(bedFloor);
  const tail = new THREE.Group(); tail.position.set(-2.64, 0.86, 0); g.add(tail);
  const tg = box(0.07, 0.29, W - 0.04, paint, 0, 0.145, 0); tail.add(tg);
  const tgh = box(0.02, 0.04, 0.22, plastic, -0.04, 0.24, 0); tail.add(tgh);
  // sport bar (Revo Rocco / reference style)
  const bar = new THREE.Group(); bar.position.set(-1.0, 1.13, 0); g.add(bar);
  for (const s of [-1, 1]) { const p = box(0.06, 0.32, 0.06, plastic, 0, 0.14, s * (hw - 0.1)); p.rotation.z = 0.2; bar.add(p); }
  bar.add(box(0.07, 0.06, W - 0.16, plastic, -0.03, 0.29, 0));
  // cabin (glass greenhouse) + roof
  const cab = profileExtrude([[-0.84, 1.13], [-0.74, 1.75], [0.32, 1.79], [1.06, 1.17]], W - 0.18, glassMat(), 0.03);
  g.add(cab);
  const roof = profileExtrude([[-0.76, 1.72], [-0.74, 1.81], [0.34, 1.83], [0.42, 1.74]], W - 0.14, paint, 0.03); g.add(roof);
  // pillars
  for (const s of [-1, 1]) {
    const a = box(0.06, 0.72, 0.05, paint, 0.72, 1.48, s * (hw - 0.115)); a.rotation.z = 0.78; g.add(a);
    g.add(box(0.1, 0.62, 0.05, plastic, 0.12, 1.45, s * (hw - 0.105)));
    const c = box(0.12, 0.62, 0.05, paint, -0.79, 1.44, s * (hw - 0.105)); c.rotation.z = -0.15; g.add(c);
    // door lines + handles + mirrors + side step + fender flares
    g.add(box(0.012, 0.52, 0.004, plastic, 0.12, 0.88, s * (hw + 0.002)));
    g.add(box(0.012, 0.5, 0.004, plastic, 1.0, 0.86, s * (hw + 0.002)));
    g.add(box(0.012, 0.5, 0.004, plastic, -0.8, 0.86, s * (hw + 0.002)));
    g.add(box(0.14, 0.03, 0.02, chrome, 0.75, 1.0, s * (hw + 0.01)));
    g.add(box(0.14, 0.03, 0.02, chrome, -0.2, 1.0, s * (hw + 0.01)));
    const mir = rbox(0.1, 0.12, 0.2, 0.03, paint); mir.position.set(0.9, 1.25, s * (hw + 0.12)); g.add(mir);
    g.add(box(1.9, 0.04, 0.16, mat('#2a2a2a', 0.6, 0.5), -0.1, 0.45, s * (hw + 0.06)));
    for (const ax of [fa, ra]) {
      const fl = mesh(new THREE.TorusGeometry(0.5, 0.045, 6, 18, Math.PI), plastic); fl.position.set(ax, R, s * (hw + 0.01)); fl.scale.z = 1.5; g.add(fl);
    }
  }
  // front: grille, bumper, headlights, plate
  g.add(box(0.06, 0.34, 1.1, mat('#0a0a0a', 0.5, 0.6), 2.66, 0.86, 0));
  for (let i = 0; i < 4; i++) g.add(box(0.07, 0.025, 1.0, mat('#222', 0.4, 0.8), 2.68, 0.74 + i * 0.075, 0));
  g.add(box(0.2, 0.22, W - 0.06, plastic, 2.6, 0.52, 0));
  g.add(box(0.16, 0.06, 1.0, mat('#555', 0.5, 0.4), 2.66, 0.42, 0));
  addLights(g, 2.6, -2.66, 0.98, hw);
  const plate = (x) => { const p = box(0.02, 0.11, 0.52, mat('#f3f3ee', 0.5), x, 0.6, 0); g.add(p); };
  plate(2.72); plate(-2.7);
  // rear bumper + step
  g.add(box(0.14, 0.14, W - 0.1, mat('#2b2b2b', 0.5, 0.6), -2.66, 0.5, 0));
  // under-body
  g.add(box(4.6, 0.25, W - 0.3, plastic, 0, 0.42, 0));
  // interior: seats + dashboard + steering (RIGHT side)
  const zDriver = 0.42, zPass = -0.42;
  g.add(box(0.4, 0.3, W - 0.3, mat('#151515', 0.8), 0.95, 1.05, 0));
  seat(g, 0.35, zDriver); seat(g, 0.35, zPass);
  g.add(box(0.5, 0.12, W - 0.4, mat('#222', 0.9), -0.5, 0.75, 0));
  g.add(box(0.1, 0.62, W - 0.4, mat('#222', 0.9), -0.78, 1.05, 0));
  const wheel = mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 24), mat('#111', 0.6)); wheel.position.set(0.78, 1.22, zDriver); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0; wheel.rotation.z = 0; wheel.rotateX(-0.45); g.add(wheel);
  // wheels
  const wheels = [];
  for (const ax of [fa, ra]) for (const s of [-1, 1]) {
    const w = createWheel(R, 0.27, '#202020'); w.position.set(ax, R, s * (hw - 0.14)); g.add(w); wheels.push(w);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  cab.castShadow = false;
  // HOOD (bonnet) — windshield ki taraf hinge; andar engine
  const eng = new THREE.Group(); g.add(eng);
  eng.add(box(0.7, 0.04, 1.2, mat('#2a2a2a', 0.5, 0.6), 1.75, 1.135, 0)); eng.add(box(0.25, 0.04, 0.2, mat('#1a1a1a', 0.5), 1.4, 1.155, 0.55));
  { const cap = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), mat('#c9a020', 0.4, 0.5)); cap.position.set(2.25, 1.13, -0.3); eng.add(cap); }
  const hoodPiv = new THREE.Group(); hoodPiv.position.set(1.06, 1.175, 0); g.add(hoodPiv);
  const hood = box(1.38, 0.035, W - 0.12, paint, 0.69, 0, 0); hood.rotation.z = -0.045; hoodPiv.add(hood);
  { const cl = new THREE.PointLight('#fff2e0', 1.6, 3.2, 1.5); cl.position.set(0.2, 1.6, 0); g.add(cl); } // cabin fill light (andar chehre nazar aayein)
  // DOORS (Pakistan RHD: driver RIGHT/+Z) — front hinge, bahar khulte hain
  const doors = {};
  const mkDoor = (name, side, xHinge, len) => {
    const piv = new THREE.Group(); piv.position.set(xHinge, 0, side * (hw + 0.012)); g.add(piv);
    const p1 = box(len, 0.52, 0.05, paint, -len / 2, 0.88, 0); piv.add(p1);
    const gl = box(len - 0.12, 0.5, 0.03, glassMat(), -len / 2 - 0.02, 1.4, -side * 0.06); gl.rotation.x = side * 0.08; piv.add(gl);
    const fr = box(len - 0.06, 0.04, 0.05, paint, -len / 2, 1.67, -side * 0.08); piv.add(fr);
    piv.add(box(0.14, 0.03, 0.025, chrome, -len + 0.25, 1.0, side * 0.03));
    const rec = box(len - 0.04, 0.95, 0.02, mat('#0b0b0b', 0.9), xHinge - len / 2, 1.1, side * (hw + 0.004)); g.add(rec); // khula darwaza → andar andhera
    doors[name] = { piv, side, rec };
  };
  mkDoor('FL', -1, 1.0, 0.88); mkDoor('FR', 1, 1.0, 0.88); mkDoor('RL', -1, 0.12, 0.92); mkDoor('RR', 1, 0.12, 0.92);
  mergeChildren(g, [...wheels, tail, hoodPiv, ...Object.values(doors).map(d => d.piv)]);
  const V = { group: g, wheels, tail, R, dist: 0, hoodPiv, doors, setDoor(n, o) { const d = doors[n]; d.piv.rotation.y = d.side * 1.05 * o; }, setHood(o) { hoodPiv.rotation.z = o * 0.95; }, seats: { driver: new THREE.Vector3(0.38, 0.62, zDriver), passenger: new THREE.Vector3(0.38, 0.62, zPass) },
    roll(d) { this.dist = d; for (const w of wheels) w.rotation.z = -d / R; },
    setTail(open) { tail.rotation.z = open * (Math.PI / 2); } // open=1 → neeche khula
  };
  return V;
}

// Generic Pakistani traffic: Alto/Mehran-type hatch, Corolla-type sedan, Hiace van, bus, rickshaw, bike
const CAR_COLORS = ['#f2f2f0', '#f2f2f0', '#e9e9e6', '#c0c3c7', '#9ea3a8', '#202224', '#7a1d1d', '#1f3b5c', '#c8b89a', '#f2f2f0'];
export function createCar(type = 'sedan', seed = 1) {
  const r = rng(seed); const g = new THREE.Group();
  const color = CAR_COLORS[Math.floor(r() * CAR_COLORS.length)];
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const gm = glassMat();
  let L, W, R, fa, ra, prof, cabP, wheels = [];
  if (type === 'hatch') { L = 3.4; W = 1.48; R = 0.28; fa = 1.08; ra = -1.12;
    prof = [[1.7, 0.36], [fa + 0.34, 0.36], { arc: [fa, R, 0.34] }, [ra + 0.34, 0.36], { arc: [ra, R, 0.34] }, [-1.7, 0.36], [-1.7, 0.86], [1.0, 0.86], [1.66, 0.76], [1.72, 0.55]];
    cabP = [[-1.68, 0.85], [-1.5, 1.42], [0.35, 1.45], [1.02, 0.86]];
  } else if (type === 'van') { L = 4.7; W = 1.7; R = 0.33; fa = 1.55; ra = -1.25;
    prof = [[2.35, 0.4], [fa + 0.38, 0.4], { arc: [fa, R, 0.38] }, [ra + 0.38, 0.4], { arc: [ra, R, 0.38] }, [-2.35, 0.4], [-2.35, 1.1], [2.0, 1.1], [2.35, 0.95], [2.38, 0.5]];
    cabP = [[-2.33, 1.08], [-2.3, 1.95], [1.7, 1.98], [2.1, 1.1]];
  } else if (type === 'bus') { L = 10.5; W = 2.45; R = 0.5; fa = 3.6; ra = -2.6;
    prof = [[5.25, 0.55], [fa + 0.56, 0.55], { arc: [fa, R, 0.56] }, [ra + 0.56, 0.55], { arc: [ra, R, 0.56] }, [-5.25, 0.55], [-5.25, 1.6], [5.25, 1.6]];
    cabP = [[-5.2, 1.58], [-5.2, 2.75], [5.1, 2.75], [5.25, 1.58]];
  } else { L = 4.5; W = 1.72; R = 0.31; fa = 1.33; ra = -1.3;
    prof = [[2.25, 0.4], [fa + 0.36, 0.4], { arc: [fa, R, 0.36] }, [ra + 0.36, 0.4], { arc: [ra, R, 0.36] }, [-2.25, 0.4], [-2.25, 0.92], [-1.4, 0.95], [0.9, 0.92], [2.2, 0.82], [2.27, 0.55]];
    cabP = [[-1.55, 0.94], [-0.85, 1.42], [0.2, 1.44], [1.05, 0.92]];
  }
  const busPaint = type === 'bus' ? new THREE.MeshStandardMaterial({ map: busTex(seed), roughness: 0.5 }) : paint;
  g.add(profileExtrude(prof, W, type === 'bus' ? busPaint : paint, 0.05));
  const cab = profileExtrude(cabP, W - 0.12, gm, 0.03); g.add(cab);
  const roofY = Math.max(...cabP.map(p => p[1]));
  const minX = Math.min(...cabP.map(p => p[0])), maxX = Math.max(...cabP.map(p => p[0]));
  const roofL = type === 'sedan' ? 1.05 : type === 'hatch' ? 1.85 : (maxX - minX) * 0.95;
  const roofX = type === 'sedan' ? -0.32 : type === 'hatch' ? -0.58 : (maxX + minX) / 2 - 0.1;
  { const _m = rbox(roofL, 0.06, W - 0.1, 0.025, type === 'bus' ? mat('#e8e8e8', 0.5) : paint); _m.position.set(roofX, roofY + 0.01, 0); g.add(_m); }
  for (const s of [-1, 1]) {
    for (const ax of [fa, ra]) { const w = createWheel(R, R * 0.6, '#9a9da1', 5); w.position.set(ax, R, s * (W / 2 - 0.1)); g.add(w); wheels.push(w); }
  }
  addLights(g, L / 2 - 0.04, -L / 2 + 0.02, type === 'bus' ? 0.9 : 0.72, W / 2);
  g.add(box(0.16, 0.18, W, mat('#2a2a2a', 0.6), L / 2 - 0.05, 0.42, 0));
  g.add(box(0.16, 0.18, W, mat('#2a2a2a', 0.6), -L / 2 + 0.05, 0.42, 0));
  g.add(box(L * 0.8, 0.2, W - 0.25, mat('#111', 0.9), 0, 0.33, 0));
  // driver silhouette (right side)
  const head = mesh(new THREE.SphereGeometry(0.11, 10, 8), mat('#2a1d16', 0.8)); head.position.set(type === 'bus' ? 4.6 : 0.0, (type === 'bus' ? 2.1 : roofY - 0.3), (W / 2) * 0.45); g.add(head);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  cab.castShadow = false;
  mergeChildren(g, wheels);
  return { group: g, wheels, R, L, roll(d) { for (const w of wheels) w.rotation.z = -d / R; } };
}

function busTex(seed) {
  const r = rng(seed); const cols = ['#d9262c', '#1f7a3a', '#f0b323', '#1d4fa0'];
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(0, 40 + i * 30, w, 12); }
    g.fillStyle = '#c9b46a'; for (let x = 0; x < w; x += 24) { g.beginPath(); g.arc(x + 12, 20, 9, 0, 7); g.fill(); }
  });
}

// Qingqi / auto rickshaw (3 wheels)
export function createRickshaw(seed = 1) {
  const r = rng(seed); const g = new THREE.Group();
  const col = ['#1f7a4a', '#2a5ea8', '#1f7a4a', '#d4a017'][Math.floor(r() * 4)];
  const paint = mat(col, 0.5, 0.2);
  const body = rbox(1.9, 0.5, 1.25, 0.12, paint); body.position.set(-0.2, 0.55, 0); g.add(body);
  const front = rbox(0.6, 0.65, 0.7, 0.15, paint); front.position.set(0.95, 0.65, 0); g.add(front);
  const canopy = rbox(1.8, 0.06, 1.3, 0.03, mat('#111', 0.8)); canopy.position.set(-0.15, 1.72, 0); g.add(canopy);
  for (const [x, z] of [[0.75, 0.6], [0.75, -0.6], [-1.05, 0.6], [-1.05, -0.6]]) g.add(box(0.04, 0.95, 0.04, mat('#222', 0.5, 0.6), x, 1.25, z));
  g.add(box(0.03, 0.5, 1.1, glassMat(), 0.88, 1.25, 0));
  const wheels = [];
  for (const [x, z] of [[1.0, 0], [-0.8, 0.55], [-0.8, -0.55]]) { const w = createWheel(0.22, 0.12, '#888', 4); w.position.set(x, 0.22, z); g.add(w); wheels.push(w); }
  const head = mesh(new THREE.SphereGeometry(0.11, 10, 8), mat('#2a1d16', 0.8)); head.position.set(0.55, 1.3, 0); g.add(head);
  const bodyD = mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.5, 10), mat('#d9d6cc', 0.9)); bodyD.position.set(0.55, 0.95, 0); g.add(bodyD);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  mergeChildren(g, wheels);
  return { group: g, wheels, R: 0.22, L: 2.6, roll(d) { for (const w of wheels) w.rotation.z = -d / 0.22; } };
}

// Motorbike (CD-70 type) + rider
export function createBike(seed = 1) {
  const r = rng(seed); const g = new THREE.Group();
  const col = ['#b01818', '#111', '#b01818', '#1c3f8f'][Math.floor(r() * 4)];
  const wheels = [];
  for (const x of [0.62, -0.62]) { const w = createWheel(0.3, 0.09, '#777', 3); w.position.set(x, 0.3, 0); g.add(w); wheels.push(w); }
  const tank = rbox(0.45, 0.2, 0.26, 0.08, mat(col, 0.35, 0.3)); tank.position.set(0.2, 0.82, 0); g.add(tank);
  g.add(box(0.55, 0.1, 0.26, mat('#111', 0.9), -0.3, 0.8, 0));
  g.add(box(1.0, 0.08, 0.1, mat('#333', 0.5, 0.6), 0, 0.5, 0));
  const fork = box(0.05, 0.7, 0.05, mat('#aaa', 0.3, 0.8), 0.52, 0.65, 0); fork.rotation.z = 0.35; g.add(fork);
  g.add(box(0.05, 0.05, 0.7, mat('#222', 0.4, 0.7), 0.4, 1.0, 0));
  { const _m = mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff8e0', emissiveIntensity: 0.3 })); _m.position.set(0.62, 0.95, 0); g.add(_m); }
  // rider (sitting)
  const shirt = ['#d9d6cc', '#5a6e8a', '#e8e4da', '#3c3c3c', '#8a6a4a'][Math.floor(r() * 5)];
  const torso = mesh(new THREE.CapsuleGeometry(0.17, 0.35, 4, 10), mat(shirt, 0.9)); torso.position.set(-0.25, 1.25, 0); torso.rotation.z = -0.2; g.add(torso);
  const head = mesh(new THREE.SphereGeometry(0.11, 12, 10), mat('#2a1d16', 0.8)); head.position.set(-0.16, 1.68, 0); g.add(head);
  if (r() < 0.5) { const helm = mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat('#222', 0.4)); helm.position.copy(head.position); g.add(helm); }
  for (const s of [-1, 1]) {
    const a = box(0.48, 0.08, 0.08, mat(shirt, 0.9), 0.08, 1.25, s * 0.2); a.rotation.z = -0.4; g.add(a);
    const th = box(0.45, 0.13, 0.13, mat('#2c2c2c', 0.9), -0.05, 0.92, s * 0.15); g.add(th);
    const sh = box(0.12, 0.45, 0.12, mat('#2c2c2c', 0.9), 0.15, 0.68, s * 0.17); sh.rotation.z = 0.1; g.add(sh);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  mergeChildren(g, wheels);
  return { group: g, wheels, R: 0.3, L: 1.9, roll(d) { for (const w of wheels) w.rotation.z = -d / 0.3; } };
}

// Traffic manager — LEFT-hand traffic. Road X axis par: +X heading lanes z<0 (left), −X heading lanes z>0.
// Har lane ki ek speed → same-lane vehicles kabhi overlap nahi karte. Window centre ke gird wrap hota hai.
export function createTraffic(scene, { lanes, window: win = 380, seed = 7 }) {
  const r = rng(seed); const items = [];
  for (const ln of lanes) {
    const n = ln.count; const gap = win / n;
    for (let i = 0; i < n; i++) {
      const kind = ln.kinds[Math.floor(r() * ln.kinds.length)];
      const v = kind === 'rickshaw' ? createRickshaw(seed * 100 + items.length) : kind === 'bike' ? createBike(seed * 100 + items.length) : createCar(kind, seed * 100 + items.length);
      v.group.rotation.y = ln.dir > 0 ? 0 : Math.PI; scene.add(v.group);
      items.push({ v, ln, off: i * gap + r() * Math.max(0, gap - 12), zj: (r() - 0.5) * (kind === 'bike' ? 0.6 : 0.25) });
    }
  }
  return {
    items,
    update(t, cx = 0) {
      for (const it of items) {
        const d = it.off + it.ln.speed * t * it.ln.dir; // signed travel
        let x = ((d - (cx - win / 2)) % win + win) % win + (cx - win / 2);
        it.v.group.position.set(x, 0, it.ln.z + it.zj);
        it.v.roll(Math.abs(it.ln.speed * t));
      }
    }
  };
}
