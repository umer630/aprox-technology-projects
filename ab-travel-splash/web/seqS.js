// SEQUENCE S — Islamabad/Murree Road: elevated Metro Bus, bari imaratein, malls, brand banners, signal + zebra, Margalla
import * as THREE from 'three';
import { setupSkyAndLight, buildKarachiRoad, margallaHills } from './lib/env.js';
import { brandBillboard, trafficLight, zebra, metroGuideway, createMetroBus, buildMall, roadSign, createCorolla } from './lib/world2.js';
import { islamabadTowers } from './lib/env.js';
import { createTraffic, createCar, createBike } from './lib/vehicles.js';
import { createCast, seatInCorolla, dashCam } from './lib/cast.js';
import { createCharacter, LOOKS, faceUpdate } from './lib/character.js';
import { plan, applyPlan, camLerp, speaking, V3 } from './lib/anim.js';
import { smooth, range } from './lib/util.js';
import { lensCam } from './lib/vlog.js';

const LZ = -2.75, XS = 330;
const LANES = [
  { z: -6.45, dir: 1, speed: 11, count: 16, kinds: ['sedan', 'hatch', 'van', 'sedan'] },
  { z: -7.75, dir: 1, speed: 9, count: 12, kinds: ['bike', 'bike', 'rickshaw'] },
  { z: 2.75, dir: -1, speed: 15, count: 14, kinds: ['sedan', 'sedan', 'hatch', 'van'] },
  { z: 6.45, dir: -1, speed: 11, count: 12, kinds: ['sedan', 'van', 'bus'] }
];
const MALLS = [[140, -1, 'Islamabad Square Mall'], [260, 1, 'Mega Mall'], [420, -1, 'Capital Centre']];
const SUBS = [
  [1.0, 5.0, 'Umer', 'Faizabad se Murree Road — upar Metro Bus chal rahi hai!', 'فیض آباد سے مری روڈ، اوپر میٹرو بس چل رہی ہے!'],
  [16.4, 21.0, 'Umer', 'Dekhiye dosto — Islamabad sirf hara bhara nahi, yahan bari bari imaratein aur malls bhi hain!', 'دیکھیے دوستو، اسلام آباد صرف ہرا بھرا نہیں، یہاں بڑی بڑی عمارتیں اور مالز بھی ہیں!'],
  [21.4, 25.0, 'Umer', 'Aur har jagah Aprox AI aur Next Group ke banners!', 'اور ہر جگہ ایپروکس اے آئی اور نیکسٹ گروپ کے بینرز!'],
  [31.0, 34.6, 'Umer', 'Signal laal — zebra crossing par log guzar rahe hain.', 'سگنل لال، زیبرا کراسنگ پر لوگ گزر رہے ہیں۔'],
  [44.6, 49.0, 'Umer', 'Ab Murree Road par Hotel 99 — aaj raat wahin qayam hai!', 'اب مری روڈ پر ہوٹل نائنٹی نائن، آج رات وہیں قیام ہے!']
];
export default {
  id: 'S', title: 'Islamabad — Murree Road', subs: SUBS, ambience: 'street', sfx: [[2.0, 'metro']],
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 34, azim: 165, sunI: 3.3, turbidity: 3.5, rayleigh: 2.6, fog: [0xc6d3dc, 120, 900], shadowSize: 45 });
    const skip = (x, w, side) => MALLS.some(([mx, ms]) => ms === side && x + w > mx - 40 && x < mx + 40);
    buildKarachiRoad(scene, { noMedianTrees: true, metro: true, noBridges: true, skip, brands: (s, x, z, r, i) => brandBillboard(s, x, z, r, i + 1) });
    margallaHills(scene, { z0: -320, height: 600, seed: 11 });
    for (const [mx, ms, nm] of MALLS) buildMall(scene, mx, ms * 36, 70, 40, 46, nm, ms > 0 ? Math.PI : 0, mx);
    islamabadTowers(scene, new THREE.Vector3(560, 0, 60)).rotation.y = Math.PI;
    metroGuideway(scene, 0, 1400, 8.5);
    const buses = [createMetroBus(scene), createMetroBus(scene)]; buses[0].group.position.set(0, 9.3, -2); buses[1].group.position.set(0, 9.3, 2); buses[1].group.rotation.y = Math.PI;
    roadSign(scene, 80, -9.8, -Math.PI / 2, ['Murree Road', 'Faisal Masjid  ↑'], 'مری روڈ', 7, 2.8, 5.5);
    const tl = trafficLight(scene, XS + 2, -9.6, 0, 6.2); const tl2 = trafficLight(scene, XS + 6, 9.6, Math.PI, 6.2);
    zebra(scene, XS + 4.5, 0, 17.5, false, 0.5, 3.2);
    const traffic = createTraffic(scene, { lanes: LANES, seed: 91 });
    const queued = []; for (const [x, z, k] of [[XS - 3.5, -6.45, 'sedan'], [XS - 10, -6.45, 'van'], [XS - 8.4, LZ, 'sedan'], [XS - 1.4, -7.7, 'bike'], [XS + 12, 2.75, 'hatch'], [XS + 18, 6.45, 'sedan']]) { const v = k === 'bike' ? createBike(x | 0) : createCar(k, (x * 7) | 0); v.group.position.set(x, 0, z); if (z > 0) v.group.rotation.y = Math.PI; scene.add(v.group); queued.push(v); }
    const peds = []; const looks = [LOOKS.passengerM, LOOKS.passengerF, LOOKS.youngPassenger, LOOKS.loungePassenger, LOOKS.businessTraveller];
    for (let i = 0; i < 5; i++) { const p = createCharacter({ ...looks[i], cameraBag: false }, 600 + i); scene.add(p.root); const d = i % 2 ? 1 : -1; const x = XS + 3.7 + (i % 3) * 0.6; peds.push({ C: p, P: plan(p, [x, d * -10.5], d > 0 ? 0 : Math.PI, [{ at: 31.6 + i * 0.7, to: [x, d * 10.5] }]) }); }
    const car = createCorolla('#f4f4f2'); scene.add(car.group);
    const c = createCast(scene, { revo: false, driver: false });
    return { L, traffic, buses, tl, tl2, queued, peds, car, ...c };
  },
  shots: [
    { id: 'S01', dur: 8.0, desc: 'DASHBOARD aage: Faizabad se Murree Road, upar elevated Metro Bus', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 76, shake: 0.4 }); } },
    { id: 'S02', dur: 7.0, desc: 'DASHBOARD aage: "Murree Road" green sign', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 8, { fov: 76, shake: 0.4 }); } },
    { id: 'S03', dur: 10.0, desc: 'DASHBOARD Umer ki taraf: driving karte hue baat', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 15, { fov: 80, shake: 0.2 }); } },
    { id: 'S04', dur: 13.5, desc: 'DASHBOARD aage: signal laal, zebra par log, metro bus upar, phir hara', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 25, { fov: 76, shake: 0.3 }); } },
    { id: 'S05', dur: 12.0, desc: 'DASHBOARD aage: malls aur towers ke saamne se, Hotel 99 ki taraf', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 38.5, { fov: 76, shake: 0.4 }); } }
  ],
  update(t, c, cam, shot) {
    // 12 m/s → 30s par brake → stop line (XS−3) → hara hone par aage
    let x; const stopX = XS - 3;
    if (t < 30) x = stopX - 24 - 12 * (30 - t);
    if (t >= 30 && t < 34) { const u = t - 30; x = stopX - 24 + 12 * u - 1.5 * u * u; }
    if (t >= 34 && t < 42) x = stopX;
    if (t >= 42) { const u = t - 42; x = stopX + 1.5 * u * u; }
    c.car.group.position.set(x, 0, LZ); c.car.roll(x);
    c.traffic.update(t, x);
    const atSig = t >= 29.5 && t < 43;
    for (const it of c.traffic.items) it.v.group.visible = !(atSig && Math.abs(it.v.group.position.x - XS) < 160);
    c.queued.forEach(q => q.group.visible = atSig);
    const st = t < 41.5 ? 'red' : 'green'; c.tl.set(st); c.tl2.set(st);
    for (const p of c.peds) { p.C.root.visible = atSig; if (atSig) applyPlan(p.C, p.P, t); }
    c.buses[0].update(-200 + 16 * t, 16 * t); c.buses[1].update(700 - 14 * t, 14 * t);
    seatInCorolla(c, c.car, t, { talk: speaking(SUBS, t, 'Umer'), forward: !(t >= 15 && t < 25) });
    c.L.follow(new THREE.Vector3(x, 0, -4));
  }
};
