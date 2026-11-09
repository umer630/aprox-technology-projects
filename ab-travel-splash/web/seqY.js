// SEQUENCE Y — Roadside workshop: mechanic radiator pipe badalta hai, Umer pareshan, theek ho kar rawana
import * as THREE from 'three';
import { setupSkyAndLight, ground, road, kerb, trees, building, streetLight } from './lib/env.js';
import { buildWorkshop, brandBillboard } from './lib/world2.js';
import { createCast, seatInRevo } from './lib/cast.js';
import { createCharacter, LOOKS, poseWork, poseWatch, poseWorried, poseCarryCam, poseReach, poseIdle, faceUpdate } from './lib/character.js';
import { createCar } from './lib/vehicles.js';
import { plan, applyPlan, holdCamera, camLerp, handheld, speaking, V3 } from './lib/anim.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
const MODE = [[0, 1], [7.0, 1], [12.4, 0], [17.0, 1], [22.0, 0], [33.0, 1], [41.0, 0], [43.4, 1]];
import { mat, mesh, box, smooth, range, rng } from './lib/util.js';

const SUBS = [
  [7.6, 11.6, 'Umer', 'Ustad ji, jaldi kijiye please — meri flight ka time ho raha hai!', 'استاد جی، جلدی کیجیے پلیز، میری فلائٹ کا ٹائم ہو رہا ہے!'],
  [12.2, 16.8, 'Mechanic', 'Bas paanch minute sahib. Radiator ka pipe leak tha — naya laga raha hoon.', 'بس پانچ منٹ صاحب۔ ریڈی ایٹر کا پائپ لیک تھا، نیا لگا رہا ہوں۔'],
  [21.0, 25.0, 'Umer', 'Dosto, sach mein tension ho rahi hai... ghari dekhte reh jao!', 'دوستو، سچ میں ٹینشن ہو رہی ہے... گھڑی دیکھتے رہ جاؤ!'],
  [26.0, 29.4, 'Driver', 'Umer bhai, waqt hai abhi — pareshan na hon.', 'عمر بھائی، وقت ہے ابھی، پریشان نہ ہوں۔'],
  [33.6, 36.4, 'Mechanic', 'Lo ji, gaari bilkul theek!', 'لو جی، گاڑی بالکل ٹھیک!'],
  [36.8, 39.6, 'Umer', 'Shukriya ustad ji! Kitne paise?', 'شکریہ استاد جی! کتنے پیسے؟'],
  [39.8, 41.8, 'Mechanic', 'Bas aath sau rupay.', 'بس آٹھ سو روپے۔'],
  [42.0, 45.0, 'Umer', 'Yeh lijiye. Chalo Rashid Bhai, jaldi airport!', 'یہ لیجیے۔ چلو راشد بھائی، جلدی ایئرپورٹ!']
];
export default {
  id: 'Y', title: 'Workshop — Auto Workshop', subs: SUBS, ambience: 'workshop', sfx: [[13.0, 'wrench'], [33.0, 'hood'], [44.0, 'engine']],
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 40, azim: 160, sunI: 3.2, fog: [0xd9d0bd, 60, 400], shadowSize: 30 });
    ground(scene, 1500, '#a39780');
    road(scene, { length: 600, width: 8, z: 0, laneLines: [0] }); kerb(scene, { length: 600, z: -4.1, h: 0.15, w: 0.15 }); kerb(scene, { length: 600, z: 4.1, h: 0.15, w: 0.15 });
    scene.add(box(600, 0.06, 9, mat('#8a8070', 1), 0, 0.03, -9, { cast: false }));
    buildWorkshop(scene, new THREE.Vector3(0, 0, -10));
    const r = rng(5); for (let i = 0; i < 12; i++) { const x = -110 + i * 20; if (Math.abs(x) < 12) continue; building(scene, x, -18, 14, 10, 5 + r() * 9, 900 + i); building(scene, x + 6, 16, 14, 10, 6 + r() * 12, 950 + i); }
    trees(scene, [[-20, -6], [18, -6], [-40, 6], [30, 6]], { seed: 8 });
    for (const x of [-30, 30]) streetLight(scene, x, -4.6, 1, 8);
    brandBillboard(scene, 16, -7, 0.3, 0, 7, 7); brandBillboard(scene, -18, 7, Math.PI - 0.3, 3, 7, 7);
    for (const [x, k] of [[-7, 'hatch'], [8, 'sedan']]) { const v = createCar(k, x * 5 + 77); v.group.position.set(x, 0, -6.4); scene.add(v.group); }
    const c = createCast(scene);
    const mech = createCharacter({ ...LOOKS.mechanic, cameraBag: false }, 40); scene.add(mech.root);
    const pace = plan(c.umer, [-0.5, -3.0], Math.PI / 2, [{ at: 18.0, to: [-4.0, -3.2] }, { at: 21.4, to: [1.0, -3.2] }, { at: 26.2, to: [-2.5, -3.0] }]);
    const wrench = box(0.03, 0.22, 0.015, mat('#aab0b6', 0.3, 0.9), 0, 0, 0);
    return { L, mech, pace, wrench, ...c };
  },
  shots: [
    { id: 'Y01', dur: 7.0, desc: 'Revo dheere dheere workshop par pohanchti hai', selfie: true,
      cam(t, c, cam) { lensCam(c.vcam, cam, t + 0, { fov: 76 }); } },
    { id: 'Y02', dur: 11.0, desc: 'Mechanic bonnet ke andar kaam karta hai — Umer jaldi ka kehta hai', selfie: true,
      cam(t, c, cam) { lensCam(c.vcam, cam, t + 7, { fov: 76 }); } },
    { id: 'Y03', dur: 15.0, desc: 'Umer idhar udhar chakkar lagata hai, ghari dekhta hai', selfie: true,
      cam(t, c, cam) { lensCam(c.vcam, cam, t + 18, { fov: 76 }); } },
    { id: 'Y04', dur: 12.0, desc: 'Gaari theek, paise, rawangi', selfie: true,
      cam(t, c, cam) { lensCam(c.vcam, cam, t + 33, { fov: 76 }); } }
  ],
  update(t, c, cam, shot) {
    const { revo, umer, driver, mech, vcam } = c; const scene = revo.group.parent;
    // Revo: aati hai (0–6), workshop ke saamne khadi (6–43), phir rawana
    let x = t < 6 ? -40 + 40 * (1 - Math.pow(1 - t / 6, 2)) : 0; let z = -6.2;
    if (t > 43) { const u = t - 43; x = 1.2 * u * u; }
    revo.group.position.set(x, 0, z); revo.roll(x); revo.setHood(t < 7 ? 0 : t < 33 ? 1 : 1 - smooth(range(t, 33, 34)));
    mech.setNeutral(); poseIdle(mech, t);
    mech.root.position.set(3.4, 0, -6.2); mech.root.rotation.y = -Math.PI / 2;
    if (t > 7.5 && t < 33) { poseWork(mech, t, 1); }
    if (t > 37 && t < 44) { mech.root.position.set(1.0, 0, -3.2); mech.root.rotation.y = Math.PI * 0.8; if (t > 41 && t < 43) poseReach(mech, 'R', 0.9, 1); }
    faceUpdate(mech, t, speaking(SUBS, t, 'Mechanic'));
    if (t < 7 || t > 43) { seatInRevo(c, t); revo.group.updateMatrixWorld(true); vlogPose(umer, vcam, modeAt(MODE, t), V3(14, 1.2, 0).applyMatrix4(revo.group.matrixWorld), t); }
    else {
      if (umer.root.parent !== scene) scene.add(umer.root);
      if (driver.root.parent !== scene) scene.add(driver.root);
      umer.setNeutral(); driver.setNeutral(); poseIdle(driver, t);
      if (t < 18) { umer.root.position.set(1.6, 0, -3.4); umer.root.rotation.y = Math.PI * 0.9; poseIdle(umer, t); }
      else if (t < 33) applyPlan(umer, c.pace, t);
      else { umer.root.position.set(-0.2, 0, -3.1); umer.root.rotation.y = Math.PI / 2 + 0.3; poseIdle(umer, t); }
      poseCarryCam(umer, 1);
      if (t > 7.6 && t < 11.6) poseWorried(umer, t, 0.6);
      if (t > 21 && t < 26) poseWatch(umer, 1);
      if (t > 41.5 && t < 43) poseReach(umer, 'L', 0.9, 1);
      vlogPose(umer, vcam, modeAt(MODE, t), V3(2.4, 1.2, -6.2), t);
      driver.root.position.set(-3.6, 0, -4.2); driver.root.rotation.y = 0.8;
      faceUpdate(umer, t, speaking(SUBS, t, 'Umer')); faceUpdate(driver, t, speaking(SUBS, t, 'Driver'));
    }
    c.L.follow(new THREE.Vector3(0, 0, -5));
  }
};
