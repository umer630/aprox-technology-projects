// Procedural rigged 3D character (realistic adult proportions, ~7.3 heads tall).
// Character local +Z ki taraf dekhta hai. Uska LEFT = +X, RIGHT = -X.
import * as THREE from 'three';
import { mat, mesh, clamp, lerp, TAU, noiseTex } from './util.js';
import { mergeDirect } from './optimize.js';

function capsule(r, len, material, segs = 12) {
  const m = mesh(new THREE.CapsuleGeometry(r, len, 6, segs), material);
  return m;
}
// Limb jo joint se neeche (-Y) latakta hai
// Anatomical lathe: profile [[radius, y], ...] Y axis ke gird, x/z scale se oval cross-section
function lathe(profile, material, sx = 1, sz = 1, segs = 20) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y));
  const m = mesh(new THREE.LatheGeometry(pts, segs), material); m.scale.set(sx, 1, sz); return m;
}
// Limb jo joint se neeche latakta hai: tapered + muscle bulge (r1 upar, rMid beech, r2 neeche)
function limb(parent, r1, r2, len, material, bulge = 1.08, bulgeAt = 0.3) {
  const rm = (r1 * (1 - bulgeAt) + r2 * bulgeAt) * bulge;
  const prof = [[0, 0.02 * len], [r1 * 0.9, 0.01 * len], [r1, -0.04 * len], [rm, -bulgeAt * len], [(rm + r2) / 2, -0.7 * len], [r2, -0.98 * len], [r2 * 0.8, -1.03 * len], [0, -1.05 * len]];
  const m = lathe(prof, material, 1, 0.92, 16); parent.add(m);
  return m;
}

