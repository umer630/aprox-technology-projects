// SEQUENCE K — Terminal andar: check-in counter + security screening
import * as THREE from 'three';
import { buildCheckinHall } from './lib/env.js';
import { createCast } from './lib/cast.js';
import { createBoardingPass } from './lib/props.js';
import { createCharacter, LOOKS, poseCarryCam, posePullBag, poseReach, faceUpdate, setGrip } from './lib/character.js';
import { plan, applyPlan, attachBagToHand, holdCamera, attachToHand, placeWorld, camLerp, handheld, V3 } from './lib/anim.js';
import { mat, mesh, box, rbox, smooth, range, lerp, clamp } from './lib/util.js';

function buildSecurity(scene, X) {
  const g = new THREE.Group(); g.position.set(X, 0, 0); scene.add(g);
  const steel = mat('#b7bcc2', 0.35, 0.8);
  // conveyor along X: from x=-4 to x=4, z=-1, top y=0.78
  g.add(box(8.5, 0.12, 0.8, mat('#2a2a2a', 0.85), 0, 0.72, -1)); // belt
  for (const s of [-1, 1]) g.add(box(8.5, 0.08, 0.06, steel, 0, 0.8, -1 + s * 0.43));
  for (const x of [-4, -2, 0, 2, 4]) for (const s of [-1, 1]) g.add(box(0.06, 0.66, 0.06, steel, x, 0.33, -1 + s * 0.38));
  // x-ray tunnel
  const xr = new THREE.Group(); xr.position.set(0.5, 0, -1); g.add(xr);
  xr.add(box(2.2, 0.15, 1.3, mat('#d7dbe0', 0.5), 0, 1.75, 0)); for (const s of [-1, 1]) xr.add(box(2.2, 1.1, 0.25, mat('#d7dbe0', 0.5), 0, 1.2, s * 0.53));
  xr.add(box(2.2, 0.62, 1.3, mat('#d7dbe0', 0.5), 0, 0.33, 0));
  for (const s of [-1, 1]) xr.add(box(0.02, 0.9, 0.85, mat('#1a1a1a', 0.9), s * 1.1, 1.24, 0)); // lead curtains
  xr.add(box(0.5, 0.4, 0.05, mat('#e6c229', 0.6), -1.12, 1.55, 0.4)); // yellow caution panel (no text)
  // operator screen
  const sc = box(0.6, 0.4, 0.05, mat('#0b1622', 0.2), 1.0, 1.35, 0.55); g.add(sc); g.add(box(0.06, 0.6, 0.06, steel, 1.0, 0.9, 0.55));
  // walk-through metal detector arch at x=0.5, z=1.2 (passenger path along X)
  const arch = new THREE.Group(); arch.position.set(0.5, 0, 1.3); g.add(arch);
  for (const s of [-1, 1]) arch.add(box(0.5, 2.2, 0.18, mat('#c9ced3', 0.4, 0.3), 0, 1.1, s * 0.5));
  arch.add(box(0.55, 0.25, 1.2, mat('#c9ced3', 0.4, 0.3), 0, 2.3, 0));
  const lamp = mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: '#2bd65a', emissive: '#14ff4a', emissiveIntensity: 0.8 })); lamp.position.set(0, 2.47, 0); arch.add(lamp);
  arch.children.forEach(o => { o.rotation.y = Math.PI / 2; });
  // trays
  const trays = [];
  for (let i = 0; i < 3; i++) { const tr = rbox(0.6, 0.12, 0.42, 0.03, mat('#9aa0a6', 0.6)); scene.add(tr); trays.push(tr); }
  // stack of empty trays at start
  for (let i = 0; i < 4; i++) { const _m = rbox(0.6, 0.11, 0.42, 0.03, mat('#9aa0a6', 0.6)); _m.position.set(-4.6, 0.84 + i * 0.1, -1); g.add(_m); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { g, trays, lamp };
}

