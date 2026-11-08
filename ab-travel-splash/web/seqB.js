// SEQUENCE B (v3) — DHA main road (Khayaban-e-Ittehad) → signal par RIGHT turn → Korangi Road.
// Left-hand traffic. Camera: Umer ka vlog camera (car ke andar selfie / windshield rear) + dashboard par rakha camera.
import * as THREE from 'three';
import { setupSkyAndLight, buildKarachiRoad, road, kerb, building, trees, streetLight } from './lib/env.js';
import { createTraffic, createCar, createBike } from './lib/vehicles.js';
import { brandBillboard, trafficLight, zebra, wallBanner, BRANDS } from './lib/world2.js';
import { shopRow, teaStall, foodCart, autoShowroom, utilityPoles, blueSign } from './lib/karachi.js';
import { createCast, seatInRevo } from './lib/cast.js';
import { createCharacter, LOOKS, faceUpdate, poseSit, poseIdle } from './lib/character.js';
import { plan, applyPlan, speaking, V3 } from './lib/anim.js';
import { modeAt, vlogPose, lensCam, restCam } from './lib/vlog.js';
import { smooth, range, clamp } from './lib/util.js';

export const KHI_LANES = [
  { z: -6.45, dir: 1, speed: 11.5, count: 14, kinds: ['sedan', 'hatch', 'hatch', 'van', 'sedan', 'bus'] },
  { z: -7.75, dir: 1, speed: 9.0, count: 14, kinds: ['bike', 'bike', 'rickshaw', 'bike'] },
  { z: 2.75, dir: -1, speed: 14, count: 12, kinds: ['sedan', 'hatch', 'sedan', 'van'] },
  { z: 6.45, dir: -1, speed: 11, count: 12, kinds: ['sedan', 'hatch', 'van', 'bus', 'rickshaw'] },
  { z: 7.75, dir: -1, speed: 9, count: 12, kinds: ['bike', 'bike', 'rickshaw'] }
];
const LZ = -2.75, XJ = 300, R = 9; // junction (Korangi Road cross road x = XJ, Z ki taraf)
// Revo path: X par 12 m/s → signal par ruk → hara → right arc → Korangi Road par +Z
function revoAt(t) {
  const stopX = XJ - 20;
  if (t < 20) return { x: stopX - 24 - 12 * (20 - t), z: LZ, yaw: 0, v: 12 };
  if (t < 24) { const u = t - 20; return { x: stopX - 24 + 12 * u - 1.5 * u * u, z: LZ, yaw: 0, v: 12 - 3 * u }; }
  if (t < 31) return { x: stopX, z: LZ, yaw: 0, v: 0 };
  const u = t - 31; const s = u < 4 ? 1.25 * u * u : 20 + 10 * (u - 4); // distance after green
  const a0 = XJ + 2.75 - R - stopX; // seedha hissa arc se pehle
  if (s < a0) return { x: stopX + s, z: LZ, yaw: 0, v: 10 };
  const arcL = Math.PI / 2 * R;
  if (s < a0 + arcL) { const th = (s - a0) / R; const cx = XJ + 2.75 - R, cz = LZ + R; return { x: cx + Math.sin(th) * R, z: cz - Math.cos(th) * R, yaw: -th, v: 10 }; }
  return { x: XJ + 2.75, z: LZ + R + (s - a0 - arcL), yaw: -Math.PI / 2, v: 10 };
}
const SUBS = [
  [1.0, 5.0, 'Umer', 'Ye hai DHA ka main road — Khayaban-e-Ittehad.', 'یہ ہے ڈی ایچ اے کا مین روڈ، خیابانِ اتحاد۔'],
  [6.6, 11.0, 'Umer', 'Dekhiye — chai ka dhaba, paratha point, aur Aprox Technology ka banner!', 'دیکھیے، چائے کا ڈھابا، پراٹھا پوائنٹ، اور ایپروکس ٹیکنالوجی کا بینر!'],
  [21.0, 24.4, 'Driver', 'Signal laal hai — yahan se right lekar Korangi Road.', 'سگنل لال ہے، یہاں سے رائٹ لے کر کورنگی روڈ۔'],
  [25.0, 29.0, 'Umer', 'Zebra crossing par log guzar rahe hain — sab apni baari par.', 'زیبرا کراسنگ پر لوگ گزر رہے ہیں، سب اپنی باری پر۔'],
  [41.0, 45.4, 'Umer', 'Korangi Road — yahan workshops aur gaariyon ke showroom hain.', 'کورنگی روڈ، یہاں ورکشاپس اور گاڑیوں کے شوروم ہیں۔'],
  [47.0, 51.0, 'Driver', 'Aage FTC flyover se Shahrah-e-Faisal par chadhenge.', 'آگے ایف ٹی سی فلائی اوور سے شاہراہِ فیصل پر چڑھیں گے۔']
];
const MODE = [[0, 0], [5.4, 1], [12.0, 0], [16.0, 1], [40.4, 0], [46.4, 1]];
export default {
  id: 'B', title: 'DHA Main Road → Korangi Road', exposure: 1.0, subs: SUBS, ambience: 'street', sfx: [[31.2, 'engine']],
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 32, azim: 150, sunI: 3.3, fog: [0xd9d3c4, 80, 520], shadowSize: 45, sunColor: '#fff0d6' });
    const skip = (x, w) => x + w > XJ - 22 && x < XJ + 22;
    buildKarachiRoad(scene, { skip, noBridges: true, brands: (s, x, z, r, i) => { if (Math.abs(x - XJ) > 30) brandBillboard(s, x, z, r, [2, 1, 0, 3, 4][i % 5]); } });
    shopRow(scene, 40, XJ - 25, -11.0, -1, 3); shopRow(scene, 60, XJ - 25, 11.0, 1, 4);
    const ts = teaStall(scene, 150, -10.4, Math.PI); foodCart(scene, 180, -9.6, Math.PI, ['Paratha Roll', 'پراٹھا رول']); foodCart(scene, 228, 9.6, 0, ['Bun Kabab', 'بن کباب']);
    utilityPoles(scene, 0, XJ - 20, -12.6);
    // Korangi Road: cross road Z ki taraf (x = XJ), dual carriageway
    const K = new THREE.Group(); K.rotation.y = -Math.PI / 2; K.position.set(XJ, 0, 300); scene.add(K); // local +X → world +Z
    road(K, { length: 620, width: 7.4, z: -4.6, laneLines: [0] }); road(K, { length: 620, width: 7.4, z: 4.6, laneLines: [0] });
    K.add(new THREE.Mesh(new THREE.BoxGeometry(620, 0.25, 1.4), new THREE.MeshStandardMaterial({ color: '#5f7d3a' }))); K.children[K.children.length - 1].position.y = 0.12;
    kerb(K, { length: 620, z: -8.35, w: 0.14, h: 0.22 }); kerb(K, { length: 620, z: 8.35, w: 0.14, h: 0.22 });
    shopRow(K, -140, 250, -11.0, -1, 7); shopRow(K, -140, 100, 11.0, 1, 8);
    autoShowroom(K, 170, 11.5, 1);
    for (let i = 0; i < 8; i++) building(K, -200 + i * 60, -32, 22, 14, 10 + (i % 3) * 6, 500 + i);
    utilityPoles(K, -250, 300, 12.8);
    brandBillboard(K, 40, 12, Math.PI - 0.5, 1); brandBillboard(K, 220, -12, 0.5, 2);
    // junction: signal, zebra, stop line
    const tl = trafficLight(scene, XJ - 12, -9.6, 0, 6.2); zebra(scene, XJ - 15.5, 0, 17.5, false, 0.5, 3.2);
    blueSign(scene, XJ - 60, -9.8, Math.PI / 2 * 0 + -Math.PI / 2, ['Korangi Road  →', 'Shahrah-e-Faisal  ↑'], 8);
    const traffic = createTraffic(scene, { lanes: KHI_LANES, seed: 21 });
    const ktraffic = createTraffic(K, { lanes: KHI_LANES.map(l => ({ ...l, count: Math.round(l.count * 0.7) })), seed: 22 });
    // signal par khadi gaariyan (static), cross traffic Korangi par chalti rehti hai (hara unke liye)
    const queued = []; for (const [x, z, k] of [[XJ - 21.5, -6.45, 'sedan'], [XJ - 28, -6.45, 'van'], [XJ - 18.4, -7.7, 'bike'], [XJ - 19.6, -7.95, 'bike'], [XJ - 27, LZ, 'hatch']]) { const v = k === 'bike' ? createBike(x | 0) : createCar(k, (x * 3) | 0); v.group.position.set(x, 0, z); scene.add(v.group); queued.push(v); }
    // chai stall par baithe log
    const sitters = [LOOKS.driver, LOOKS.passengerM, LOOKS.loungePassenger].map((lk, i) => { const p = createCharacter({ ...lk, cameraBag: false, backpack: null }, 800 + i); p.root.position.set(150 - 1.5 + i * 1.1, 0.07, -12.4); p.root.rotation.y = Math.PI; scene.add(p.root); return p; });
    const peds = []; const looks = [LOOKS.passengerF, LOOKS.youngPassenger, LOOKS.businessTraveller, LOOKS.ammi, LOOKS.passengerM];
    for (let i = 0; i < 5; i++) { const p = createCharacter({ ...looks[i], cameraBag: false }, 820 + i); scene.add(p.root); const d = i % 2 ? 1 : -1; const x = XJ - 16 + (i % 3) * 0.6; peds.push({ C: p, P: plan(p, [x, d * -10.5], d > 0 ? 0 : Math.PI, [{ at: 24.6 + i * 0.7, to: [x, d * 10.5] }]) }); }
    const c = createCast(scene);
    return { L, K, tl, traffic, ktraffic, queued, sitters, peds, ...c };
  },
  shots: [
    { id: 'B01', dur: 5.4, desc: 'SELFIE car mein: DHA main road', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 78, shake: 1.2 }); } },
    { id: 'B02', dur: 6.6, desc: 'REAR windshield/side: dukaanen, chai dhaba, banners', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 5.4, { fov: 78, shake: 1.2 }); } },
    { id: 'B03', dur: 4.0, desc: 'SELFIE', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 12, { fov: 78, shake: 1.0 }); } },
    { id: 'B04', dur: 24.4, desc: 'REAR windshield: signal laal, zebra crossing, hara → RIGHT turn Korangi Road', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 16, { fov: 80, shake: 0.9 }); } },
    { id: 'B05', dur: 6.0, desc: 'SELFIE Korangi Road', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 40.4, { fov: 78, shake: 1.2 }); } },
    { id: 'B06', dur: 6.0, desc: 'REAR: Korangi Road — workshops, auto showroom', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 46.4, { fov: 78, shake: 1.2 }); } }
  ],
  update(t, c, cam, shot) {
    const { revo, umer, driver, vcam } = c;
    const p = revoAt(t); revo.group.position.set(p.x, 0, p.z); revo.group.rotation.y = p.yaw; revo.roll(p.x + p.z);
    c.traffic.update(t, Math.min(p.x, XJ - 40)); c.ktraffic.update(t, p.z - 300);
    const atSig = t >= 18 && t < 34;
    for (const it of c.traffic.items) it.v.group.visible = !(atSig && Math.abs(it.v.group.position.x - XJ) < 150);
    // Korangi Road traffic: Revo ke apne lane (local z = -4.6±) mein koi na ho jab wo mur rahi ho
    for (const it of c.ktraffic.items) { const wz = it.v.group.position.x + 300; it.v.group.visible = !(t > 30 && t < 45 && Math.abs(wz - (p.z)) < 40 && it.ln.dir > 0); }
    c.queued.forEach(q => q.group.visible = atSig);
    c.tl.set(t < 30.6 ? 'red' : 'green');
    for (const pd of c.peds) { pd.C.root.visible = t > 24 && t < 33; if (pd.C.root.visible) applyPlan(pd.C, pd.P, t); }
    for (const s of c.sitters) { s.setNeutral(); poseSit(s, 1); s.J.forearmR.rotation.x = -1.6 + 0.2 * Math.sin(t + s.root.id); faceUpdate(s, t, 0); }
    seatInRevo(c, t, {});
    revo.group.updateMatrixWorld(true);
    const m = modeAt(MODE, t);
    const ahead = V3(16, 1.3, t > 5.4 && t < 12 ? -10 : 0).applyMatrix4(revo.group.matrixWorld);
    vlogPose(umer, vcam, m, ahead, t);
    faceUpdate(umer, t, speaking(SUBS, t, 'Umer')); faceUpdate(driver, t, speaking(SUBS, t, 'Driver'));
    c.L.follow(new THREE.Vector3(p.x, 0, p.z));
  }
};
