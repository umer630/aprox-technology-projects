// SEQUENCE K — Terminal andar: check-in counter + security screening
import * as THREE from 'three';
import { buildCheckinHall } from './lib/env.js';
import { createCast } from './lib/cast.js';
import { createBoardingPass } from './lib/props.js';
import { createCharacter, LOOKS, poseCarryCam, posePullBag, poseReach, poseIdle, faceUpdate, setGrip } from './lib/character.js';
import { plan, applyPlan, attachBagToHand, holdCamera, attachToHand, placeWorld, camLerp, handheld, speaking, V3 } from './lib/anim.js';
import { mat, mesh, box, rbox, smooth, range, lerp, clamp } from './lib/util.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
const MODE = [[0, 1], [8.4, 0], [11.2, 1], [20.4, 0]];

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
  id: 'K', ambience: 'hall', sfx: [[4.8, 'belt'], [16.9, 'beep']], title: 'Check-in, Bag Drop aur Security',
  build(scene, renderer) {
    const hall = buildCheckinHall(scene);
    const c = createCast(scene, { revo: false, driver: false }); scene.add(c.bag.group);
    const agent = createCharacter({ ...LOOKS.checkinAgent }, 7); agent.root.position.set(0.15, 0, -8.75); scene.add(agent.root);
    const bstaff = createCharacter({ ...LOOKS.baggageStaff }, 9); bstaff.root.position.set(-2.4, 0, -9.3); bstaff.root.rotation.y = 0.5; scene.add(bstaff.root);
    const officer = createCharacter({ ...LOOKS.securityOfficer }, 8); officer.root.position.set(40 + 1.6, 0, 2.6); officer.root.rotation.y = -Math.PI / 2 - 0.4; scene.add(officer.root);
    const screener = createCharacter({ ...LOOKS.screeningStaff }, 10); screener.root.position.set(41.5, 0, 0.0); screener.root.rotation.y = Math.PI; scene.add(screener.root);
    const npcs = [];
    const looks = [LOOKS.passengerM, LOOKS.passengerF, LOOKS.businessTraveller, LOOKS.youngPassenger, LOOKS.loungePassenger];
    const spots = [[-3.4, -7.0, Math.PI], [3.0, -7.0, Math.PI], [6.2, -6.9, Math.PI], [-6.4, -7.0, Math.PI], [2.2, -3.6, Math.PI], [2.4, -2.4, Math.PI], [-4.5, -1.0, Math.PI * 0.9], [7.5, -1.5, -2.6], [37.4, 1.4, -Math.PI / 2], [36.6, 1.5, -Math.PI / 2]];
    spots.forEach(([x, z, h], i) => { const n = createCharacter({ ...looks[i % looks.length], cameraBag: false }, 70 + i); n.root.position.set(x, 0, z); n.root.rotation.y = h; scene.add(n.root); npcs.push(n); });
    for (const x of [-6.4, 6.4, 3.2, -3.2]) { const a = createCharacter({ ...LOOKS.checkinAgent, tie: x > 0 ? '#2a6fd6' : '#1e4a8a' }, 90 + x * 3); a.root.position.set(x + 0.2, 0, -8.75); scene.add(a.root); npcs.push(a); }
    const sec = buildSecurity(scene, 40);
    const pass = createBoardingPass();
    const uP = plan(c.umer, [-0.75, -2.6], Math.PI, [{ at: 0.4, to: [-0.75, -6.95] }]);
    const sP = plan(c.umer, [36.3, -0.35], Math.PI, [{ at: 13.0, to: [39.7, 1.3] }, { at: 16.3, to: [41.6, 1.3] }, { at: 18.0, to: [42.95, -0.25] }, { at: 19.6, face: Math.PI, dur: 0.4 }]);
    return { hall, agent, bstaff, officer, screener, npcs, sec, pass, uP, sP, ...c };
  },
  shots: [
    { id: 'K01', dur: 4.6, desc: 'REAR: check-in hall, queue se counter tak', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 78 }); } },
    { id: 'K02', dur: 3.8, desc: 'REAR on agent: bag drop belt, CNIC + ticket', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 4.6, { fov: 72 }); } },
    { id: 'K03', dur: 3.6, desc: 'SELFIE: boarding pass mil gaya, shukriya', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 8.4, { fov: 72 }); } },
    { id: 'K04', dur: 0.8, desc: 'REAR: security line, tray', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 12.0, { fov: 76 }); } },
    { id: 'K05', dur: 7.6, desc: 'CAMERA TRAY MEIN: x-ray se nikal kar Umer ko arch se guzarte dekhta hai', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 12.8, { fov: 74, shake: 0 }); } },
    { id: 'K06', dur: 1.6, desc: 'SELFIE: camera wapas haath mein', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 20.4, { fov: 74 }); } }
  ],
  subs: [
    [5.0, 6.8, 'Agent', 'Assalam o Alaikum! Aap ka CNIC aur ticket, please.', 'السلام علیکم! آپ کا شناختی کارڈ اور ٹکٹ، پلیز۔'],
    [6.9, 8.4, 'Agent', 'Yeh rahi aap ki boarding pass. Safar mubarak!', 'یہ رہا آپ کا بورڈنگ پاس۔ سفر مبارک!'],
    [8.6, 11.6, 'Umer', 'Bohat shukriya! Dosto, bag drop ho gaya — ab security.', 'بہت شکریہ! دوستو، بیگ ڈراپ ہو گیا، اب سیکیورٹی۔'],
    [12.0, 14.4, 'Umer', 'Camera tray mein — security check zaroori hai.', 'کیمرا ٹرے میں، سیکیورٹی چیک ضروری ہے۔'],
    [17.0, 18.6, 'Officer', 'Theek hai, aage chalein.', 'ٹھیک ہے، آگے چلیں۔'],
    [20.4, 22.0, 'Umer', 'Camera wapas mil gaya! Ab lounge ki taraf.', 'کیمرا واپس مل گیا! اب لاؤنج کی طرف۔']
  ],
  update(t, c, cam, shot) {
    const { umer, bag, vcam, agent, pass, sec } = c; const scene = umer.root.parent;
    for (const n of c.npcs) { n.setNeutral(); poseIdle(n, t + n.root.id); faceUpdate(n, t, 0); }
    agent.setNeutral(); faceUpdate(agent, t, (t > 5.0 && t < 8.4) ? 1 : 0);
    c.bstaff.setNeutral(); poseIdle(c.bstaff, t); faceUpdate(c.bstaff, t, 0);
    c.officer.setNeutral(); poseIdle(c.officer, t); faceUpdate(c.officer, t, (t > 17 && t < 18.6) ? 1 : 0);
    c.screener.setNeutral(); poseIdle(c.screener, t); c.screener.J.head.rotation.x = 0.25; faceUpdate(c.screener, t, 0);
    if (t < 12.0) {
      // ---- CHECK-IN + BAG DROP ----
      umer.setNeutral(); applyPlan(umer, c.uP, t);
      const bagLift = range(t, 4.7, 5.9);
      let bagPose = null;
      if (t < 4.7) { bagPose = 'pull'; }
      else if (t < 5.9) bagPose = 'lift';
      // vlog camera right haath mein (rear → agent, selfie → shukriya)
      const ap = new THREE.Vector3(); agent.J.head.getWorldPosition(ap);
      let ft = t > 4.0 && t < 8.4 ? ap : V3(-0.75, 1.3, -12);
      vlogPose(umer, vcam, modeAt(MODE, t), ft, t);
      if (bagPose === 'pull') { posePullBag(umer, 1); bag.setExtend(1); attachBagToHand(umer, 'L', bag); }
      else if (bagPose === 'lift') {
        const u = smooth(bagLift); bag.setExtend(1 - u);
        umer.J.upperArmL.rotation.z = lerp(0.2, 0.75, Math.sin(u * Math.PI)); umer.J.upperArmL.rotation.x = -0.15; setGrip(umer, 'L', 0.9);
        const a = attachBagToHand(umer, 'L', bag).clone(); const target = new THREE.Vector3(-1.6, 0.38, -7.95);
        const p = a.clone().lerp(target, u); p.y = lerp(0, 0.38, u) + Math.sin(u * Math.PI) * 0.18; bag.group.position.copy(p); bag.group.rotation.set(0, Math.PI, 0);
      } else { bag.setExtend(0); bag.group.rotation.set(0, Math.PI, 0); bag.group.position.set(-1.6, 0.38, -7.95 - range(t, 9.0, 11.5) * 1.2); }
      if (t > 6.0 && t < 7.0) poseReach(c.bstaff, 'R', 0.7, 1);
      const reachA = smooth(range(t, 6.6, 7.1)) * (1 - smooth(range(t, 7.7, 8.2)));
      const reachU = smooth(range(t, 6.9, 7.3)) * (1 - smooth(range(t, 8.3, 8.9)));
      if (reachA > 0) { poseReach(agent, 'R', 1.25 * reachA, 1); agent.J.spine.rotation.x = 0.15 * reachA; }
      if (reachU > 0 && t > 5.9) { poseReach(umer, 'L', 1.25 * reachU, 1); setGrip(umer, 'L', 0.6); }
      if (t < 6.4) { pass.visible = false; }
      else if (t < 7.45) { pass.visible = true; attachToHand(pass, agent, 'R', new THREE.Vector3(0.02, -0.1, 0.06), new THREE.Euler(0, Math.PI / 2, Math.PI / 2)); setGrip(agent, 'R', 0.55); }
      else { pass.visible = true; attachToHand(pass, umer, 'L', new THREE.Vector3(-0.02, -0.1, 0.06), new THREE.Euler(0, -Math.PI / 2, -Math.PI / 2)); setGrip(umer, 'L', 0.55); }
      if (t >= 8.9) { umer.J.upperArmL.rotation.x = -1.0; umer.J.upperArmL.rotation.z = 0.25; umer.J.forearmL.rotation.x = -0.9; }
      faceUpdate(umer, t, speaking(this.subs, t, 'Umer'));
      for (const tr of sec.trays) tr.visible = false;
    } else {
      // ---- SECURITY ----
      const st = t; pass.visible = false; bag.group.visible = false;
      umer.setNeutral(); applyPlan(umer, c.sP, st);
      const tray = sec.trays[0]; tray.visible = true;
      const tx = 40 - 3.6 + smooth(range(st, 13.2, 15.3)) * 6.6; tray.position.set(tx, 0.84, -1);
      if (st < 12.8) {
        vlogPose(umer, vcam, 1, V3(40 - 3.6, 0.6, -1), st);
        const r = smooth(range(st, 12.2, 12.7)); if (r > 0) { poseReach(umer, 'R', 0.9 * r, 1); umer.J.spine.rotation.x = 0.25 * r; umer.root.updateMatrixWorld(true); }
      } else if (st < 20.3) {
        // camera tray mein seedha khara, lens arch / Umer ki taraf (x-ray ke baad)
        if (vcam.parent !== scene) scene.add(vcam);
        vcam.scale.setScalar(1); vcam.position.set(tx, 0.97, -1.02);
        const up = umer.root.position; const yaw = st < 15.3 ? 0 : Math.atan2(up.x - tx, up.z + 1.02);
        const sy = st < 15.3 ? 0 : smooth(range(st, 15.3, 16.0));
        vcam.rotation.set(-0.22, yaw * sy, 0, 'YXZ'); vcam.updateMatrixWorld(true);
        setGrip(umer, 'R', 0.2); poseIdle(umer, st);
        if (st > 19.6) { const r = smooth(range(st, 19.6, 20.2)); poseReach(umer, 'R', 0.95 * r, 1); umer.J.spine.rotation.x = 0.22 * r; }
      } else {
        vlogPose(umer, vcam, modeAt(MODE, st), V3(48, 1.2, 0), st);
      }
      if (st > 14.2 && st < 15.6) { poseReach(c.officer, 'L', 0.8 * Math.sin(range(st, 14.2, 15.6) * Math.PI), 1); }
      sec.lamp.material.emissive.set(st > 16.7 && st < 17.3 ? '#14ff4a' : '#0a8a2a');
      faceUpdate(umer, st, speaking(this.subs, st, 'Umer'));
    }
  }
};