export const LOOKS = {
  // UMER — identity profile. Original photo is session mein attach nahi thi; yeh values
  // photo milte hi yahan adjust ho jati hain aur har shot mein same locked model use hota hai.
  umer: {
    height: 1.76, skin: '#b5774f', hair: '#1a1411', beard: '#3a2b21', beardStyle: 'trim',
    shirt: '#4a9a55', shirtStyle: 'hoodie', pants: '#34405a', shoes: '#ecebe6', sole: '#9a9a9a',
    kameez: false, cap: false, glasses: false, build: 1.0, eyes: '#2a1a10', cameraBag: false, backpack: '#1c1d20', inner: '#1f4a63'
  },
  driver: {
    name: 'Rashid Bhai', height: 1.71, skin: '#9c6644', hair: '#2a2420', beard: '#2a2420', beardStyle: 'moustache',
    shirt: '#d9d6cc', shirtStyle: 'kameez', pants: '#d9d6cc', shoes: '#3b2a1e', sole: '#2a1d14',
    kameez: true, cap: false, build: 1.05, eyes: '#24160d', grey: true
  },
  ammi: {
    height: 1.6, skin: '#b8805a', hair: '#1a1411', beard: null, beardStyle: 'none',
    shirt: '#c0567a', shirtStyle: 'kameez', pants: '#efe6d6', shoes: '#4a2a1a', sole: '#2a1a10',
    kameez: true, build: 0.9, eyes: '#24160d', dupatta: '#e9c46a', female: true
  },
  mechanic: {
    height: 1.72, skin: '#93603f', hair: '#1c1714', beard: '#1c1714', beardStyle: 'trim',
    shirt: '#8295a8', shirtStyle: 'kameez', pants: '#8295a8', shoes: '#2b2118', sole: '#1a120c',
    kameez: true, build: 1.0, eyes: '#24160d'
  },
  guard: {
    height: 1.78, skin: '#a06c4a', hair: '#141110', beard: '#141110', beardStyle: 'moustache',
    shirt: '#c9b98f', shirtStyle: 'shirt', pants: '#c9b98f', shoes: '#111', sole: '#111',
    kameez: false, build: 1.05, eyes: '#24160d', vest: '#3a4a2e', beret: '#2d3b22'
  },
  friend1: {
    height: 1.74, skin: '#b07650', hair: '#120f0d', beard: '#1a1411', beardStyle: 'trim',
    shirt: '#d9d4c7', shirtStyle: 'kameez', pants: '#d9d4c7', shoes: '#3a2a1e', sole: '#2a1d14', kameez: true, build: 1.0, eyes: '#24160d'
  },
  friend2: {
    height: 1.79, skin: '#a8714c', hair: '#18120f', beard: null, beardStyle: 'none',
    shirt: '#b04848', shirtStyle: 'polo', pants: '#3b4a63', shoes: '#ddd', sole: '#555', kameez: false, build: 1.05, eyes: '#24160d'
  },
  checkinAgent: { height: 1.74, skin: '#a8714c', hair: '#141110', beard: '#1a1411', beardStyle: 'trim', shirt: '#eef1f5', shirtStyle: 'shirt', pants: '#1b2230', shoes: '#111', sole: '#111', vest: '#1c2a4a', tie: '#2a6fd6', lanyard: '#1e4a8a', build: 1.0, eyes: '#24160d' },
  securityOfficer: { height: 1.78, skin: '#9c6644', hair: '#121010', beard: '#121010', beardStyle: 'moustache', shirt: '#9fc0e6', shirtStyle: 'shirt', pants: '#1e2a40', shoes: '#111', sole: '#111', peakCap: '#1e2a40', build: 1.08, eyes: '#24160d', epaulettes: 2 },
  entranceChecker: { height: 1.75, skin: '#a06c4a', hair: '#141110', beard: '#141110', beardStyle: 'moustache', shirt: '#9fc0e6', shirtStyle: 'shirt', pants: '#1e2a40', shoes: '#111', sole: '#111', beret: '#1e2a40', build: 1.02, eyes: '#24160d', epaulettes: 1 },
  baggageStaff: { height: 1.72, skin: '#93603f', hair: '#1c1714', beard: '#1c1714', beardStyle: 'trim', shirt: '#2d4f8a', shirtStyle: 'shirt', pants: '#1f2a3a', shoes: '#222', sole: '#111', vest: '#e8c21a', build: 1.05, eyes: '#24160d' },
  screeningStaff: { height: 1.62, skin: '#b8805a', hair: '#141110', beard: null, beardStyle: 'none', shirt: '#9fc0e6', shirtStyle: 'shirt', pants: '#1e2a40', shoes: '#111', sole: '#111', dupatta: '#1e2a40', female: true, build: 0.9, eyes: '#24160d' },
  loungeStaff: { height: 1.7, skin: '#a8714c', hair: '#141110', beard: null, beardStyle: 'none', shirt: '#f2f2f2', shirtStyle: 'shirt', pants: '#111', shoes: '#111', sole: '#111', vest: '#3a3a3a', tie: '#8a1c2c', build: 0.95, eyes: '#24160d' },
  gateAgent: { height: 1.64, skin: '#b5774f', hair: '#120e0c', beard: null, beardStyle: 'none', shirt: '#f2f4f8', shirtStyle: 'shirt', pants: '#14306f', shoes: '#111', sole: '#111', vest: '#14306f', scarf: '#2a6fd6', hairStyle: 'bun', female: true, build: 0.88, eyes: '#24160d', lanyard: '#14306f' },
  cabinCrewF: { height: 1.66, skin: '#bf8a62', hair: '#120e0c', beard: null, beardStyle: 'none', shirt: '#14306f', shirtStyle: 'shirt', pants: '#14306f', shoes: '#111', sole: '#111', scarf: '#6fb2ff', hairStyle: 'bun', female: true, kameez: true, build: 0.86, eyes: '#24160d' },
  cabinCrewM: { height: 1.77, skin: '#a8714c', hair: '#141110', beard: null, beardStyle: 'none', shirt: '#f2f4f8', shirtStyle: 'shirt', pants: '#14306f', shoes: '#111', sole: '#111', vest: '#14306f', tie: '#2a6fd6', build: 1.0, eyes: '#24160d' },
  pilot: { height: 1.8, skin: '#a8714c', hair: '#141110', beard: '#1a1411', beardStyle: 'trim', shirt: '#f6f6f6', shirtStyle: 'shirt', pants: '#1a1f2e', shoes: '#0a0a0a', sole: '#0a0a0a', tie: '#1a1f2e', epaulettes: 4, peakCap: '#1a1f2e', build: 1.02, eyes: '#24160d' },
  coPilot: { height: 1.76, skin: '#b5774f', hair: '#141110', beard: null, beardStyle: 'moustache', shirt: '#f6f6f6', shirtStyle: 'shirt', pants: '#1a1f2e', shoes: '#0a0a0a', sole: '#0a0a0a', tie: '#1a1f2e', epaulettes: 3, build: 1.0, eyes: '#24160d', glasses: 'sun' },
  passengerM: { height: 1.74, skin: '#a8714c', hair: '#141110', beard: '#1a1411', beardStyle: 'trim', shirt: '#8a7a5c', shirtStyle: 'shirt', pants: '#2b2b2b', shoes: '#3a2a1e', sole: '#2a1d14', build: 1.0, eyes: '#24160d', backpack: '#4a3a2a' },
  passengerF: { height: 1.6, skin: '#c08a64', hair: '#120e0c', beard: null, beardStyle: 'none', shirt: '#e78aa8', shirtStyle: 'kameez', pants: '#f3e6ea', shoes: '#c9a24a', sole: '#7a5a2a', kameez: true, dupatta: '#f2b6c8', female: true, build: 0.86, eyes: '#24160d' },
  youngPassenger: { height: 1.68, skin: '#b5774f', hair: '#141110', beard: null, beardStyle: 'none', shirt: '#5b3a8a', shirtStyle: 'hoodie', pants: '#3b4a63', shoes: '#ddd', sole: '#888', build: 0.92, eyes: '#24160d', backpack: '#2a6fd6' },
  businessTraveller: { height: 1.78, skin: '#a06c4a', hair: '#141110', beard: '#141110', beardStyle: 'trim', shirt: '#2a2f3a', shirtStyle: 'shirt', pants: '#2a2f3a', shoes: '#0a0a0a', sole: '#0a0a0a', tie: '#7a1d2c', build: 1.02, eyes: '#24160d', glasses: 'clear' },
  technician: { height: 1.74, skin: '#93603f', hair: '#1c1714', beard: '#1c1714', beardStyle: 'trim', shirt: '#24406e', shirtStyle: 'shirt', pants: '#24406e', shoes: '#222', sole: '#111', vest: '#ff8a1a', build: 1.05, eyes: '#24160d', beret: '#24406e' },
  hotelStaff: { height: 1.72, skin: '#a8714c', hair: '#141110', beard: null, beardStyle: 'moustache', shirt: '#f4f4f4', shirtStyle: 'shirt', pants: '#111', shoes: '#111', sole: '#111', vest: '#5a1a2a', tie: '#c9a24a', build: 0.98, eyes: '#24160d' },
  loungePassenger: { height: 1.71, skin: '#b07650', hair: '#141110', beard: '#141110', beardStyle: 'trim', shirt: '#ece7dc', shirtStyle: 'kameez', pants: '#ece7dc', shoes: '#3a2a1e', sole: '#2a1d14', kameez: true, build: 1.0, eyes: '#24160d', glasses: 'clear' },
  agent: {
    height: 1.70, skin: '#a87452', hair: '#0f0c0b', beard: null, beardStyle: 'none',
    shirt: '#e9edf2', shirtStyle: 'shirt', pants: '#1b2230', shoes: '#111', sole: '#111',
    kameez: false, build: 0.95, eyes: '#24160d', vest: '#1e4a8a'
  }
};

