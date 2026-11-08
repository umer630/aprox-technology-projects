// SEQUENCE R (v3) — Shahrah-e-Faisal (Karsaz/Drigh Road) → Star Gate par LEFT turn (left-hand traffic: crossing nahi) → Airport Road
import * as THREE from 'three';
import { buildKarachiScene, LANE_Z, blueSign, starGate } from './lib/karachi.js';
import { road, kerb, trees, palms } from './lib/env.js';
import { createTraffic } from './lib/vehicles.js';
import { brandBillboard } from './lib/world2.js';
import { createCast, seatInRevo } from './lib/cast.js';
import { faceUpdate } from './lib/character.js';
import { speaking, V3 } from './lib/anim.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';

const XS = 300, R = 10, XG = XS + R + 2.75;
function revoAt(t) {
  if (t < 16) return { x: XS - 12 * (16 - t), z: LANE_Z, yaw: 0 };
  const s = (t - 16) * 9; const arc = Math.PI / 2 * R;
  if (s < arc) { const th = s / R; return { x: XS + Math.sin(th) * R, z: LANE_Z - R + Math.cos(th) * R, yaw: th }; }
  return { x: XS + R, z: LANE_Z - R - (s - arc) * 1.3, yaw: Math.PI / 2 };
}
const SUBS = [
  [1.0, 6.4, 'Umer', 'Dosto, gaari theek ho gayi! Ab Shahrah-e-Faisal par aage — Karsaz aur Drigh Road se.', 'دوستو، گاڑی ٹھیک ہو گئی! اب شاہراہِ فیصل پر آگے، کارساز اور ڈرگ روڈ سے۔'],
  [8.0, 11.6, 'Driver', 'Woh dekhiye sign — Jinnah International Airport, Star Gate se left.', 'وہ دیکھیے سائن، جناح انٹرنیشنل ایئرپورٹ، اسٹار گیٹ سے لیفٹ۔'],
  [25.4, 30.0, 'Umer', 'Ye raha Star Gate! Ab Airport Road — airport bilkul qareeb hai.', 'یہ رہا اسٹار گیٹ! اب ایئرپورٹ روڈ، ایئرپورٹ بالکل قریب ہے۔']
];
const MODE = [[0, 0], [7.0, 1], [25.0, 0], [30.6, 1]];
export default {
  id: 'R', title: 'Shahrah-e-Faisal → Star Gate', subs: SUBS, ambience: 'street', exposure: 1.0,
  build(scene, renderer) {
    const k = buildKarachiScene(scene, renderer, 44);
    const A = new THREE.Group(); A.rotation.y = Math.PI / 2; A.position.set(XG, 0, -310); scene.add(A); // local +X → world -Z
    road(A, { length: 600, width: 7.4, z: -4.6, laneLines: [0] }); road(A, { length: 600, width: 7.4, z: 4.6, laneLines: [0] });
    kerb(A, { length: 600, z: -8.35, w: 0.14, h: 0.22 }); kerb(A, { length: 600, z: 8.35, w: 0.14, h: 0.22 });
    const pal = []; for (let x = -280; x < 290; x += 14) { pal.push([x, -11]); pal.push([x + 7, 11]); } palms(A, pal);
    const sg = starGate(scene, XG, -70); sg.rotation.y = Math.PI / 2;
    blueSign(scene, XS - 70, -9.8, -Math.PI / 2, ['Jinnah Int\'l Airport  ←', 'Star Gate', 'Drigh Road  ↑'], 9);
    blueSign(scene, XG - 9.8, -150, Math.PI, ['Jinnah International', 'Airport  ↑'], 8);
    brandBillboard(scene, XG + 14, -120, Math.PI / 2, 0); brandBillboard(scene, XG - 14, -220, -Math.PI / 2, 1);
    const atraffic = createTraffic(A, { lanes: [{ z: 4.6, dir: -1, speed: 12, count: 12, kinds: ['sedan', 'hatch', 'van'] }, { z: -6.2, dir: 1, speed: 10, count: 8, kinds: ['sedan', 'van', 'bus'] }], seed: 47 });
    const c = createCast(scene);
    return { ...k, A, atraffic, ...c };
  },
  shots: [
    { id: 'R01', dur: 7.0, desc: 'SELFIE: gaari theek, Shahrah-e-Faisal', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 78, shake: 1.3 }); } },
    { id: 'R02', dur: 18.0, desc: 'REAR windshield: airport sign → Star Gate par LEFT turn → Airport Road', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 7, { fov: 80, shake: 1.0 }); } },
    { id: 'R03', dur: 5.6, desc: 'SELFIE: Star Gate', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 25, { fov: 78 }); } },
    { id: 'R04', dur: 6.0, desc: 'REAR: Airport Road, palm trees', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 30.6, { fov: 80 }); } }
  ],
  update(t, c, cam, shot) {
    const { revo, umer, driver, vcam } = c;
    const p = revoAt(t); revo.group.position.set(p.x, 0, p.z); revo.group.rotation.y = p.yaw; revo.roll(p.x - p.z);
    c.traffic.update(t, Math.min(p.x, XS)); c.train.update(-900, 0);
    for (const it of c.traffic.items) it.v.group.visible = !(t > 12 && it.ln.z < -5 && Math.abs(it.v.group.position.x - XS) < 30);
    c.atraffic.update(t, -(p.z + 310) * -1 > 0 ? -(p.z) - 310 : 0);
    for (const it of c.atraffic.items) { const wz = -310 - it.v.group.position.x; it.v.group.visible = !(it.ln.dir > 0 && Math.abs(wz - p.z) < 30); }
    seatInRevo(c, t, {});
    revo.group.updateMatrixWorld(true);
    vlogPose(umer, vcam, modeAt(MODE, t), V3(16, 1.3, 0).applyMatrix4(revo.group.matrixWorld), t);
    faceUpdate(umer, t, speaking(SUBS, t, 'Umer')); faceUpdate(driver, t, speaking(SUBS, t, 'Driver'));
    c.L.follow(new THREE.Vector3(p.x, 0, p.z));
  }
};