export default {
  id: 'K', ambience: 'hall', sfx: [[4.8, 'belt']], title: 'Check-in aur Security',
  build(scene, renderer) {
    const hall = buildCheckinHall(scene);
    const c = createCast(scene, { revo: false, driver: false }); scene.add(c.bag.group);
    const agent = createCharacter(LOOKS.agent, 7); agent.root.position.set(0.15, 0, -8.75); scene.add(agent.root);
    const officer = createCharacter({ ...LOOKS.agent, vest: '#2b3a2b', shirt: '#cfd6cf', height: 1.78 }, 8); officer.root.position.set(40 + 1.6, 0, 2.6); officer.root.rotation.y = -Math.PI / 2 - 0.4; scene.add(officer.root);
    // queue + other passengers at neighbouring counters
    const npcs = [];
    const looks = [{ ...LOOKS.driver, grey: false, hair: '#111', shirt: '#ece7dc', pants: '#ece7dc' }, { ...LOOKS.umer, cameraBag: false, shirt: '#6b4a2e', beardStyle: 'none', pants: '#1f1f1f' }, { ...LOOKS.agent, vest: null, shirt: '#3e5f7a', pants: '#2b2b2b' }, { ...LOOKS.driver, shirt: '#8aa0b4', pants: '#8aa0b4', grey: true }];
    const spots = [[-3.4, -7.0, Math.PI], [3.0, -7.0, Math.PI], [6.2, -6.9, Math.PI], [-6.4, -7.0, Math.PI], [2.2, -3.6, Math.PI], [2.4, -2.4, Math.PI], [-4.5, -1.0, Math.PI * 0.9], [7.5, -1.5, -2.6]];
    spots.forEach(([x, z, h], i) => { const n = createCharacter(looks[i % 4], 70 + i); n.root.position.set(x, 0, z); n.root.rotation.y = h; scene.add(n.root); npcs.push(n); });
    for (const x of [-6.4, 6.4, 3.2, -3.2]) { const a = createCharacter(LOOKS.agent, 90 + x * 3); a.root.position.set(x + 0.2, 0, -8.75); scene.add(a.root); npcs.push(a); }
    const sec = buildSecurity(scene, 40);
    const pass = createBoardingPass();
    const uP = plan(c.umer, [-0.75, -2.6], Math.PI, [{ at: 0.4, to: [-0.75, -6.95] }]);
    const sP = plan(c.umer, [36.3, -0.35], Math.PI, [{ at: 13.0, to: [39.7, 1.3] }, { at: 16.45, to: [41.4, 1.3] }, { at: 18.0, to: [42.9, -0.3] }, { at: 20.0, face: Math.PI, dur: 0.4 }]);
    return { hall, agent, officer, npcs, sec, pass, uP, sP, ...c };
  },
  shots: [
    { id: 'K01', dur: 4.6, desc: 'Check-in hall wide: Umer queue se counter tak',
      cam(t, c, cam) { camLerp(cam, V3(7.5, 3.4, 4.5), V3(5.0, 2.6, 1.5), V3(-1.0, 1.2, -6), V3(-0.8, 1.2, -7), t / 4.6, 44); } },
    { id: 'K02', dur: 5.4, desc: 'Medium: bag belt par, boarding pass hand-to-hand',
      cam(t, c, cam) { const h = handheld(t, 0.5); camLerp(cam, V3(2.2, 1.65, -5.0).add(h), V3(1.9, 1.6, -5.4).add(h), V3(-0.5, 1.25, -7.9), V3(-0.3, 1.25, -7.9), t / 5.4, 38); } },
    { id: 'K03', dur: 2.0, desc: 'Insert close-up: boarding pass KHI → ISB',
      cam(t, c, cam) { c.pass.updateMatrixWorld(true); const p = new THREE.Vector3(); c.pass.getWorldPosition(p); cam.position.set(p.x + 0.28, p.y + 0.12, p.z + 0.22 - t * 0.02); cam.lookAt(p); cam.fov = 40; } },
    { id: 'K04', dur: 9.6, desc: 'Security: camera tray mein, tray x-ray se guzarti hai, Umer arch se, camera wapas haath mein',
      cam(t, c, cam) { camLerp(cam, V3(40 - 2.5, 2.4, 5.8), V3(40 + 2.0, 2.2, 5.4), V3(40 - 2.6, 1.0, -0.5), V3(40 + 2.8, 1.0, -0.5), t / 9.6, 46); } }
  ],
  subs: [
    [5.0, 6.8, 'Agent', 'Assalam o Alaikum! Aap ka CNIC aur ticket, please.', 'السلام علیکم! آپ کا شناختی کارڈ اور ٹکٹ، پلیز۔'],
    [6.9, 8.4, 'Agent', 'Yeh rahi aap ki boarding pass. Safar mubarak!', 'یہ رہا آپ کا بورڈنگ پاس۔ سفر مبارک!'],
    [8.4, 10.0, 'Umer', 'Bohat shukriya!', 'بہت شکریہ!'],
    [12.2, 14.4, 'Umer', 'Camera tray mein — security check zaroori hai.', 'کیمرا ٹرے میں، سیکیورٹی چیک ضروری ہے۔'],
    [20.2, 21.6, 'Umer', 'Camera wapas mil gaya! Ab gate ki taraf.', 'کیمرا واپس مل گیا! اب گیٹ کی طرف۔']
  ],
  update(t, c, cam, shot) {
    const { umer, bag, vcam, agent, pass, sec } = c;
    for (const n of c.npcs) { n.setNeutral(); n.J.chest.rotation.x = 0.01 * Math.sin(t + n.root.id); faceUpdate(n, t, 0); }
    agent.setNeutral(); faceUpdate(agent, t, (t > 5.0 && t < 8.4) ? 1 : 0);
    c.officer.setNeutral(); faceUpdate(c.officer, t, 0);
    if (t < 12.0) {
      // ---- CHECK-IN ----
      applyPlan(umer, c.uP, t); poseCarryCam(umer, 1);
      const bagLift = range(t, 4.7, 5.9);
      if (t < 4.7) { posePullBag(umer, 1); bag.setExtend(1); attachBagToHand(umer, 'L', bag); }
      else if (t < 5.9) { // left haath se bag utha kar belt/scale par
        const u = smooth(bagLift); bag.setExtend(1 - u);
        umer.J.upperArmL.rotation.z = lerp(0.2, 0.75, Math.sin(u * Math.PI)); umer.J.upperArmL.rotation.x = -0.15; setGrip(umer, 'L', 0.9);
        umer.J.spine.rotation.z = -0.12 * Math.sin(u * Math.PI);
        const a = attachBagToHand(umer, 'L', bag).clone(); const target = new THREE.Vector3(-1.6, 0.38, -7.95);
        const p = a.clone().lerp(target, u); p.y = lerp(0, 0.38, u) + Math.sin(u * Math.PI) * 0.18; bag.group.position.copy(p); bag.group.rotation.set(0, Math.PI, 0);
      } else { bag.setExtend(0); bag.group.rotation.set(0, Math.PI, 0); bag.group.position.set(-1.6, 0.38, -7.95 - range(t, 9.0, 11.5) * 1.2); }
      // boarding pass: agent ka right haath → Umer ka left haath (7.1 – 7.6)
      const reachA = smooth(range(t, 6.6, 7.1)) * (1 - smooth(range(t, 7.7, 8.2)));
      const reachU = smooth(range(t, 6.9, 7.3)) * (1 - smooth(range(t, 8.3, 8.9)));
      if (reachA > 0) { poseReach(agent, 'R', 1.25 * reachA, 1); agent.J.spine.rotation.x = 0.15 * reachA; }
      if (reachU > 0 && t > 5.9) { poseReach(umer, 'L', 1.25 * reachU, 1); umer.J.spine.rotation.x = 0.1 * reachU; setGrip(umer, 'L', 0.6); }
      if (t < 6.4) { pass.visible = false; }
      else if (t < 7.45) { pass.visible = true; attachToHand(pass, agent, 'R', new THREE.Vector3(0.02, -0.1, 0.06), new THREE.Euler(0, Math.PI / 2, Math.PI / 2)); setGrip(agent, 'R', 0.55); }
      else { pass.visible = true; attachToHand(pass, umer, 'L', new THREE.Vector3(-0.02, -0.1, 0.06), new THREE.Euler(0, -Math.PI / 2, -Math.PI / 2)); setGrip(umer, 'L', 0.55); }
      if (t >= 8.9) { umer.J.upperArmL.rotation.x = -0.55; umer.J.forearmL.rotation.x = -1.2; } // pass ko dekhte hue
      umer.root.updateMatrixWorld(true);
      holdCamera(umer, vcam, new THREE.Vector3(-0.75, 1.1, -10));
      faceUpdate(umer, t, (t > 8.4 && t < 10.0) ? 1 : 0);
      for (const tr of sec.trays) tr.visible = false;
    } else {
      // ---- SECURITY (lt = t-12) ----
      const st = t; pass.visible = false; bag.group.visible = false;
      applyPlan(umer, c.sP, st);
      const tray = sec.trays[0]; tray.visible = true; tray.position.set(40 - 3.6, 0.84, -1);
      // tray belt par chalti hai 13.2 → 16.6 (x: -3.6 → +3.0)
      const tx = 40 - 3.6 + smooth(range(st, 13.2, 16.6)) * 6.6; tray.position.x = tx;
      // camera: haath mein → tray (12.6–13.0) → tray ke saath → haath mein wapas (17.6)
      if (st < 12.8) { poseCarryCam(umer, 1); holdCamera(umer, vcam, new THREE.Vector3(40, 1, -1)); if (st > 12.2) { poseReach(umer, 'R', 0.9 * smooth(range(st, 12.2, 12.7)), 1); umer.J.spine.rotation.x = 0.25 * smooth(range(st, 12.2, 12.7)); holdCamera(umer, vcam, new THREE.Vector3(40 - 3.6, 0.5, -1)); } }
      else if (st < 20.3) { placeWorld(vcam, c.umer.root.parent, new THREE.Vector3(tx, 0.93, -1), Math.PI / 2); vcam.rotation.set(-Math.PI / 2, 0, 0); setGrip(umer, 'R', 0.2); }
      else { poseCarryCam(umer, 1); poseReach(umer, 'R', 0.9 * (1 - smooth(range(st, 20.3, 20.9))), 1); holdCamera(umer, vcam, new THREE.Vector3(48, 1, 0)); }
      if (st > 19.9 && st < 20.3) { poseReach(umer, 'R', 0.9 * smooth(range(st, 19.9, 20.25)), 1); umer.J.spine.rotation.x = 0.2; }
      // officer haath se ishara karta hai
      if (st > 13.6 && st < 15.0) { poseReach(c.officer, 'L', 0.8 * Math.sin(range(st, 13.6, 15.0) * Math.PI), 1); }
      sec.lamp.material.emissive.set(st > 14.9 && st < 15.4 ? '#14ff4a' : '#0a8a2a');
      faceUpdate(umer, st, (st > 12.2 && st < 14.4) || (st > 20.2 && st < 21.6) ? 1 : 0);
    }
  }
};
