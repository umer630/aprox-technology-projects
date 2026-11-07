// Procedural rigged 3D character (realistic adult proportions, ~7.3 heads tall).
// Character local +Z ki taraf dekhta hai. Uska LEFT = +X, RIGHT = -X.
import * as THREE from 'three';
import { mat, mesh, clamp, lerp, TAU, noiseTex } from './util.js';

function capsule(r, len, material, segs = 12) {
  const m = mesh(new THREE.CapsuleGeometry(r, len, 6, segs), material);
  return m;
}
// Limb jo joint se neeche (-Y) latakta hai
function limb(parent, r1, r2, len, material) {
  const geo = new THREE.CylinderGeometry(r2, r1, len, 14, 1);
  const m = mesh(geo, material); m.position.y = -len / 2; parent.add(m);
  const cap = mesh(new THREE.SphereGeometry(r1, 14, 10), material); parent.add(cap);
  return m;
}

export const LOOKS = {
  // UMER — identity profile. Original photo is session mein attach nahi thi; yeh values
  // photo milte hi yahan adjust ho jati hain aur har shot mein same locked model use hota hai.
  umer: {
    height: 1.76, skin: '#b5774f', hair: '#1a1411', beard: '#3a2b21', beardStyle: 'trim',
    shirt: '#3a6ea5', shirtStyle: 'polo', pants: '#3d4350', shoes: '#e8e4dc', sole: '#5a4a3a',
    kameez: false, cap: false, glasses: false, build: 1.0, eyes: '#2a1a10'
  },
  driver: {
    height: 1.71, skin: '#9c6644', hair: '#2a2420', beard: '#2a2420', beardStyle: 'moustache',
    shirt: '#d9d6cc', shirtStyle: 'kameez', pants: '#d9d6cc', shoes: '#3b2a1e', sole: '#2a1d14',
    kameez: true, cap: false, build: 1.05, eyes: '#24160d', grey: true
  },
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
  const pelvis = mesh(new THREE.SphereGeometry(0.15, 18, 12), pantMat); pelvis.scale.set(1.15 * bw, 0.75, 0.85); hips.add(pelvis);
  const abdomen = mesh(new THREE.CylinderGeometry(0.155 * bw, 0.15 * bw, 0.26, 18), shirtMat); abdomen.position.y = 0.1; abdomen.scale.z = 0.72; spine.add(abdomen);
  const torso = mesh(new THREE.SphereGeometry(0.2, 22, 16), shirtMat); torso.scale.set(0.98 * bw, 1.0, 0.62); torso.position.y = 0.08; chest.add(torso);
  const shoulders = mesh(new THREE.CapsuleGeometry(0.075, 0.28 * bw, 6, 12), shirtMat); shoulders.rotation.z = Math.PI / 2; shoulders.position.y = 0.2; shoulders.scale.z = 0.9; chest.add(shoulders);
  if (L.shirtStyle === 'polo') { // collar + placket
    const collar = mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 20, Math.PI * 1.4), shirtMat); collar.rotation.x = Math.PI / 2 + 0.25; collar.rotation.z = Math.PI * 0.8; collar.position.set(0, 0.255, 0.005); chest.add(collar);
    const plack = mesh(new THREE.BoxGeometry(0.03, 0.09, 0.01), mat('#16263a', 0.9)); plack.position.set(0, 0.2, 0.123); plack.rotation.x = -0.15; chest.add(plack);
  }
  if (L.vest) { const v = mesh(new THREE.SphereGeometry(0.205, 20, 14), mat(L.vest, 0.8)); v.scale.set(0.98 * bw, 0.9, 0.64); v.position.y = 0.05; chest.add(v); }
  const neckM = capsule(0.052, 0.07, skinMat); neckM.position.y = 0.03; neck.add(neckM);

  // Kameez (lamba kurta) — hips se ghutno tak
  if (L.kameez) {
    const sk = mesh(new THREE.CylinderGeometry(0.17 * bw, 0.25 * bw, 0.55, 22, 1, true), shirtMat); sk.position.y = -0.2; sk.scale.z = 0.82; sk.material.side = THREE.DoubleSide; hips.add(sk);
    const collar = mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.04, 16, 1, true), shirtMat); collar.position.y = 0.26; chest.add(collar);
  }

  // HEAD — realistic adult proportion (~1/7.3 of height)
  const skull = mesh(new THREE.SphereGeometry(0.098, 32, 24), skinMat); skull.scale.set(0.88, 1.08, 0.98); skull.position.y = 0.105; head.add(skull);
  const jaw = mesh(new THREE.SphereGeometry(0.08, 24, 16), skinMat); jaw.scale.set(0.98, 0.92, 1.0); jaw.position.set(0, 0.05, 0.016); head.add(jaw);
  for (const sx of [-1, 1]) { const ck = mesh(new THREE.SphereGeometry(0.024, 12, 10), skinMat); ck.position.set(sx * 0.044, 0.074, 0.062); head.add(ck); }
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
  const hairCap = mesh(new THREE.SphereGeometry(0.102, 28, 18, 0, TAU, 0, Math.PI * 0.42), hairMat); hairCap.scale.set(0.94, 1.14, 1.04); hairCap.position.set(0, 0.112, -0.012); hairCap.rotation.x = -0.32; head.add(hairCap);
  const hairBack = mesh(new THREE.SphereGeometry(0.1, 24, 16, Math.PI, Math.PI, Math.PI * 0.35, Math.PI * 0.3), hairMat); hairBack.scale.set(0.93, 1.12, 1.03); hairBack.position.set(0, 0.105, -0.004); head.add(hairBack);
  const quiff = mesh(new THREE.SphereGeometry(0.05, 16, 10), hairMat); quiff.scale.set(1.55, 0.32, 1.1); quiff.position.set(-0.008, 0.2, 0.045); quiff.rotation.set(-0.35, 0, 0.12); head.add(quiff);
  for (const sx of [-1, 1]) { const side = mesh(new THREE.SphereGeometry(0.05, 12, 10), hairMat); side.scale.set(0.35, 0.9, 1.25); side.position.set(sx * 0.085, 0.13, -0.02); head.add(side); }
  if (L.grey) { hairCap.material = mat('#4a4540', 0.85); }

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

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });

  const C = {
    root, rig, J, eyes, mouth, look: L,
    walkPhase: 0, talk: 0, blink: 0, held: null,
    setNeutral() {
      for (const k of Object.keys(J)) { const j = J[k]; if (j.isObject3D) j.rotation.set(0, 0, 0); }
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
