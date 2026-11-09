// SEQUENCE C (v3) — Jinnah International departure kerb → Rashid Bhai ko Allah Hafiz → entrance par checker:
// "Ticket please" → Umer phone par boarding pass dikhata hai (Aprox AI app) → andar
import * as THREE from 'three';
import { setupSkyAndLight, buildJinnahTerminal } from './lib/env.js';
import { createTraffic, createCar } from './lib/vehicles.js';
import { createCast, seatInRevo } from './lib/cast.js';
import { plan, applyPlan, attachBagToHand, attachToHand, placeWorld, speaking, V3 } from './lib/anim.js';
import { createCharacter, LOOKS, posePullBag, poseWave, poseReach, poseIdle, faceUpdate } from './lib/character.js';
import { createAproxPhone, drawPhoneInset } from './lib/aproxui.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
import { smooth, range, clamp } from './lib/util.js';

const SW = 0.25;
const TICKET = { name: 'UMER', seat: '12A', gate: '5', time: '10:40' };
const SUBS = [
  [5.4, 8.4, 'Driver', 'Allah Hafiz Umer bhai, safar mubarak!', 'اللہ حافظ عمر بھائی، سفر مبارک!'],
  [8.6, 11.0, 'Umer', 'Shukriya Rashid Bhai, Allah Hafiz!', 'شکریہ راشد بھائی، اللہ حافظ!'],
  [17.6, 19.4, 'Checker', 'Ticket please.', 'ٹکٹ پلیز۔'],
  [19.8, 22.4, 'Umer', 'Ji, ye lijiye — mobile par hai.', 'جی، یہ لیجیے، موبائل پر ہے۔'],
  [24.2, 27.0, 'Checker', 'Theek hai, andar tashreef le jayein.', 'ٹھیک ہے، اندر تشریف لے جائیں۔'],
  [27.6, 31.0, 'Umer', 'Ye dekhein — hum airport ke andar aa gaye hain!', 'یہ دیکھیں، ہم ایئرپورٹ کے اندر آ گئے ہیں!']
];
const MODE = [[0, 1], [5.0, 0], [11.4, 1], [27.2, 0]];
export default {
  id: 'C', title: 'Jinnah International — Departures', subs: SUBS, ambience: 'street', exposure: 1.0, sfx: [[4.4, 'door']],
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 34, azim: 175, hemiI: 1.1, sunI: 3.3, fog: [0xdcd6c8, 120, 900], shadowSize: 60, sunColor: '#fff3df' });
    buildJinnahTerminal(scene);
    const c = createCast(scene);
    for (const [x, k] of [[-28, 'sedan'], [-17, 'van'], [16, 'hatch'], [27, 'sedan'], [40, 'van']]) { const v = createCar(k, x + 99); v.group.position.set(x, 0, -18.6); scene.add(v.group); }
    const traffic = createTraffic(scene, { lanes: [{ z: 2.6, dir: 1, speed: 10, count: 8, kinds: ['sedan', 'hatch', 'van'] }, { z: 9.4, dir: -1, speed: 11, count: 8, kinds: ['sedan', 'hatch', 'van', 'bus'] }], seed: 33, window: 400 });
    const npcs = []; const looks = [LOOKS.passengerM, LOOKS.passengerF, LOOKS.businessTraveller, LOOKS.youngPassenger, LOOKS.loungePassenger, LOOKS.technician];
    for (let i = 0; i < 6; i++) { const n = createCharacter({ ...looks[i], cameraBag: false }, 50 + i); n.root.position.set(-20 + i * 8, SW, -24 - (i % 3) * 1.6); n.root.rotation.y = (i % 2 ? 1 : -1) * 1.4; scene.add(n.root); npcs.push(n); }
    const checker = createCharacter({ ...LOOKS.entranceChecker, cameraBag: false }, 61); checker.root.position.set(1.0, SW, -31.4); checker.root.rotation.y = -0.3; scene.add(checker.root);
    const uP = plan(c.umer, [-1.0, -21.9], Math.PI, [{ at: 11.2, to: [-0.1, -29.9] }, { at: 19.0, face: Math.PI - 0.6, dur: 0.4 }, { at: 27.4, face: Math.PI, dur: 0.5 }, { at: 28.0, to: [0.0, -33.4] }]);
    const phone = createAproxPhone({ mode: 'ticket', ticket: TICKET });
    return { L, traffic, npcs, checker, uP, phone, ...c };
  },
  shots: [
    { id: 'C01', dur: 5.0, desc: 'REAR windshield: Jinnah terminal, departure kerb', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 80 }); } },
    { id: 'C02', dur: 6.4, desc: 'SELFIE kerb par: Rashid Bhai ko Allah Hafiz', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 5); } },
    { id: 'C03', dur: 6.2, desc: 'REAR: entrance ki taraf, checker darwaze par', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 11.4); } },
    { id: 'C04', dur: 9.6, desc: 'REAR on checker: "Ticket please" → phone par boarding pass', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 17.6, { fov: 72 }); } },
    { id: 'C05', dur: 4.0, desc: 'SELFIE: airport ke andar ja rahe hain', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 27.2); } }
  ],
  overlay(g, W, H, t, c) { if (t > 20.4 && t < 26.6) drawPhoneInset(g, W, H, c.phone.canvas, Math.min(1, (t - 20.4) / 0.4, (26.6 - t) / 0.4), 'left'); },
  update(t, c) {
    const { revo, umer, driver, bag, vcam, checker, phone } = c; const scene = revo.group.parent;
    const tf = clamp(t, 0, 4); const x = -20 + 10 * tf - 1.25 * tf * tf;
    revo.group.position.set(x, 0, -18.6); revo.roll(x + 20);
    c.traffic.update(t, 0);
    for (const n of c.npcs) { n.setNeutral(); poseIdle(n, t); faceUpdate(n, t, 0); }
    checker.setNeutral(); poseIdle(checker, t); faceUpdate(checker, t, speaking(SUBS, t, 'Checker'));
    phone.group.visible = false;
    if (t < 5.0) {
      seatInRevo(c, t); revo.group.updateMatrixWorld(true);
      if (bag.group.parent !== revo.group) revo.group.add(bag.group); bag.group.position.set(-0.45, 0.82, -0.35); bag.group.rotation.set(0, Math.PI / 2, 0); bag.setExtend(0);
      vlogPose(umer, vcam, modeAt(MODE, t), V3(16, 1.6, -4).applyMatrix4(revo.group.matrixWorld), t);
    } else {
      if (umer.root.parent === revo.group) scene.add(umer.root);
      if (driver.root.parent === revo.group) scene.add(driver.root);
      if (bag.group.parent !== scene) scene.add(bag.group);
      umer.setNeutral(); applyPlan(umer, c.uP, t, SW);
      const holdBag = t < 19.2 || t > 26.8;
      if (holdBag) { posePullBag(umer, 1); bag.setExtend(1); attachBagToHand(umer, 'L', bag); bag.group.position.y = SW; }
      else { bag.setExtend(1); bag.group.position.y = SW; }
      // phone left haath mein checker ki taraf (19.6–26.4)
      if (t > 19.6 && t < 26.4) { poseReach(umer, 'L', 1.25, 1); umer.J.upperArmL.rotation.z = 0.35; phone.group.visible = true; attachToHand(phone.group, umer, 'L', V3(-0.03, -0.12, 0.05)); phone.update(t, {}); checker.root.updateMatrixWorld(true); const hp = new THREE.Vector3(); checker.J.head.getWorldPosition(hp); phone.group.lookAt(hp); poseReach(checker, 'R', 0.6 * smooth(range(t, 21, 21.6)), 1); checker.J.head.rotation.x = 0.3; }
      const cp = new THREE.Vector3(); checker.root.getWorldPosition(cp); cp.y = 1.55;
      vlogPose(umer, vcam, modeAt(MODE, t), t > 17 && t < 27 ? cp : V3(0, 1.8, -40), t);
      faceUpdate(umer, t, speaking(SUBS, t, 'Umer'));
      driver.setNeutral(); driver.root.position.set(-2.6, SW, -21.7); driver.root.rotation.y = Math.PI * 0.8; if (t < 11) poseWave(driver, t, 'R', smooth(range(t, 5.1, 5.5)));
      faceUpdate(driver, t, speaking(SUBS, t, 'Driver'));
    }
    c.L.follow(new THREE.Vector3(0, 0, -24));
  }
};
