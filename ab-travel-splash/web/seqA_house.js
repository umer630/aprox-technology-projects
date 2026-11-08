// SEQUENCE A — Karachi: ghar ka main gate → Umer bahar aata hai → driver → Revo
import * as THREE from 'three';
import { createCharacter, LOOKS, poseCarryCam, poseSelfie, posePullBag, poseSalaam, poseSit, poseReach, faceUpdate, setGrip, poseIdle, poseWave, showCamBag } from './lib/character.js';
import { createVlogCam, createSuitcase } from './lib/props.js';
import { createRevo, createCar, createBike } from './lib/vehicles.js';
import { setupSkyAndLight, buildHouseStreet } from './lib/env.js';
import { plan, applyPlan, evalPlan, attachBagToHand, holdCamera, handheld, camLerp, V3 } from './lib/anim.js';
import { clamp, lerp, smooth, range } from './lib/util.js';

export const SEQ_A = {
  id: 'A', ambience: 'street', sfx: [[4.6, 'gate'], [19.8, 'door'], [20.3, 'engine']], title: 'Karachi — Ghar se rawangi',
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 24, azim: 35, sunI: 3.2, hemiI: 0.85, fog: [0xd6dbd8, 60, 400], shadowSize: 22, sunColor: '#ffeccd' });
    const H = buildHouseStreet(scene);
    const umer = createCharacter(LOOKS.umer, 1); scene.add(umer.root);
    const driver = createCharacter(LOOKS.driver, 2); scene.add(driver.root);
    const vcam = createVlogCam();
    const bag = createSuitcase('#2e4a6b'); scene.add(bag.group);
    const revo = createRevo('#f2f3f1'); revo.group.position.set(3.5, 0, 2.8); scene.add(revo.group); revo.setTail(1);
    // parked car opposite + passing bike
    const pc = createCar('hatch', 5); pc.group.position.set(-9, 0, 7.6); pc.group.rotation.y = Math.PI; scene.add(pc.group);
    const bike = createBike(9); bike.group.rotation.y = Math.PI; scene.add(bike.group);
    const ammi = createCharacter({ ...LOOKS.ammi, cameraBag: false }, 5); ammi.root.position.set(-1.3, 0, -1.2); ammi.root.rotation.y = 0.2; scene.add(ammi.root);
    // plans
    const uP = plan(umer, [-0.3, -2.8], 0, [
      { at: 5.0, to: [-0.3, 0.9] },
      { at: 13.0, face: -Math.PI / 2 + 0.25, dur: 0.6 }, // driver ki taraf (−X? nahi: driver +X par hai)
      { at: 15.7, to: [4.05, 1.12] },
      { at: 19.6, face: 0, dur: 0.5 }
    ]);
    // fix: driver Umer ke +X side par khara hai → heading +π/2
    uP.segs[1].h = Math.PI / 2;
    uP.segs[2].h0 = Math.PI / 2;
    const dP = plan(driver, [1.25, 1.0], -2.3, [
      { at: 12.4, to: [0.6, 0.92] },
      { at: 13.0, face: -Math.PI / 2, dur: 0.5 },
      { at: 15.75, to: [-0.15, 2.8] },
      { at: 17.5, face: Math.PI / 2, dur: 0.5 }
    ]);
    const bedPos = new THREE.Vector3(3.5 - 2.15, 0.88, 2.8);
    return { L, H, umer, driver, vcam, bag, revo, bike, uP, dP, bedPos, ammi };
  },
  shots: [
    { id: 'A01', dur: 4.5, desc: 'Wide establishing crane — ghar, gate, Revo, driver',
      cam(t, c, cam) { camLerp(cam, V3(-15, 10, 17), V3(-10.5, 3.2, 13.5), V3(1.5, 2.2, -1), V3(1.0, 1.4, 0.5), t / 4.5, 38); } },
    { id: 'A02', dur: 4.1, desc: 'Medium: gate khulta hai, Umer camera + suitcase ke saath bahar',
      cam(t, c, cam) { const h = handheld(t, 0.6); camLerp(cam, V3(-1.6, 1.55, 6.6).add(h), V3(-1.3, 1.5, 5.4).add(h), V3(-0.3, 1.25, -1.5), V3(-0.3, 1.25, 0), t / 4.1, 40); } },
    { id: 'A03', dur: 4.4, desc: 'Selfie vlog close-up — Assalam o Alaikum', selfie: true,
      cam(t, c, cam) {
        c.vcam.updateMatrixWorld(true); const p = new THREE.Vector3(); c.vcam.getWorldPosition(p);
        const head = new THREE.Vector3(); c.umer.J.head.getWorldPosition(head); head.y += 0.07;
        const dir = head.clone().sub(p).normalize(); cam.position.copy(p).addScaledVector(dir, 0.07).add(handheld(t, 0.8, 2)); cam.lookAt(head.x, head.y - 0.1, head.z); cam.fov = 72; cam.updateProjectionMatrix();
      } },
    { id: 'A04', dur: 2.6, desc: 'Two-shot: driver salaam karta hai',
      cam(t, c, cam) { camLerp(cam, V3(0.15, 1.6, 3.9), V3(0.25, 1.58, 3.6), V3(0.15, 1.45, 0.9), V3(0.15, 1.45, 0.9), t / 2.6, 34); } },
    { id: 'A05', dur: 4.0, desc: 'Wide side: driver suitcase Revo ke bed mein rakhta hai, Umer passenger door ki taraf',
      cam(t, c, cam) { camLerp(cam, V3(-6.5, 2.4, 8.8), V3(-5.6, 2.2, 8.2), V3(0.6, 1.0, 2.2), V3(1.8, 1.0, 2.2), t / 4.0, 40); } },
    { id: 'A06', dur: 5.0, desc: 'Low-angle tracking: Revo LEFT lane mein rawana',
      cam(t, c, cam) { const x = c.revo.group.position.x; cam.position.set(15.5, 0.55, 7.7); cam.lookAt(x + 1.0, 1.0, 2.8); cam.fov = 36; cam.updateProjectionMatrix(); } }
  ],
  subs: [
    [9.1, 11.2, 'Umer', 'Assalam o Alaikum dosto! Main hoon Umer.', 'السلام علیکم دوستو! میں ہوں عمر۔'],
    [11.2, 13.0, 'Umer', 'Ab Travel Splash ke Episode 1 mein khush aamdeed!', 'اب ٹریول اسپلیش کی ایپی سوڈ ون میں خوش آمدید!'],
    [13.4, 14.8, 'Driver', 'Walaikum Assalam, Umer bhai! Saman mujhe de dein.', 'وعلیکم السلام عمر بھائی! سامان مجھے دے دیں۔'],
    [14.8, 15.6, 'Umer', 'Shukriya chacha!', 'شکریہ چچا!'],
    [16.0, 19.0, 'Umer', 'Aaj ka safar — Karachi se Islamabad. Chalo, airport chalte hain!', 'آج کا سفر، کراچی سے اسلام آباد۔ چلو، ایئرپورٹ چلتے ہیں!'],
    [20.2, 22.6, 'Ammi', 'Allah Hafiz beta, Fi Amanillah!', 'اللہ حافظ بیٹا، فی امان اللہ!']
  ],
  update(t, c) {
    const { umer, driver, vcam, bag, revo, H, L, ammi } = c;
    ammi.setNeutral(); poseIdle(ammi, t); ammi.root.visible = t > 5.5; if (t > 15) poseWave(ammi, t, 'R', smooth(range(t, 15, 15.5))); faceUpdate(ammi, t, t > 20.2 && t < 22.6 ? 1 : 0);
    // gate: 4.6 → 6.4 andar ki taraf khulta hai
    const g = smooth(range(t, 4.6, 6.6)) * 1.45; H.leafL.rotation.y = g; H.leafR.rotation.y = -g;
    // passing motorbike (−X heading → far lane z>5.2, left-hand traffic)
    const bx = 30 - (t - 1) * 9; c.bike.group.position.set(bx, 0, 6.9); c.bike.roll(t * 9);
    const seated = t >= 19.6;
    if (!seated) {
      // ---- UMER ----
      const us = applyPlan(umer, c.uP, t);
      poseCarryCam(umer, 1);
      if (t < 15.5) posePullBag(umer, 1);
      const sw = smooth(range(t, 8.5, 9.0)) * (1 - smooth(range(t, 12.7, 13.1)));
      if (sw > 0) poseSelfie(umer, sw, Math.sin(t * 2));
      // camera look direction: selfie → face; warna aage
      umer.root.updateMatrixWorld(true);
      const head = new THREE.Vector3(); umer.J.head.getWorldPosition(head); head.y += 0.08;
      const fwd = new THREE.Vector3(Math.sin(umer.root.rotation.y), 0, Math.cos(umer.root.rotation.y));
      const ahead = umer.root.position.clone().add(fwd.multiplyScalar(4)); ahead.y = 1.0;
      holdCamera(umer, vcam, sw > 0.5 ? head : ahead);
      faceUpdate(umer, t, (t > 9.1 && t < 13.0) || (t > 14.8 && t < 15.5) ? 1 : 0);
      if (t > 14.6 && t < 15.6) { umer.J.head.rotation.x = 0.12 * Math.sin((t - 14.6) * Math.PI); } // nod
      // ---- DRIVER ----
      applyPlan(driver, c.dP, t);
      const sal = smooth(range(t, 13.3, 13.7)) * (1 - smooth(range(t, 14.6, 15.0)));
      if (sal > 0) poseSalaam(driver, sal);
      faceUpdate(driver, t, t > 13.4 && t < 14.8 ? 1 : 0);
      // driver bag le leta hai (15.4)
      if (t > 15.0 && t < 15.5) poseReach(driver, 'R', 0.5 * smooth(range(t, 15.0, 15.4)), 1);
      // ---- BAG ----
      if (t < 15.45) { bag.setExtend(1); attachBagToHand(umer, 'L', bag); }
      else if (t < 17.6) { bag.setExtend(1 - smooth(range(t, 15.45, 15.8))); setGrip(driver, 'R', 0.9); driver.J.forearmR.rotation.x = -0.3; attachBagToHand(driver, 'R', bag, { lift: true }); }
      else if (t < 18.8) { // lift into bed (arc)
        const u = smooth(range(t, 17.6, 18.7));
        poseReach(driver, 'R', lerp(0.4, 1.25, Math.sin(u * Math.PI * 0.5)), 1); poseReach(driver, 'L', lerp(0.0, 1.25, Math.sin(u * Math.PI * 0.5)), 1);
        driver.J.spine.rotation.x = 0.25 * u;
        const hp = attachBagToHand(driver, 'R', bag, { lift: true, yaw: Math.PI / 2 }).clone();
        const target = c.bedPos;
        const p = new THREE.Vector3().lerpVectors(hp, target, u); p.y = Math.max(lerp(hp.y, target.y, u), 0) + Math.sin(u * Math.PI) * 0.35;
        p.y = Math.max(p.y, u > 0.35 ? 0.88 : 0); bag.group.position.copy(p); bag.group.rotation.set(0, Math.PI / 2, 0);
      } else { bag.setExtend(0); bag.group.position.copy(c.bedPos); bag.group.rotation.set(0, Math.PI / 2, 0); }
      // tailgate close 18.9–19.5
      revo.setTail(1 - smooth(range(t, 18.9, 19.5)));
      if (t > 18.8 && t < 19.6) { poseReach(driver, 'R', 0.9, 1); poseReach(driver, 'L', 0.9, 1); }
      revo.group.position.x = 3.5; revo.roll(0);
      L.follow(new THREE.Vector3(1, 0, 1.5));
    } else {
      // ---- dono Revo ke andar (driver RIGHT seat, Umer LEFT seat), saman bed mein ----
      if (umer.root.parent !== revo.group) { revo.group.add(umer.root); revo.group.add(driver.root); revo.group.add(bag.group); }
      for (const [C, seat] of [[umer, revo.seats.passenger], [driver, revo.seats.driver]]) {
        C.setNeutral(); poseSit(C, 1); C.root.position.set(seat.x - 0.1, 0.43, seat.z); C.root.rotation.y = Math.PI / 2;
        faceUpdate(C, t, 0);
      }
      driver.J.upperArmL.rotation.x = -0.9; driver.J.upperArmR.rotation.x = -0.9; driver.J.forearmL.rotation.x = -0.5; driver.J.forearmR.rotation.x = -0.5; // steering
      poseCarryCam(umer, 1); holdCamera(umer, vcam, null);
      vcam.rotation.set(0, 0, 0);
      bag.group.position.set(-2.15, 0.88, 0); bag.group.rotation.set(0, Math.PI / 2, 0); bag.setExtend(0);
      revo.setTail(0);
      const tt = Math.max(0, t - 20.2); const d = 0.5 * 2.2 * tt * tt;
      revo.group.position.x = 3.5 + d; revo.roll(d);
      L.follow(new THREE.Vector3(revo.group.position.x, 0, 3));
    }
  }
};
