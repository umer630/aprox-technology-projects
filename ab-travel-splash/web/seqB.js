// SEQUENCE B — Karachi shahrah: LEFT-hand traffic, brand banners, signal + zebra crossing, railway par train
import * as THREE from 'three';
import { setupSkyAndLight, buildKarachiRoad } from './lib/env.js';
import { createTraffic, createCar, createBike } from './lib/vehicles.js';
import { brandBillboard, trafficLight, zebra, railway, createTrain } from './lib/world2.js';
import { createCast, seatInRevo, selfieCam } from './lib/cast.js';
import { createCharacter, LOOKS, faceUpdate } from './lib/character.js';
import { plan, applyPlan, camLerp, speaking, V3 } from './lib/anim.js';
import { smooth, range } from './lib/util.js';

export const KHI_LANES = [
  { z: -6.45, dir: 1, speed: 11.5, count: 16, kinds: ['sedan', 'hatch', 'hatch', 'van', 'sedan', 'bus'] },
  { z: -7.75, dir: 1, speed: 9.0, count: 18, kinds: ['bike', 'bike', 'rickshaw', 'bike'] },
  { z: 2.75, dir: -1, speed: 15, count: 14, kinds: ['sedan', 'hatch', 'sedan', 'van'] },
  { z: 6.45, dir: -1, speed: 11, count: 14, kinds: ['sedan', 'hatch', 'van', 'bus', 'rickshaw'] },
  { z: 7.75, dir: -1, speed: 9, count: 14, kinds: ['bike', 'bike', 'rickshaw'] }
];
export const LANE_Z = -2.75;
export const RAIL_Z = -17;
export function buildKarachiScene(scene, renderer, seed = 12) {
  const L = setupSkyAndLight(scene, renderer, { elev: 30, azim: 150, sunI: 3.3, fog: [0xd9d3c4, 80, 520], shadowSize: 45, sunColor: '#fff0d6' });
  buildKarachiRoad(scene, { railway: true, brands: (s, x, z, r, i) => brandBillboard(s, x, z, r, i) });
  railway(scene, RAIL_Z, 1400);
  const train = createTrain(scene, 7); train.group.position.z = RAIL_Z;
  const traffic = createTraffic(scene, { lanes: KHI_LANES, seed });
  return { L, traffic, train };
}
const XS = 241; // signal stop-line
function revoX(t) {
  if (t < 14.5) return 14 * t;
  if (t < 19.5) { const u = t - 14.5; return 203 + 14 * u - 1.4 * u * u; }
  if (t < 26) return 238;
  const u = t - 26; return u < 4 ? 238 + 1.5 * u * u : 262 + 12 * (u - 4);
}
const SUBS = [
  [6.0, 9.2, 'Umer', 'Karachi ki subah — har taraf rush hi rush!', 'کراچی کی صبح، ہر طرف رش ہی رش!'],
  [10.0, 14.2, 'Umer', 'Dekhiye dosto, Karachi mein sab apni left side par chalte hain.', 'دیکھیے دوستو، کراچی میں سب اپنی لیفٹ سائیڈ پر چلتے ہیں۔'],
  [17.0, 20.4, 'Driver', 'Signal laal hai, Umer bhai — zara rukte hain.', 'سگنل لال ہے عمر بھائی، ذرا رکتے ہیں۔'],
  [20.8, 24.6, 'Umer', 'Zebra crossing par log guzar rahe hain — bilkul theek!', 'زیبرا کراسنگ پر لوگ گزر رہے ہیں، بالکل ٹھیک!'],
  [29.0, 33.0, 'Umer', 'Woh dekhiye — Karachi Circular Railway ki train!', 'وہ دیکھیے، کراچی سرکلر ریلوے کی ٹرین!'],
  [37.6, 42.4, 'Umer', 'Har taraf Aprox AI, Aprox Technology aur Next Group ke banners!', 'ہر طرف ایپروکس اے آئی، ایپروکس ٹیکنالوجی اور نیکسٹ گروپ کے بینرز!']
];
export default {
  id: 'B', title: 'Karachi — Shahrah par safar', subs: SUBS, ambience: 'street', sfx: [[29.0, 'train']],
  build(scene, renderer) {
    const k = buildKarachiScene(scene, renderer, 12);
    const c = createCast(scene);
    const tl = trafficLight(scene, XS + 2, -9.6, 0, 6.2); const tl2 = trafficLight(scene, XS + 6, 9.6, Math.PI, 6.2);
    zebra(scene, XS + 4.5, 0, 17.5, false, 0.5, 3.2);
    const stopLine = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 7.2), new THREE.MeshStandardMaterial({ color: '#eee' })); stopLine.rotation.x = -Math.PI / 2; stopLine.position.set(XS + 2.4, 0.013, -4.6); scene.add(stopLine);
    // signal par ruki hui gaariyan (static, wheels band)
    const queued = [];
    for (const [x, z, k2, rot] of [[XS - 3.5, -6.45, 'sedan', 0], [XS - 9.5, -6.45, 'van', 0], [XS - 8.6, LANE_Z, 'hatch', 0], [XS - 1.2, -7.7, 'bike', 0], [XS - 3.2, -7.9, 'bike', 0], [XS + 11, 2.75, 'sedan', Math.PI], [XS + 17, 6.45, 'bus', Math.PI]]) {
      const v = k2 === 'bike' ? createBike(Math.floor(x)) : createCar(k2, Math.floor(x * 3)); v.group.position.set(x, 0, z); v.group.rotation.y = rot; scene.add(v.group); queued.push(v);
    }
    // zebra par paidal log
    const peds = []; const looks = [LOOKS.driver, { ...LOOKS.agent, vest: null, shirt: '#5a7a9a' }, LOOKS.friend1, LOOKS.ammi, LOOKS.friend2, { ...LOOKS.driver, shirt: '#9fb1c2', pants: '#9fb1c2' }];
    for (let i = 0; i < 6; i++) { const p = createCharacter({ ...looks[i], cameraBag: false }, 300 + i); scene.add(p.root); const dir = i % 2 ? 1 : -1; const x = XS + 3.6 + (i % 3) * 0.7;
      peds.push({ C: p, P: plan(p, [x, dir * -10.5], dir > 0 ? 0 : Math.PI, [{ at: 17.4 + i * 0.6, to: [x, dir * 10.5] }]) }); }
    return { ...k, ...c, tl, tl2, queued, peds };
  },
  shots: [
    { id: 'B01', dur: 5.0, desc: 'Aerial crane: Revo left carriageway par, railway line saath',
      cam(t, c, cam) { const x = c.revo.group.position.x; camLerp(cam, V3(x - 42, 26, 22), V3(x - 22, 12, 12), V3(x + 10, 0, -6), V3(x + 4, 0.8, -4), t / 5, 44); } },
    { id: 'B02', dur: 4.5, desc: 'Side tracking — wheels, driver RIGHT seat',
      cam(t, c, cam) { const x = c.revo.group.position.x; cam.position.set(x + 1.2 - t * 0.5, 1.15, LANE_Z - 7.2); cam.lookAt(x + 0.4, 1.0, LANE_Z); cam.fov = 38; } },
    { id: 'B03', dur: 5.0, desc: 'Andar se selfie', selfie: true, cam(t, c, cam) { selfieCam(c, cam, t, { fov: 74, shake: 1.4 }); } },
    { id: 'B04', dur: 13.5, desc: 'Laal signal: Revo stop line par, zebra par log guzarte hain, phir hara',
      cam(t, c, cam) { camLerp(cam, V3(XS + 16, 4.2, -12), V3(XS + 14, 3.6, -11), V3(XS - 2, 1.0, -3), V3(XS + 2, 1.2, -2), t / 13.5, 46); } },
    { id: 'B05', dur: 9.0, desc: 'Railway: Circular Railway ki train road ke saath daudti hai',
      cam(t, c, cam) { const tx = c.train.group.position.x; cam.position.set(tx + 30, 3.2, RAIL_Z - 10); cam.lookAt(tx - 10, 2.4, -9); cam.fov = 50; } },
    { id: 'B06', dur: 8.0, desc: 'Brand banners montage — Aprox AI, Aprox Attendant, Aprox Technology, Next Group',
      cam(t, c, cam) { const x = c.revo.group.position.x; camLerp(cam, V3(x - 8, 1.7, -8.9), V3(x - 4, 1.9, -8.9), V3(x + 34, 10, -11.5), V3(x + 46, 10, 11.5), t / 8, 50); } }
  ],
  update(t, c, cam, shot) {
    const x = revoX(t); c.revo.group.position.set(x, 0, LANE_Z); c.revo.roll(x);
    c.traffic.update(t, x);
    const atSignal = t >= 14.5 && t < 28;
    for (const it of c.traffic.items) if (atSignal && Math.abs(it.v.group.position.x - XS) < 160) it.v.group.visible = false; else it.v.group.visible = true;
    c.queued.forEach(q => q.group.visible = atSignal);
    const state = t < 25.5 ? 'red' : 'green'; c.tl.set(state); c.tl2.set(state);
    for (const p of c.peds) { p.C.root.visible = atSignal; if (atSignal) { applyPlan(p.C, p.P, t); } }
    const tx = 170 + 25 * (t - 28); c.train.update(t < 28 ? -900 : tx, tx);
    seatInRevo(c, t, { selfie: shot.id === 'B03' ? 1 : 0, talk: speaking(SUBS, t, 'Umer') });
    faceUpdate(c.driver, t, speaking(SUBS, t, 'Driver'));
    c.L.follow(new THREE.Vector3(x, 0, -4));
  }
};