export function createCharacter(look = LOOKS.umer, seed = 1) {
  const L = look;
  const s = L.height / 1.76;
  const skinMat = new THREE.MeshPhysicalMaterial({ color: L.skin, roughness: 0.62, sheen: 0.4, sheenColor: new THREE.Color('#ffb59a'), sheenRoughness: 0.6, clearcoat: 0.05 });
  const hairMat = mat(L.hair, 0.85);
  const shirtMat = new THREE.MeshStandardMaterial({ color: L.shirt, roughness: 0.92, map: noiseTex(L.shirt, 14, 128, seed) });
  const pantMat = new THREE.MeshStandardMaterial({ color: L.pants, roughness: 0.9, map: noiseTex(L.pants, 20, 128, seed + 1) });
  const shoeMat = mat(L.shoes, 0.6); const soleMat = mat(L.sole, 0.8);

  const root = new THREE.Group(); root.name = 'character';
  const rig = new THREE.Group(); rig.scale.setScalar(s); root.add(rig);
  const J = {}; // joints
  const g = (name, parent, x, y, z) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent.add(o); J[name] = o; return o; };

  const hips = g('hips', rig, 0, 0.94, 0);
  const spine = g('spine', hips, 0, 0.06, 0);
  const chest = g('chest', spine, 0, 0.22, 0);
  const neck = g('neck', chest, 0, 0.25, 0.0);
  const head = g('head', neck, 0, 0.09, 0.01);

  // Torso
  const bw = L.build;
  const fem = !!L.female;
  const pelvis = lathe([[0, -0.13], [0.11, -0.12], [0.15, -0.07], [0.16, 0.0], [0.15, 0.06], [0.0, 0.07]], pantMat, (fem ? 1.12 : 1.05) * bw, 0.68); hips.add(pelvis);
  const abdomen = lathe([[0.145, -0.06], [0.14, 0.04], fem ? [0.125, 0.12] : [0.138, 0.12], [0.145, 0.2], [0.15, 0.24]], shirtMat, bw, 0.68); spine.add(abdomen);
  // chest: rib cage → pecs → trapezius → gardan
  const torso = lathe([[0.15, -0.05], [0.162, 0.03], fem ? [0.16, 0.09] : [0.17, 0.1], [0.172, 0.16], [0.15, 0.21], [0.1, 0.25], [0.06, 0.275], [0, 0.28]], shirtMat, (fem ? 0.92 : 1.0) * bw, 0.64, 24); chest.add(torso);
  const shoulders = mesh(new THREE.CapsuleGeometry(0.06, (fem ? 0.24 : 0.28) * bw, 6, 12), shirtMat); shoulders.rotation.z = Math.PI / 2; shoulders.position.y = 0.195; shoulders.scale.set(1, 0.85, 0.85); chest.add(shoulders);
  // kapron ki silwatein (seam lines) — flat look ko todne ke liye
  for (const sx of [-1, 1]) { const seam = mesh(new THREE.BoxGeometry(0.006, 0.2, 0.004), mat('#000000', 1, 0, { transparent: true, opacity: 0.18 })); seam.position.set(sx * 0.16 * bw, 0.06, 0.0); seam.rotation.y = sx * 1.4; chest.add(seam); }
  if (L.shirtStyle === 'polo') { // collar + placket
    const collar = mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 20, Math.PI * 1.4), shirtMat); collar.rotation.x = Math.PI / 2 + 0.25; collar.rotation.z = Math.PI * 0.8; collar.position.set(0, 0.255, 0.005); chest.add(collar);
    const plack = mesh(new THREE.BoxGeometry(0.03, 0.09, 0.01), mat('#16263a', 0.9)); plack.position.set(0, 0.2, 0.123); plack.rotation.x = -0.15; chest.add(plack);
  }
  if (L.vest) { // waistcoat: torso ke upar patla khol, saamne se V khula
    const vg = new THREE.LatheGeometry([[0.152, -0.06], [0.168, 0.03], [0.178, 0.12], [0.168, 0.19], [0.12, 0.23]].map(([r, y]) => new THREE.Vector2(r, y)), 24, Math.PI * 0.62, Math.PI * 1.76);
    const v = mesh(vg, new THREE.MeshStandardMaterial({ color: L.vest, roughness: 0.75, side: THREE.DoubleSide })); v.scale.set(1.03 * bw, 1, 0.68); chest.add(v);
    const vb = lathe([[0.152, -0.1], [0.152, 0.25]], mat(L.vest, 0.75), 1.03 * bw, 0.7); vb.visible = false; }
  if (L.shirtStyle === 'shirt') { // collar + buttons
    const col = mesh(new THREE.TorusGeometry(0.058, 0.012, 6, 18, Math.PI * 1.5), shirtMat); col.rotation.set(Math.PI / 2 + 0.3, 0, Math.PI * 0.75); col.position.set(0, 0.265, 0.01); chest.add(col);
    for (let i = 0; i < 4; i++) { const bt = mesh(new THREE.SphereGeometry(0.006, 6, 4), mat('#eeeeee', 0.4)); bt.position.set(0, 0.2 - i * 0.07, 0.112 + (i > 1 ? -0.004 : 0)); chest.add(bt); }
  }
  const neckM = capsule(0.052, 0.07, skinMat); neckM.position.y = 0.03; neck.add(neckM);

  // Kameez (lamba kurta) — hips se ghutno tak
  if (L.kameez) {
    const sk = mesh(new THREE.CylinderGeometry(0.17 * bw, 0.25 * bw, 0.55, 22, 1, true), shirtMat); sk.position.y = -0.2; sk.scale.z = 0.82; sk.material.side = THREE.DoubleSide; hips.add(sk);
    const collar = mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.04, 16, 1, true), shirtMat); collar.position.y = 0.26; chest.add(collar);
  }

  // HEAD — realistic adult proportion (~1/7.3 of height)
  const skull = lathe([[0, -0.012], [0.03, -0.008], fem ? [0.05, 0.012] : [0.056, 0.012], [0.068, 0.04], [0.074, 0.075], [0.08, 0.115], [0.085, 0.15], [0.083, 0.18], [0.07, 0.21], [0.045, 0.228], [0, 0.234]], skinMat, 0.9, 1.06, 32);
  skull.position.set(0, 0.0, 0.004); head.add(skull);
  const jaw = mesh(new THREE.SphereGeometry(0.03, 12, 8), skinMat); jaw.scale.set(1.3, 0.8, 0.9); jaw.position.set(0, 0.012, 0.055); head.add(jaw); // thoddi
  const backHead = mesh(new THREE.SphereGeometry(0.08, 20, 14), skinMat); backHead.scale.set(0.95, 1.0, 0.9); backHead.position.set(0, 0.14, -0.025); head.add(backHead);
  
  const face = new THREE.Group(); face.position.set(0, 0.1, 0.0); head.add(face);
  // eyes
  const eyeWhite = mat('#cfc4b8', 0.35); const iris = mat(L.eyes, 0.25); const lidMat = skinMat;
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(sx * 0.033, 0.012, 0.083); face.add(e);
    const ball = mesh(new THREE.SphereGeometry(0.0115, 16, 12), eyeWhite, { cast: false }); e.add(ball); e.position.z -= 0.003;
    const ir = mesh(new THREE.SphereGeometry(0.0084, 12, 10), iris, { cast: false }); ir.position.z = 0.0072; ir.scale.z = 0.5; e.add(ir);
    const pup = mesh(new THREE.SphereGeometry(0.0034, 10, 8), mat('#050403', 0.2), { cast: false }); pup.position.z = 0.0106; pup.scale.z = 0.4; e.add(pup);
    const lid = mesh(new THREE.SphereGeometry(0.0135, 16, 8, 0, TAU, 0, Math.PI * 0.42), lidMat, { cast: false }); lid.rotation.x = -0.25; e.add(lid);
    const brow = mesh(new THREE.BoxGeometry(0.03, 0.006, 0.01), hairMat, { cast: false }); brow.position.set(sx * 0.002, 0.021, 0.006); brow.rotation.z = -sx * 0.12; e.add(brow);
    eyes.push({ e, lid, brow });
    // ears
    const ear = mesh(new THREE.SphereGeometry(0.022, 12, 10), skinMat); ear.scale.set(0.45, 1.0, 0.75); ear.position.set(sx * 0.09, 0.0, -0.005); face.add(ear);
  }
  const nose = mesh(new THREE.ConeGeometry(0.014, 0.042, 12), skinMat); nose.position.set(0, -0.012, 0.096); nose.rotation.x = 0.35; face.add(nose);
  const noseTip = mesh(new THREE.SphereGeometry(0.0125, 12, 10), skinMat); noseTip.position.set(0, -0.03, 0.1); face.add(noseTip);
  const mouth = new THREE.Group(); mouth.position.set(0, -0.05, 0.086); face.add(mouth);
  const lips = mesh(new THREE.CapsuleGeometry(0.0055, 0.03, 4, 8), mat('#7b4636', 0.55), { cast: false }); lips.rotation.z = Math.PI / 2; mouth.add(lips);
  const mouthIn = mesh(new THREE.SphereGeometry(0.012, 12, 8), mat('#3a1712', 0.8), { cast: false }); mouthIn.scale.set(1.4, 0.05, 0.4); mouthIn.position.z = 0.0; mouth.add(mouthIn);

  // Hair (short natural crop, side part)
  const hairCap = mesh(new THREE.SphereGeometry(0.104, 28, 18, 0, TAU, 0, Math.PI * 0.52), hairMat); hairCap.scale.set(0.98, 1.2, 1.1); hairCap.position.set(0, 0.122, -0.008); hairCap.rotation.x = -0.12; head.add(hairCap);
  const hairBack = mesh(new THREE.SphereGeometry(0.1, 24, 16, Math.PI, Math.PI, Math.PI * 0.35, Math.PI * 0.3), hairMat); hairBack.scale.set(0.93, 1.12, 1.03); hairBack.position.set(0, 0.105, -0.004); head.add(hairBack);
  const quiff = mesh(new THREE.SphereGeometry(0.05, 16, 10), hairMat); quiff.scale.set(1.55, 0.32, 1.1); quiff.position.set(-0.008, 0.215, 0.05); quiff.rotation.set(-0.35, 0, 0.12); head.add(quiff);
  for (const sx of [-1, 1]) { const side = mesh(new THREE.SphereGeometry(0.05, 12, 10), hairMat); side.scale.set(0.35, 0.9, 1.25); side.position.set(sx * 0.085, 0.13, -0.02); head.add(side); }
  if (L.grey) { hairCap.material = mat('#4a4540', 0.85); }
  if (L.female) { quiff.visible = false; }
  if (L.dupatta) {
    const dm = new THREE.MeshStandardMaterial({ color: L.dupatta, roughness: 0.9, side: THREE.DoubleSide, map: noiseTex(L.dupatta, 16, 64, seed + 31) });
    // chehra khula: front (+Z) wala hissa nahi banaya
    const hood = mesh(new THREE.SphereGeometry(0.115, 26, 16, Math.PI * 0.8, Math.PI * 1.4, 0, Math.PI * 0.6), dm); hood.scale.set(0.95, 1.1, 1.05); hood.position.set(0, 0.11, -0.012); head.add(hood);
    const drape = mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.26, 22, 1, true, Math.PI * 0.35, Math.PI * 1.3), dm); drape.position.set(0, 0.17, -0.01); drape.scale.z = 0.75; chest.add(drape);
  }
  if (L.shirtStyle === 'hoodie') {
    const hood = mesh(new THREE.TorusGeometry(0.1, 0.045, 10, 20, Math.PI * 1.3), shirtMat); hood.rotation.set(Math.PI / 2 + 0.35, 0, Math.PI * 1.35); hood.position.set(0, 0.25, -0.03); chest.add(hood);
    const pocket = mesh(new THREE.BoxGeometry(0.2, 0.08, 0.006), mat('#2a6a35', 0.95)); pocket.position.set(0, 0.06, 0.103); spine.add(pocket);
    if (L.inner) { const tee = mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.06, 14), mat(L.inner, 0.9)); tee.position.set(0, 0.245, 0.04); chest.add(tee); }
    for (const sx of [-1, 1]) { const dc = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), mat('#e8e8e8', 0.6)); dc.position.set(sx * 0.03, 0.16, 0.122); chest.add(dc); }
  }
  if (L.tie) { const t = mesh(new THREE.BoxGeometry(0.035, 0.24, 0.01), mat(L.tie, 0.5)); t.position.set(0, 0.11, 0.126); t.rotation.x = -0.12; chest.add(t); const k = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), mat(L.tie, 0.5)); k.position.set(0, 0.235, 0.12); chest.add(k); }
  if (L.epaulettes) for (const sx of [-1, 1]) { const e = mesh(new THREE.BoxGeometry(0.1, 0.012, 0.05), mat('#111a2e', 0.5)); e.position.set(sx * 0.15, 0.275, 0); e.rotation.z = -sx * 0.25; chest.add(e); for (let i = 0; i < L.epaulettes; i++) { const st = mesh(new THREE.BoxGeometry(0.008, 0.014, 0.052), mat('#d9b84a', 0.3, 0.9)); st.position.set(sx * (0.12 + i * 0.016), 0.28 - i * 0.004, 0); chest.add(st); } }
  if (L.peakCap) { const cp = new THREE.Group(); cp.position.set(0, 0.2, 0.0); head.add(cp);
    const top = mesh(new THREE.CylinderGeometry(0.115, 0.1, 0.06, 20), mat(L.peakCap, 0.6)); cp.add(top); const band = mesh(new THREE.CylinderGeometry(0.102, 0.102, 0.03, 20), mat('#111', 0.5)); band.position.y = -0.03; cp.add(band);
    const peak = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 18, 1, false, -Math.PI / 2, Math.PI), mat('#0b0b0b', 0.3)); peak.position.set(0, -0.045, 0.05); peak.rotation.x = 0.2; cp.add(peak);
    const badge = mesh(new THREE.CircleGeometry(0.018, 12), mat('#d9b84a', 0.3, 0.9)); badge.position.set(0, -0.005, 0.111); cp.add(badge); }
  if (L.scarf) { const sc = mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16), mat(L.scarf, 0.7)); sc.rotation.x = Math.PI / 2; sc.position.set(0, 0.27, 0.0); chest.add(sc); const kn = mesh(new THREE.ConeGeometry(0.03, 0.07, 8), mat(L.scarf, 0.7)); kn.position.set(0.03, 0.22, 0.12); kn.rotation.z = 0.4; chest.add(kn); }
  if (L.lanyard) { const ly = mesh(new THREE.TorusGeometry(0.11, 0.004, 4, 20, Math.PI), mat(L.lanyard, 0.6)); ly.rotation.set(0, 0, Math.PI); ly.position.set(0, 0.25, 0.1); ly.scale.set(0.7, 1.4, 1); chest.add(ly); const card = mesh(new THREE.BoxGeometry(0.05, 0.07, 0.004), mat('#f4f4f4', 0.5)); card.position.set(0, 0.07, 0.13); chest.add(card); }
  if (L.hairStyle === 'long' && !L.dupatta) { hairCap.scale.set(1.0, 1.18, 1.1); const back = mesh(new THREE.CapsuleGeometry(0.075, 0.16, 6, 12), hairMat); back.position.set(0, 0.03, -0.06); back.scale.z = 0.6; head.add(back); quiff.visible = false; }
  if (L.hairStyle === 'bun' && !L.dupatta) { quiff.visible = false; const bun = mesh(new THREE.SphereGeometry(0.045, 14, 10), hairMat); bun.position.set(0, 0.16, -0.1); head.add(bun); }
  if (L.glasses) { for (const sx of [-1, 1]) { const g = mesh(new THREE.TorusGeometry(0.019, 0.003, 6, 16), mat(L.glasses === 'sun' ? '#111' : '#333', 0.3, 0.6)); g.position.set(sx * 0.033, 0.112, 0.097); head.add(g); if (L.glasses === 'sun') { const ln = mesh(new THREE.CircleGeometry(0.018, 14), mat('#0a0a0a', 0.1, 0.5)); ln.position.set(sx * 0.033, 0.112, 0.098); head.add(ln); } } const br = mesh(new THREE.BoxGeometry(0.03, 0.004, 0.004), mat('#222', 0.3)); br.position.set(0, 0.114, 0.1); head.add(br); }
  if (L.backpack) { const bp = new THREE.Group(); bp.position.set(0, 0.06, -0.17); chest.add(bp); J.backpack = bp;
    const body = mesh(new THREE.BoxGeometry(0.3, 0.42, 0.14), mat(L.backpack, 0.85)); bp.add(body); const pk = mesh(new THREE.BoxGeometry(0.24, 0.16, 0.05), mat(L.backpack, 0.85)); pk.position.set(0, -0.1, -0.09); bp.add(pk);
    for (const sx of [-1, 1]) { const st = mesh(new THREE.BoxGeometry(0.04, 0.4, 0.015), mat('#111', 0.8)); st.position.set(sx * 0.1, 0.0, 0.16); bp.add(st); const zp = mesh(new THREE.BoxGeometry(0.26, 0.008, 0.01), mat('#555', 0.4)); zp.position.set(0, 0.17 * sx, -0.072); bp.add(zp); } }
  if (L.beret) { const b = mesh(new THREE.CylinderGeometry(0.105, 0.11, 0.05, 18), mat(L.beret, 0.9)); b.position.set(0.01, 0.2, -0.005); b.rotation.z = -0.2; head.add(b); }

  // Beard / moustache
  const beardMat = new THREE.MeshStandardMaterial({ color: L.beard || '#000', roughness: 0.95, map: noiseTex(L.beard || '#000000', 40, 64, seed + 7) });
  if (L.beardStyle === 'trim') {
    const b = mesh(new THREE.SphereGeometry(0.0825, 26, 14, 0, Math.PI, Math.PI * 0.56, Math.PI * 0.4), beardMat, { cast: false });
    b.scale.set(0.98, 0.92, 1.0); b.position.set(0, 0.05, 0.017); head.add(b);
    for (const sx of [-1, 1]) { const sb = mesh(new THREE.SphereGeometry(0.03, 10, 8), beardMat, { cast: false }); sb.scale.set(0.4, 1.3, 0.9); sb.position.set(sx * 0.074, 0.075, 0.03); head.add(sb); }
    const m = mesh(new THREE.CapsuleGeometry(0.006, 0.034, 4, 8), beardMat, { cast: false }); m.rotation.z = Math.PI / 2; m.position.set(0, -0.039, 0.092); face.add(m);
    mouth.position.z = 0.09;
  } else if (L.beardStyle === 'moustache') {
    const m = mesh(new THREE.CapsuleGeometry(0.008, 0.04, 4, 8), beardMat, { cast: false }); m.rotation.z = Math.PI / 2; m.position.set(0, -0.039, 0.092); face.add(m);
  }

  // ARMS
  const arm = (side) => {
    const sx = side === 'L' ? 1 : -1;
    const sh = g('shoulder' + side, chest, sx * 0.19 * bw, 0.2, 0);
    const up = g('upperArm' + side, sh, 0, 0, 0);
    limb(up, 0.05, 0.042, 0.29, L.shirtStyle === 'kameez' || L.shirtStyle === 'shirt' ? shirtMat : shirtMat);
    const sleeveEnd = L.shirtStyle === 'polo' ? 0.16 : 0.29;
    const elbow = g('elbow' + side, up, 0, -0.29, 0);
    const fore = g('forearm' + side, elbow, 0, 0, 0);
    limb(fore, 0.04, 0.032, 0.25, (L.shirtStyle === 'polo') ? skinMat : shirtMat);
    if (L.shirtStyle === 'polo') { // short sleeve → bare forearm, upper arm partly skin
      const bare = mesh(new THREE.CylinderGeometry(0.043, 0.044, 0.29 - sleeveEnd, 12), skinMat); bare.position.y = -sleeveEnd - (0.29 - sleeveEnd) / 2; up.add(bare);
      const cuff = mesh(new THREE.CylinderGeometry(0.052, 0.054, 0.02, 14), shirtMat); cuff.position.y = -sleeveEnd + 0.01; up.add(cuff);
    } else {
      const cuff = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 12), skinMat); cuff.position.y = -0.24; fore.add(cuff);
    }
    const wrist = g('wrist' + side, fore, 0, -0.25, 0);
    const hand = g('hand' + side, wrist, 0, 0, 0);
    // palm: thumb +Z ki taraf (neutral pose mein thumb aage), palm faces inward
    const palm = mesh(new THREE.BoxGeometry(0.028, 0.085, 0.075), skinMat); palm.position.set(0, -0.045, 0.004); hand.add(palm);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const f0 = new THREE.Group(); f0.position.set(0, -0.088, 0.03 - i * 0.019); hand.add(f0);
      const lens = [0.042, 0.048, 0.045, 0.036][i];
      const p1 = mesh(new THREE.CapsuleGeometry(0.0085, lens * 0.5, 3, 8), skinMat); p1.position.y = -lens * 0.27; f0.add(p1);
      const f1 = new THREE.Group(); f1.position.y = -lens * 0.55; f0.add(f1);
      const p2 = mesh(new THREE.CapsuleGeometry(0.0078, lens * 0.4, 3, 8), skinMat); p2.position.y = -lens * 0.22; f1.add(p2);
      fingers.push([f0, f1]);
    }
    const t0 = new THREE.Group(); t0.position.set(-sx * 0.006, -0.03, 0.04); hand.add(t0);
    const tp = mesh(new THREE.CapsuleGeometry(0.0095, 0.03, 3, 8), skinMat); tp.position.y = -0.022; t0.add(tp);
    t0.rotation.x = 0.6; t0.rotation.z = sx * 0.3;
    J['fingers' + side] = fingers; J['thumb' + side] = t0;
    return { sh, up, elbow, fore, wrist, hand };
  };
  arm('L'); arm('R');

  // LEGS
  const leg = (side) => {
    const sx = side === 'L' ? 1 : -1;
    const th = g('thigh' + side, hips, sx * 0.095, -0.03, 0);
    limb(th, L.kameez ? 0.085 : 0.075, L.kameez ? 0.07 : 0.058, 0.44, pantMat);
    const knee = g('knee' + side, th, 0, -0.44, 0);
    limb(knee, L.kameez ? 0.07 : 0.056, 0.045, 0.42, pantMat);
    const ankle = g('ankle' + side, knee, 0, -0.42, 0);
    const shoe = mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 12), shoeMat); shoe.rotation.x = Math.PI / 2; shoe.scale.set(1, 1, 0.75); shoe.position.set(0, -0.04, 0.06); ankle.add(shoe);
    const sole = mesh(new THREE.BoxGeometry(0.09, 0.022, 0.25), soleMat); sole.position.set(0, -0.067, 0.06); ankle.add(sole);
  };
  leg('L'); leg('R');

  // CAMERA BAG (reference: tan waxed-canvas sling, leather strap, brass buckle) — left kandhe se right hip tak
  if (L.cameraBag) {
    const canvasM = new THREE.MeshStandardMaterial({ color: '#a8895a', roughness: 0.95, map: noiseTex('#a8895a', 26, 128, seed + 21) });
    const leather = mat('#7a4a24', 0.6); const brass = mat('#c9a24a', 0.3, 0.9);
    const a = new THREE.Vector2(0.15, 0.23), b = new THREE.Vector2(-0.2, -0.3);
    const len = a.distanceTo(b), ang = Math.atan2(b.y - a.y, b.x - a.x);
    J.camStraps = []; for (const z of [0.128, -0.128]) { const st = mesh(new THREE.BoxGeometry(len, 0.04, 0.008), mat('#5a4630', 0.9)); st.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.06, z); st.rotation.z = ang; chest.add(st); J.camStraps.push(st); }
    const cb = new THREE.Group(); cb.position.set(-0.25, -0.06, 0.03); hips.add(cb); J.camBag = cb;
    cb.add(mesh(new THREE.BoxGeometry(0.1, 0.17, 0.25), canvasM));
    const flap = mesh(new THREE.BoxGeometry(0.106, 0.11, 0.255), mat('#9a7c4e', 0.95)); flap.position.y = 0.035; cb.add(flap);
    const tab = mesh(new THREE.BoxGeometry(0.11, 0.08, 0.04), leather); tab.position.y = -0.01; cb.add(tab);
    const buckle = mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12), brass); buckle.rotation.y = Math.PI / 2; buckle.position.set(-0.058, -0.02, 0); cb.add(buckle);
  }

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  const skip = new Set(J.camStraps || []);
  for (const k of Object.keys(J)) if (J[k] && J[k].isObject3D) mergeDirect(J[k], skip);
  for (const f of [...J.fingersL, ...J.fingersR]) { mergeDirect(f[0]); mergeDirect(f[1]); }
  mergeDirect(face, skip);

  const C = {
    root, rig, J, eyes, mouth, look: L,
    walkPhase: 0, talk: 0, blink: 0, held: null,
    setNeutral() {
      for (const k of Object.keys(J)) { const j = J[k]; if (j.isObject3D && k !== 'camBag') j.rotation.set(0, 0, 0); }
      this.rig.rotation.set(0, 0, 0); this.rig.position.set(0, 0, 0);
      J.hips.position.y = 0.94; J.hips.position.z = 0;
      J.upperArmL.rotation.z = 0.08; J.upperArmR.rotation.z = -0.08;
      J.forearmL.rotation.x = -0.15; J.forearmR.rotation.x = -0.15;
      setGrip(this, 'L', 0.25); setGrip(this, 'R', 0.25);
    }
  };
  C.setNeutral();
  return C;
}

