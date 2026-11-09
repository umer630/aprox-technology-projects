// SEQUENCE A (v3) — DHA ghar ka gate → Rashid Bhai → safed Revo (darwaze khulte/band) → trolley rear seat par →
// Umer passenger seat → DHA gali se rawangi. Camera: Umer ka vlog camera (rear/selfie), andar selfie.
import * as THREE from 'three';
import { createCharacter, LOOKS, poseIdle, posePullBag, poseSalaam, poseReach, poseWave, poseWork, faceUpdate, showCamBag } from './lib/character.js';
import { createSuitcase } from './lib/props.js';
import { createCar } from './lib/vehicles.js';
import { setupSkyAndLight, buildHouseStreet } from './lib/env.js';
import { createCast, seatInRevo } from './lib/cast.js';
import { plan, applyPlan, attachBagToHand, placeWorld, speaking, V3 } from './lib/anim.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
import { smooth, range, lerp } from './lib/util.js';

const RX = 3.5, RZ = 2.8;
const SUBS = [
  [6.4, 10.0, 'Umer', 'Dekhiye — Rashid Bhai aa gaye hain, aur Revo bilkul ready hai!', 'دیکھیے، راشد بھائی آ گئے ہیں، اور ریوو بالکل ریڈی ہے!'],
  [12.4, 14.8, 'Driver', 'Assalam-o-alaikum Umer bhai!', 'السلام علیکم عمر بھائی!'],
  [15.0, 17.6, 'Umer', 'Walaikum Assalam Rashid Bhai! Kaise hain?', 'وعلیکم السلام راشد بھائی! کیسے ہیں؟'],
  [17.8, 19.6, 'Driver', 'Alhamdulillah. Bag peeche rakh dein.', 'الحمدللہ۔ بیگ پیچھے رکھ دیں۔'],
  [26.8, 31.0, 'Umer', 'Chaliye guys, safar shuru! Pehle DHA ki galiyon se nikalenge.', 'چلیے گائز، سفر شروع! پہلے ڈی ایچ اے کی گلیوں سے نکلیں گے۔'],
  [31.6, 34.0, 'Ammi', 'Allah Hafiz beta!', 'اللہ حافظ بیٹا!']
];
const MODE = [[0, 1], [6.0, 0], [12.0, 1], [18.2, 1], [26.0, 0], [33.6, 1]];
export const SEQ_A = {
  id: 'A', title: 'DHA — Ghar se rawangi', subs: SUBS, ambience: 'street', sfx: [[1.6, 'gate'], [19.4, 'door'], [23.4, 'door'], [25.2, 'door'], [29.6, 'engine']],
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 24, azim: 35, sunI: 3.2, hemiI: 0.85, fog: [0xd6dbd8, 60, 400], shadowSize: 22, sunColor: '#ffeccd' });
    const H = buildHouseStreet(scene);
    const c = createCast(scene); // umer, driver, Revo (safed)
    c.revo.group.position.set(RX, 0, RZ); c.revo.setTail(0);
    c.revo.group.remove(c.bag.group); // purana bag nahi — Travel Splash trolley
    const ts = createSuitcase('#111', 'travelsplash'); scene.add(ts.group);
    const ammi = createCharacter({ ...LOOKS.ammi, cameraBag: false }, 5); ammi.root.position.set(-1.3, 0, -1.4); ammi.root.rotation.y = 0.2; scene.add(ammi.root);
    for (const [x, z, k, r] of [[-9, 7.6, 'hatch', Math.PI], [14, 2.9, 'sedan', 0], [-16, 2.9, 'van', 0]]) { const v = createCar(k, x * 7 + 5); v.group.position.set(x, 0, z); v.group.rotation.y = r; scene.add(v.group); }
    const uP = plan(c.umer, [-0.3, -5.0], 0, [{ at: 0.4, to: [-0.3, 0.7] }, { at: 6.0, to: [0.3, 1.2] }, { at: 12.0, face: Math.PI / 2, dur: 0.5 }, { at: 17.8, to: [2.7, 0.95] }, { at: 20.0, face: 0.15, dur: 0.3 }, { at: 23.8, to: [3.75, 1.0] }, { at: 24.8, face: 0.15, dur: 0.4 }]);
    const dP = plan(c.driver, [-0.9, 0.55], -0.4, [{ at: 4.4, to: [1.9, 1.15] }, { at: 7.2, face: -Math.PI / 2, dur: 0.5 }, { at: 19.6, to: [6.6, 1.6] }, { at: 23.4, to: [5.0, 4.3] }]);
    return { L, H, ts, ammi, uP, dP, ...c };
  },
  shots: [
    { id: 'A01', dur: 6.0, desc: 'REAR: Umer trolley ke saath gate ki taraf, Rashid Bhai gate kholte hain', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 74 }); } },
    { id: 'A02', dur: 6.0, desc: 'SELFIE: gate ke bahar, peeche ghar', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 6); } },
    { id: 'A03', dur: 6.2, desc: 'REAR: Rashid Bhai aur safed Revo — salaam', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 12); } },
    { id: 'A04', dur: 7.8, desc: 'REAR: pichla darwaza khulta hai, trolley rear seat par, darwaza band, aage ka darwaza', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 18.2); } },
    { id: 'A05', dur: 7.6, desc: 'SELFIE andar passenger seat se — Revo chal padti hai', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 26, { fov: 78, shake: 0.8 }); } },
    { id: 'A06', dur: 6.4, desc: 'REAR windshield se: DHA ki gali, left side', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 33.6, { fov: 78, shake: 1.0 }); } }
  ],
  update(t, c, cam, shot) {
    const { umer, driver, vcam, ts, revo, H, ammi, L } = c; const scene = revo.group.parent;
    const g = smooth(range(t, 1.4, 3.6)) * 1.45; H.leafL.rotation.y = g; H.leafR.rotation.y = -g;
    ammi.setNeutral(); poseIdle(ammi, t); ammi.root.visible = t > 2; if (t > 30) poseWave(ammi, t, 'R', 1); faceUpdate(ammi, t, speaking(SUBS, t, 'Ammi'));
    // Revo: 30s tak khadi, phir left lane mein aage
    const u = Math.max(0, t - 29.8); const dx = u < 6 ? 0.75 * u * u : 27 + 9 * (u - 6);
    revo.group.position.set(RX + dx, 0, RZ); revo.roll(dx);
    revo.setDoor('RL', smooth(range(t, 19.4, 20.2)) * (1 - smooth(range(t, 22.8, 23.6))));
    revo.setDoor('FL', smooth(range(t, 25.0, 25.8)) * (1 - smooth(range(t, 26.4, 27.2))));
    revo.setDoor('FR', smooth(range(t, 23.6, 24.2)) * (1 - smooth(range(t, 25.0, 25.6))));
    const inCar = t >= 26.0;
    if (!inCar) {
      if (umer.root.parent !== scene) scene.add(umer.root);
      if (driver.root.parent !== scene) scene.add(driver.root);
      umer.setNeutral(); driver.setNeutral(); showCamBag(umer, false);
      applyPlan(umer, c.uP, t); applyPlan(driver, c.dP, t);
      const m = modeAt(MODE, t);
      let ft = null; if (t > 12 && t < 18.2) ft = driver.root.position.clone().setY(1.4); if (t >= 18.2) ft = V3(RX - 0.4, 1.0, RZ);
      vlogPose(umer, vcam, m, ft, t);
      // trolley: left haath → rear seat (20.4–21.8)
      if (t < 21.8 && ts.group.parent !== scene) scene.add(ts.group);
      if (t < 20.4) { posePullBag(umer, 1); ts.setExtend(t < 19.6 ? 1 : 1 - smooth(range(t, 19.6, 20.3))); attachBagToHand(umer, 'L', ts); }
      else if (t < 21.8) { const k = smooth(range(t, 20.4, 21.8)); poseReach(umer, 'L', 1.0, 1); const p0 = attachBagToHand(umer, 'L', ts, { lift: true }).clone(); const seat = V3(-0.45, 0.82, -0.35).applyMatrix4(revo.group.matrixWorld); ts.group.position.lerpVectors(p0, seat, k); ts.group.position.y = Math.max(ts.group.position.y, lerp(0, 0.82, k) + Math.sin(k * Math.PI) * 0.25); ts.group.rotation.set(0, 0, 0); }
      else { if (ts.group.parent !== revo.group) revo.group.add(ts.group); ts.group.position.set(-0.45, 0.82, -0.35); ts.group.rotation.set(0, Math.PI / 2, 0); ts.setExtend(0); }
      if ((t > 19.0 && t < 20.2) || (t > 22.6 && t < 23.6) || (t > 24.8 && t < 25.8)) poseReach(umer, 'L', 1.0, 1);
      // Rashid Bhai: gate dhakelna, salaam
      if (t < 4.2) poseReach(driver, 'R', 1.1, 1), poseReach(driver, 'L', 1.1, 1);
      if (t > 12.2 && t < 15) poseSalaam(driver, 1);
      faceUpdate(umer, t, speaking(SUBS, t, 'Umer')); faceUpdate(driver, t, speaking(SUBS, t, 'Driver'));
    } else {
      if (ts.group.parent !== revo.group) revo.group.add(ts.group);
      ts.group.position.set(-0.45, 0.82, -0.35); ts.group.rotation.set(0, Math.PI / 2, 0); ts.setExtend(0);
      seatInRevo(c, t, {});
      // car ke andar vlog: selfie ↔ windshield
      const m = modeAt(MODE, t);
      revo.group.updateMatrixWorld(true);
      const ahead = V3(14, 1.2, 0).applyMatrix4(revo.group.matrixWorld);
      umer.root.updateMatrixWorld(true);
      vlogPose(umer, vcam, m, ahead, t);
      faceUpdate(umer, t, speaking(SUBS, t, 'Umer')); faceUpdate(driver, t, 0);
    }
    L.follow(new THREE.Vector3(RX + dx * 0.8, 0, 1.5));
  }
};
