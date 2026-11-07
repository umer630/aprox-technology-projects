// SEQUENCE C — Jinnah International Airport, Karachi: drop-off
import * as THREE from 'three';
import { setupSkyAndLight, buildJinnahTerminal } from './lib/env.js';
import { createTraffic, createCar } from './lib/vehicles.js';
import { createCast, seatInRevo } from './lib/cast.js';
import { plan, applyPlan, attachBagToHand, holdCamera, camLerp, handheld, V3 } from './lib/anim.js';
import { createCharacter, LOOKS, poseCarryCam, posePullBag, poseWave, faceUpdate } from './lib/character.js';
import { smooth, range, clamp } from './lib/util.js';

const SW = 0.25; // sidewalk height
export default {
  id: 'C', ambience: 'street', sfx: [[4.2, 'door']], title: 'Jinnah International Airport, Karachi',
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 34, azim: 175, hemiI: 1.3, sunI: 3.3, fog: [0xdcd6c8, 120, 900], shadowSize: 60, sunColor: '#fff3df' });
    const term = buildJinnahTerminal(scene);
    const c = createCast(scene);
    // parked cars at drop-off kerb (left lane) + main road traffic
    const parked = [];
    for (const [x, k] of [[-28, 'sedan'], [-17, 'van'], [16, 'hatch'], [27, 'sedan'], [40, 'van']]) { const v = createCar(k, x + 99); v.group.position.set(x, 0, -18.6); scene.add(v.group); parked.push(v); }
    const traffic = createTraffic(scene, { lanes: [
      { z: 2.6, dir: 1, speed: 10, count: 8, kinds: ['sedan', 'hatch', 'van'] }, { z: 9.4, dir: -1, speed: 11, count: 8, kinds: ['sedan', 'hatch', 'van', 'bus'] }], seed: 33, window: 400 });
    // other travellers (NPC) on sidewalk
    const npcs = [];
    const looks = [{ ...LOOKS.driver, shirt: '#e8e4da', pants: '#e8e4da', grey: false, hair: '#111' }, { ...LOOKS.umer, cameraBag: false, shirt: '#7a2e2e', beardStyle: 'none', pants: '#222' }, { ...LOOKS.agent, vest: null, shirt: '#2f5d50' }];
    for (let i = 0; i < 6; i++) { const n = createCharacter(looks[i % 3], 50 + i); n.root.position.set(-20 + i * 8, SW, -24 - (i % 3) * 1.6); n.root.rotation.y = (i % 2 ? 1 : -1) * 1.4; scene.add(n.root); npcs.push(n); }
    const uP = plan(c.umer, [-1.0, -21.9], Math.PI, [{ at: 5.3, to: [-0.6, -27.4] }, { at: 10.4, to: [0.0, -31.6] }]);
    return { L, term, traffic, npcs, uP, ...c };
  },
  shots: [
    { id: 'C01', dur: 5.0, desc: 'Wide establishing: Jinnah terminal, Revo drop-off lane mein rukti hai',
      cam(t, c, cam) { camLerp(cam, V3(-48, 9, 30), V3(-40, 4.5, 22), V3(0, 16, -40), V3(0, 4, -22), t / 5, 46); } },
    { id: 'C02', dur: 5.4, desc: 'Driver Allah Hafiz kehta hai, Umer terminal ki taraf',
      cam(t, c, cam) { const h = handheld(t, 0.8); camLerp(cam, V3(-1.8, 1.75, -31.0).add(h), V3(-1.5, 1.7, -30.2).add(h), V3(-1.0, 1.2, -21.5), V3(-0.7, 1.25, -23.5), t / 5.4, 44); } }
  ],
  subs: [
    [5.2, 7.2, 'Driver', 'Allah Hafiz Umer bhai, safar mubarak!', 'اللہ حافظ عمر بھائی، سفر مبارک!'],
    [7.2, 8.6, 'Umer', 'Allah Hafiz chacha, shukriya!', 'اللہ حافظ چچا، شکریہ!'],
    [8.8, 10.4, 'Umer', 'Chalein dosto — check-in karte hain.', 'چلیں دوستو، چیک ان کرتے ہیں۔']
  ],
  update(t, c) {
    const { revo, umer, driver, bag, vcam } = c;
    const tf = clamp(t, 0, 4); const x = -20 + 10 * tf - 1.25 * tf * tf; // 10 m/s se 4 s mein ruk jati hai
    revo.group.position.set(x, 0, -18.6); revo.roll(x + 20);
    c.traffic.update(t, 0);
    for (const n of c.npcs) { n.setNeutral(); faceUpdate(n, t, 0); }
    if (t < 5.0) {
      seatInRevo(c, t);
      bag.group.parent !== revo.group && revo.group.add(bag.group); bag.group.position.set(-2.15, 0.88, 0); bag.group.rotation.set(0, Math.PI / 2, 0); bag.setExtend(0);
    } else {
      // Umer sidewalk par (bag driver ne bed se nikaal kar diya — cut ke dauran)
      if (umer.root.parent === revo.group) revo.group.parent.add(umer.root);
      if (driver.root.parent === revo.group) revo.group.parent.add(driver.root);
      if (bag.group.parent === revo.group) revo.group.parent.add(bag.group);
      applyPlan(umer, c.uP, t, SW); poseCarryCam(umer, 1); posePullBag(umer, 1);
      if (t > 7.0 && t < 8.6) { umer.J.head.rotation.y = 0.5; }
      bag.setExtend(1); attachBagToHand(umer, 'L', bag); bag.group.position.y = SW;
      umer.root.updateMatrixWorld(true);
      const fwd = new THREE.Vector3(Math.sin(umer.root.rotation.y), 0, Math.cos(umer.root.rotation.y));
      holdCamera(umer, vcam, umer.root.position.clone().addScaledVector(fwd, 4).setY(1.0));
      faceUpdate(umer, t, (t > 7.2 && t < 10.4) ? 1 : 0);
      // driver bed ke paas sidewalk par, haath hila kar Allah Hafiz
      driver.setNeutral(); driver.root.position.set(-2.6, SW, -21.7); driver.root.rotation.y = Math.PI * 0.8;
      if (t < 8) poseWave(driver, t, 'R', smooth(range(t, 5.1, 5.5)));
      faceUpdate(driver, t, t > 5.2 && t < 7.2 ? 1 : 0);
    }
    c.L.follow(new THREE.Vector3(0, 0, -22));
  }
};