export function setGrip(C, side, amt) {
  // palm andar ki taraf (L: -X, R: +X) — fingers usi taraf curl hoti hain
  const sx = side === 'L' ? -1 : 1;
  for (const [f0, f1] of C.J['fingers' + side]) { f0.rotation.x = 0; f0.rotation.z = sx * amt * 1.25; f1.rotation.z = sx * amt * 1.5; }
  C.J['thumb' + side].rotation.z = sx * (0.3 + amt * 0.6);
}

// ---- Poses / animation layers ----
// Walk cycle: stride ~0.66 m/step. Speed = 4*L*sin(A)*f  →  feet slide nahi karte.
export const WALK = { A: 0.36, f: 0.92, legLen: 0.86 };
export function walkSpeed(C) { const s = C.look.height / 1.76; return 4 * WALK.legLen * s * Math.sin(WALK.A) * WALK.f; }

export function poseWalk(C, phase, amt = 1) {
  const J = C.J; const p = phase * TAU; const A = WALK.A * amt;
  const sL = Math.sin(p), cL = Math.cos(p);
  J.thighL.rotation.x = -A * sL; J.thighR.rotation.x = A * sL;
  // knee flex during swing (thigh forward moving)
  J.kneeL.rotation.x = amt * (0.08 + 0.75 * Math.max(0, cL) ** 1.5 + 0.1 * Math.max(0, -sL));
  J.kneeR.rotation.x = amt * (0.08 + 0.75 * Math.max(0, -cL) ** 1.5 + 0.1 * Math.max(0, sL));
  J.ankleL.rotation.x = -J.thighL.rotation.x * 0.3 - J.kneeL.rotation.x * 0.45;
  J.ankleR.rotation.x = -J.thighR.rotation.x * 0.3 - J.kneeR.rotation.x * 0.45;
  J.hips.position.y = 0.94 - amt * (0.025 * (1 - Math.abs(Math.cos(p))) + 0.008);
  J.hips.rotation.y = amt * 0.07 * sL; J.chest.rotation.y = -amt * 0.1 * sL;
  J.hips.rotation.z = amt * 0.03 * Math.cos(p * 2);
  J.spine.rotation.x = amt * 0.04;
  J.upperArmL.rotation.x = amt * 0.32 * sL; J.upperArmR.rotation.x = -amt * 0.32 * sL;
  J.forearmL.rotation.x = -0.25 - amt * 0.18 * Math.max(0, -sL);
  J.forearmR.rotation.x = -0.25 - amt * 0.18 * Math.max(0, sL);
  J.head.rotation.y = -J.chest.rotation.y * 0.6;
}

