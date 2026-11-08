// SEQUENCE Q — Islamabad International Airport exterior → parking → Toyota Corolla Grande 1.8 → rawangi
import * as THREE from 'three';
import { setupSkyAndLight, ground, road, kerb, trees, margallaHills, streetLight } from './lib/env.js';
import { buildIIAPExterior, createCorolla, brandBillboard } from './lib/world2.js';
import { createCar } from './lib/vehicles.js';
import { createCast, seatInCorolla, dashCam } from './lib/cast.js';
import { createCharacter, LOOKS, poseCarryCam, posePullBag, poseReach, poseIdle, faceUpdate } from './lib/character.js';
import { plan, applyPlan, attachBagToHand, holdCamera, placeWorld, camLerp, handheld, speaking, V3 } from './lib/anim.js';
import { mat, mesh, box, smooth, range, rng } from './lib/util.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
const MODE = [[0, 0], [6.6, 1]];

const CAR = new THREE.Vector3(14, 0, 53);
const SUBS = [
  [1.0, 5.0, 'Umer', 'Bahar se dekhiye — Islamabad airport ki lehrati hui chhat!', 'باہر سے دیکھیے، اسلام آباد ایئرپورٹ کی لہراتی ہوئی چھت!'],
  [9.0, 12.6, 'Umer', 'Meri Corolla Grande parking mein khadi hai — chalo!', 'میری کرولا گرینڈی پارکنگ میں کھڑی ہے، چلو!'],
  [21.0, 24.4, 'Umer', 'Bag andar, seat belt laga li — Bismillah!', 'بیگ اندر، سیٹ بیلٹ لگا لی، بسم اللہ!'],
  [29.0, 33.4, 'Umer', 'Ab seedha Murree Road ki taraf — Islamabad ki sair!', 'اب سیدھا مری روڈ کی طرف، اسلام آباد کی سیر!']
];
export default {
  id: 'Q', title: 'Islamabad — Parking aur Corolla', subs: SUBS, ambience: 'street', sfx: [[17.5, 'door'], [23.6, 'door'], [25.0, 'engine']],
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 40, azim: 350, sunI: 3.3, turbidity: 3.5, rayleigh: 2.6, fog: [0xc3d1dc, 200, 2500], shadowSize: 40 });
    ground(scene, 4000, '#86a85a');
    buildIIAPExterior(scene);
    margallaHills(scene, { z0: -500, height: 500, seed: 9 });
    road(scene, { length: 600, width: 10, z: 42, laneLines: [0] }); kerb(scene, { length: 600, z: 36.9, h: 0.2 }); kerb(scene, { length: 600, z: 47.1, h: 0.2 });
    scene.add(box(600, 0.2, 11.6, mat('#d8d4cb', 0.9), 0, 0.1, 31, { cast: false }));
    const lot = mesh(new THREE.PlaneGeometry(160, 50), mat('#55565a', 0.95), { cast: false }); lot.rotation.x = -Math.PI / 2; lot.position.set(0, 0.008, 72); scene.add(lot);
    for (let x = -78; x <= 78; x += 2.8) for (const z of [60, 68.5, 80]) { const l = mesh(new THREE.PlaneGeometry(0.12, 5), mat('#eee', 0.7), { cast: false }); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.012, z); scene.add(l); }
    const r = rng(3); const kinds = ['sedan', 'hatch', 'van', 'sedan'];
    for (let x = -70; x <= 70; x += 2.8) for (const z of [60, 68.5, 80]) { if (r() < 0.35) continue; const v = createCar(kinds[Math.floor(r() * 4)], Math.floor(x * 13 + z)); v.group.position.set(x + 1.4, 0, z); v.group.rotation.y = Math.PI / 2 * (r() < 0.5 ? 1 : -1); scene.add(v.group); }
    trees(scene, [...Array(20)].map((_, i) => [-95 + i * 10, 50]).filter(([x]) => x < -5 || x > 30), { seed: 12, palette: ['#3a6a27', '#4d7f30'] });
    for (let x = -60; x < 80; x += 30) streetLight(scene, x, 50, -1, 9);
    brandBillboard(scene, -40, 50, Math.PI, 1, 8, 9); brandBillboard(scene, 50, 50, Math.PI, 3, 8, 9);
    const car = createCorolla('#f4f4f2'); car.group.position.copy(CAR); car.group.rotation.y = 0; scene.add(car.group);
    const c = createCast(scene, { revo: false, driver: false }); scene.add(c.bag.group);
    const npcs = []; for (let i = 0; i < 6; i++) { const n = createCharacter({ ...[LOOKS.passengerM, LOOKS.passengerF, LOOKS.businessTraveller][i % 3], cameraBag: false }, 500 + i); n.root.position.set(-20 + i * 8, 0.2, 30 + (i % 2) * 2); n.root.rotation.y = i % 2 ? 0.4 : 2.8; scene.add(n.root); npcs.push(n); }
    // Umer: terminal darwaze → crossing → parking → driver door (+Z side, z = 68.5 + 1.5)
    const P1 = plan(c.umer, [0, 26.5], 0, [{ at: 6.5, to: [2, 33] }]);
    const P2 = plan(c.umer, [9.2, 55.6], 1.4, [{ at: 12.2, to: [14.5, 55.0] }, { at: 17.0, face: Math.PI * 0.85, dur: 0.5 }]);
    return { L, car, npcs, P1, P2, ...c };
  },
  shots: [
    { id: 'Q01', dur: 7.0, desc: 'SELFIE: terminal se bahar — peeche IIAP ki lehrati chhat', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 80 }); } },
    { id: 'Q02', dur: 5.0, desc: 'REAR: crossing se parking ki taraf', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 7, { fov: 78 }); } },
    { id: 'Q03', dur: 8.0, desc: 'REAR: Corolla Grande, darwaza khulta hai, bag andar', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 12, { fov: 78 }); } },
    { id: 'Q04', dur: 5.0, desc: 'DASHBOARD par camera (Umer ki taraf): seat belt, Bismillah', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 20, { fov: 80, shake: 0.2 }); } },
    { id: 'Q05', dur: 8.0, desc: 'DASHBOARD camera aage ki taraf: parking se road par', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 25, { fov: 78, shake: 0.4 }); } }
  ],
  update(t, c, cam, shot) {
    const { umer, bag, vcam, car } = c; const scene = car.group.parent;
    for (const n of c.npcs) { n.setNeutral(); poseIdle(n, t); faceUpdate(n, t, 0); }
    car.setDoor(t < 16.8 ? 0 : t < 23 ? smooth(range(t, 16.8, 17.8)) : 1 - smooth(range(t, 23, 23.8)));
    // car motion (t>25): parking se reverse nahi — aage nikal kar road (z 40) par
    let cx = CAR.x, cz = CAR.z, yaw = 0;
    if (t > 25) { const u = t - 25; const d = 0.8 * u * u; cx = CAR.x + d; if (d > 4) { const k = Math.min(1, (d - 4) / 16); cz = CAR.z - 13.5 * smooth(k); yaw = Math.sin(k * Math.PI) * 0.7; } }
    car.group.position.set(cx, 0, cz); car.group.rotation.y = yaw; car.roll(cx);
    if (t < 20) {
      umer.setNeutral(); if (t < 12.0) applyPlan(umer, c.P1, t); else applyPlan(umer, c.P2, t);
      vlogPose(umer, vcam, modeAt(MODE, t), t < 12 ? V3(10, 1.4, 55) : V3(14, 1.1, 53), t);
      if (t < 18.4) { posePullBag(umer, 1); bag.setExtend(1); attachBagToHand(umer, 'L', bag); }
      else { const u = smooth(range(t, 18.4, 19.8)); poseReach(umer, 'L', 1.0, 1); const p0 = attachBagToHand(umer, 'L', bag).clone(); const tgt = new THREE.Vector3(-0.7, 0.55, 0.15).applyMatrix4(car.group.matrixWorld); bag.group.position.lerpVectors(p0, tgt, u); bag.setExtend(1 - u); }
      if (t > 16.8 && t < 18.2) poseReach(umer, 'R', 1.0, 1);
      faceUpdate(umer, t, speaking(SUBS, t, 'Umer'));
    } else {
      seatInCorolla(c, car, t, { talk: speaking(SUBS, t, 'Umer'), forward: t >= 25 });
      if (bag.group.parent !== car.group) car.group.add(bag.group);
      bag.group.position.set(-0.7, 0.55, 0.15); bag.group.rotation.set(0, Math.PI / 2, 0); bag.setExtend(0);
    }
    c.L.follow(new THREE.Vector3(cx, 0, 50));
  }
};