export function poseIdle(C, t) {
  const J = C.J;
  J.thighL.rotation.x = 0; J.thighR.rotation.x = 0; J.kneeL.rotation.x = 0.04; J.kneeR.rotation.x = 0.04;
  J.ankleL.rotation.x = -0.02; J.ankleR.rotation.x = -0.02;
  J.thighL.rotation.z = 0.04; J.thighR.rotation.z = -0.04;
  J.hips.position.y = 0.94 - 0.004 * Math.sin(t * 1.3);
  J.chest.rotation.x = 0.012 * Math.sin(t * 1.6); // breathing
  J.spine.rotation.x = 0; J.hips.rotation.set(0, 0, 0); J.chest.rotation.y = 0;
}

// Right hand mein vlog camera pakadna (carry): elbow bent, camera aage
export function poseCarryCam(C, w = 1) {
  const J = C.J;
  J.upperArmR.rotation.x = lerp(J.upperArmR.rotation.x, -0.25, w);
  J.upperArmR.rotation.z = lerp(J.upperArmR.rotation.z, -0.12, w);
  J.forearmR.rotation.x = lerp(J.forearmR.rotation.x, -1.15, w);
  J.forearmR.rotation.y = lerp(J.forearmR.rotation.y, 0.25, w);
  J.wristR.rotation.y = lerp(J.wristR.rotation.y, -0.3, w);
  setGrip(C, 'R', 0.85);
}
// Selfie: right arm aage-upar, camera face ki taraf
export function poseSelfie(C, w = 1, wobble = 0) {
  const J = C.J;
  J.upperArmR.rotation.x = lerp(J.upperArmR.rotation.x, -1.32 + wobble * 0.03, w);
  J.upperArmR.rotation.z = lerp(J.upperArmR.rotation.z, 0.32, w);
  J.upperArmR.rotation.y = lerp(J.upperArmR.rotation.y, 0, w);
  J.forearmR.rotation.x = lerp(J.forearmR.rotation.x, -0.5, w);
  J.forearmR.rotation.y = lerp(J.forearmR.rotation.y, 0, w);
  J.wristR.rotation.y = lerp(J.wristR.rotation.y, 0, w);
  setGrip(C, 'R', 0.85);
}
// Left hand se suitcase handle pakadna (arm thoda peeche-side)
export function posePullBag(C, w = 1) {
  const J = C.J;
  J.upperArmL.rotation.x = lerp(J.upperArmL.rotation.x, 0.28, w);
  J.upperArmL.rotation.z = lerp(J.upperArmL.rotation.z, 0.2, w);
  J.forearmL.rotation.x = lerp(J.forearmL.rotation.x, -0.1, w);
  setGrip(C, 'L', 0.9);
}
export function poseWave(C, t, side = 'R', w = 1) {
  const J = C.J;
  J['upperArm' + side].rotation.x = lerp(J['upperArm' + side].rotation.x, -0.3, w);
  J['upperArm' + side].rotation.z = lerp(J['upperArm' + side].rotation.z, (side === 'R' ? -1 : 1) * 2.2, w);
  J['forearm' + side].rotation.x = lerp(J['forearm' + side].rotation.x, 0, w);
  J['forearm' + side].rotation.z = lerp(J['forearm' + side].rotation.z, (side === 'R' ? -1 : 1) * 0.35 * Math.sin(t * 9), w);
  setGrip(C, side, 0.1);
}
// Hand on heart greeting (Assalam o Alaikum)
export function poseSalaam(C, w = 1, side = 'R') {
  const J = C.J; const sx = side === 'R' ? 1 : -1;
  J['upperArm' + side].rotation.x = lerp(J['upperArm' + side].rotation.x, -0.5, w);
  J['upperArm' + side].rotation.z = lerp(J['upperArm' + side].rotation.z, sx * 0.1, w);
  J['forearm' + side].rotation.x = lerp(J['forearm' + side].rotation.x, 0.85, w);
  J['forearm' + side].rotation.z = lerp(J['forearm' + side].rotation.z, sx * 2.0, w);
  J.head.rotation.x = lerp(J.head.rotation.x, 0.15, w);
  J.spine.rotation.x = lerp(J.spine.rotation.x, 0.08, w);
}
export function poseSit(C, w = 1) {
  const J = C.J;
  for (const s of ['L', 'R']) {
    J['thigh' + s].rotation.x = lerp(J['thigh' + s].rotation.x, -1.5, w);
    J['knee' + s].rotation.x = lerp(J['knee' + s].rotation.x, 1.45, w);
  }
  J.hips.position.y = lerp(J.hips.position.y, 0.48, w);
}
export function poseReach(C, side, x, w = 1) { // dono haath aage (counter / bag)
  const J = C.J;
  J['upperArm' + side].rotation.x = lerp(J['upperArm' + side].rotation.x, -x, w);
  J['forearm' + side].rotation.x = lerp(J['forearm' + side].rotation.x, -0.35, w);
  J['upperArm' + side].rotation.z = lerp(J['upperArm' + side].rotation.z, side === 'L' ? -0.05 : 0.05, w);
}

export function faceUpdate(C, t, talking = 0) {
  // blink every ~3.7s
  const bt = (t + C.root.id * 0.37) % 3.7; const blink = bt < 0.12 ? Math.sin(bt / 0.12 * Math.PI) : 0;
  for (const e of C.eyes) e.lid.rotation.x = -0.25 + blink * 1.3;
  const open = talking ? clamp(0.5 + 0.5 * Math.sin(t * 17) * Math.sin(t * 5.3 + 1), 0, 1) * talking : 0;
  C.mouth.children[1].scale.y = 0.05 + open * 0.55;
  C.mouth.children[0].position.y = -open * 0.002;
}

// World-space helper: kisi joint ki world position
const _v = new THREE.Vector3();
export function jointWorld(C, name, out = new THREE.Vector3()) { C.root.updateMatrixWorld(true); return C.J[name].getWorldPosition(out); }

// ---- extra actions ----
// Bistar par letna: root ko X axis par ghuma do (pith neeche, chehra upar)
export function poseLie(C, w = 1) { C.rig.rotation.x = -Math.PI / 2 * w; C.rig.position.y = 0; }
// Daant brush: right haath munh ke paas, chhoti si oscillation
export function poseBrush(C, t, w = 1) {
  const J = C.J;
  J.upperArmR.rotation.x = lerp(J.upperArmR.rotation.x, -0.55, w); J.upperArmR.rotation.z = lerp(J.upperArmR.rotation.z, 0.15, w);
  J.forearmR.rotation.x = lerp(J.forearmR.rotation.x, -2.15 + 0.12 * Math.sin(t * 16), w);
  J.forearmR.rotation.z = lerp(J.forearmR.rotation.z, 0.55, w);
  setGrip(C, 'R', 0.85);
}
// Phone kaan par (left haath)
export function posePhone(C, w = 1, side = 'L') {
  const J = C.J; const sx = side === 'L' ? -1 : 1;
  J['upperArm' + side].rotation.x = lerp(J['upperArm' + side].rotation.x, -0.45, w); J['upperArm' + side].rotation.z = lerp(J['upperArm' + side].rotation.z, -sx * 0.55, w);
  J['forearm' + side].rotation.x = lerp(J['forearm' + side].rotation.x, -2.35, w);
  J['forearm' + side].rotation.z = lerp(J['forearm' + side].rotation.z, sx * 0.35, w);
  setGrip(C, side, 0.7); J.head.rotation.z = lerp(J.head.rotation.z, sx * 0.12, w);
}
// Khana: right haath plate se munh tak
export function poseEat(C, t, w = 1) {
  const J = C.J; const k = 0.5 + 0.5 * Math.sin(t * 2.2);
  J.upperArmR.rotation.x = lerp(J.upperArmR.rotation.x, -0.5 - 0.25 * k, w); J.upperArmR.rotation.z = lerp(J.upperArmR.rotation.z, 0.2, w);
  J.forearmR.rotation.x = lerp(J.forearmR.rotation.x, -1.2 - 0.9 * k, w); setGrip(C, 'R', 0.7);
  J.upperArmL.rotation.x = lerp(J.upperArmL.rotation.x, -0.5, w); J.forearmL.rotation.x = lerp(J.forearmL.rotation.x, -0.9, w);
}
// Pareshani: dono haath sar par / kamar par
export function poseWorried(C, t, w = 1) {
  const J = C.J;
  for (const s of ['L', 'R']) { const sx = s === 'L' ? 1 : -1;
    J['upperArm' + s].rotation.x = lerp(J['upperArm' + s].rotation.x, -0.2, w); J['upperArm' + s].rotation.z = lerp(J['upperArm' + s].rotation.z, sx * 2.4, w);
    J['forearm' + s].rotation.z = lerp(J['forearm' + s].rotation.z, sx * 1.6, w); }
  J.head.rotation.x = lerp(J.head.rotation.x, 0.15 + 0.05 * Math.sin(t * 3), w);
}
// Ghari dekhna (left kalai)
export function poseWatch(C, w = 1) {
  const J = C.J; J.upperArmL.rotation.x = lerp(J.upperArmL.rotation.x, -0.9, w); J.upperArmL.rotation.z = lerp(J.upperArmL.rotation.z, -0.3, w);
  J.forearmL.rotation.x = lerp(J.forearmL.rotation.x, -1.3, w); J.forearmL.rotation.z = lerp(J.forearmL.rotation.z, -0.6, w); J.head.rotation.x = lerp(J.head.rotation.x, 0.35, w);
}
// Dono haath se cheez pakadna (kapre / bag)
export function poseCarryFront(C, w = 1) {
  const J = C.J; for (const s of ['L', 'R']) { const sx = s === 'L' ? 1 : -1;
    J['upperArm' + s].rotation.x = lerp(J['upperArm' + s].rotation.x, -0.55, w); J['upperArm' + s].rotation.z = lerp(J['upperArm' + s].rotation.z, -sx * 0.12, w);
    J['forearm' + s].rotation.x = lerp(J['forearm' + s].rotation.x, -1.0, w); setGrip(C, s, 0.5); }
}
// Mechanic kaam: haath aage-neeche, halki harkat
export function poseWork(C, t, w = 1) {
  const J = C.J; J.spine.rotation.x = lerp(J.spine.rotation.x, 0.55, w);
  for (const s of ['L', 'R']) { const ph = s === 'L' ? 0 : 1.7; J['upperArm' + s].rotation.x = lerp(J['upperArm' + s].rotation.x, -1.0 + 0.15 * Math.sin(t * 5 + ph), w); J['forearm' + s].rotation.x = lerp(J['forearm' + s].rotation.x, -0.5, w); }
}

export function showCamBag(C, v) { if (C.J.camBag) { C.J.camBag.visible = v; C.J.camStraps.forEach(s => s.visible = v); } }

// ---- VLOG camera poses ----
// Selfie: haath aage-upar, lens chehre ki taraf. Forward (rear mode): haath seene ki unchai par aage, lens saamne.
export function poseVlogForward(C, w = 1) {
  const J = C.J;
  J.upperArmR.rotation.x = lerp(J.upperArmR.rotation.x, -1.35, w);
  J.upperArmR.rotation.z = lerp(J.upperArmR.rotation.z, 0.18, w);
  J.forearmR.rotation.x = lerp(J.forearmR.rotation.x, -0.55, w);
  J.wristR.rotation.y = lerp(J.wristR.rotation.y, 0, w);
  setGrip(C, 'R', 0.85);
}
// Chabana (chewing) — munh dheere band/khula, jabra upar neeche
export function chew(C, t, amt = 1) {
  const k = Math.max(0, Math.sin(t * 2 * Math.PI * 1.6)) * amt;
  C.mouth.children[1].scale.y = 0.05 + 0.25 * k; C.mouth.position.y = -0.05 - 0.004 * k;
}
