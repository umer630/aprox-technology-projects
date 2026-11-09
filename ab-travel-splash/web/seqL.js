// SEQUENCE L (v3) — Islamabad approach Umer ki window (12A) se: 3° glide, Margalla Hills sirf background mein,
// runway alignment, flare, touchdown (runway par — pahariyon par nahi), rollout
import * as THREE from 'three';
import { setupSkyAndLight, buildRunway, margallaHills } from './lib/env.js';
import { createAircraft } from './lib/aircraft.js';
import { buildCabin, cabinPeople, seatX, windowCam } from './lib/cabin.js';
import { createCast } from './lib/cast.js';
import { poseSit, poseReach, faceUpdate } from './lib/character.js';
import { speaking, V3 } from './lib/anim.js';
import { vlogPose, lensCam } from './lib/vlog.js';
import { smooth, range, softSprite } from './lib/util.js';

const ROW = 12, TD = 17.0, VA = 68, DEC = 2.6;
function state(t) {
  const s = t - TD;
  const x = s < 0 ? 150 + VA * s : 150 + VA * s - 0.5 * DEC * s * s;
  let y = s < 0 ? Math.tan(3 * Math.PI / 180) * (150 - x) : 0;
  const flare = smooth(range(t, TD - 2.0, TD)); if (s < 0) y *= (1 - 0.4 * flare);
  const pitch = s < 0 ? 0.035 + 0.06 * flare : 0.095 * (1 - smooth(range(s, 0.4, 2.4)));
  return { x, y, pitch, d: Math.max(0, x - 150) };
}
const SUBS = [
  [0.4, 4.4, 'Pilot', 'Khawateen o hazraat, hum Islamabad mein landing ke liye tayyar hain.', 'خواتین و حضرات، ہم اسلام آباد میں لینڈنگ کے لیے تیار ہیں۔'],
  [5.2, 9.6, 'Umer', 'Dosto, neeche dekhiye — Islamabad! Peeche Margalla Hills.', 'دوستو، نیچے دیکھیے، اسلام آباد! پیچھے مارگلہ ہلز۔'],
  [11.0, 14.0, 'Umer', 'Runway saamne hai... landing gear neeche.', 'رن وے سامنے ہے... لینڈنگ گیئر نیچے۔'],
  [18.0, 20.6, 'Umer', 'Touchdown! Smooth landing!', 'ٹچ ڈاؤن! اسموتھ لینڈنگ!'],
  [22.4, 26.0, 'Umer', 'Alhamdulillah — hum Islamabad pohanch gaye!', 'الحمدللہ، ہم اسلام آباد پہنچ گئے!']
];
export default {
  id: 'L', ambience: 'cabin', sfx: [[0.2, 'ding'], [4.5, 'jet_approach'], [17.0, 'touchdown']], title: 'Islamabad — Landing (Window 12A)', subs: SUBS,
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 26, azim: 210, sunI: 3.2, fog: [0xc6d3dc, 600, 6000], shadowSize: 60, sunColor: '#fff0da' });
    buildRunway(scene, { terrain: 'islamabad' });
    const n0 = scene.children.length; margallaHills(scene, { z0: -1400, height: 520, seed: 5 });
    scene.children.slice(n0).forEach(o => o.traverse(m => { m.castShadow = false; }));
    const ac = createAircraft(); scene.add(ac.group);
    const cab = buildCabin(ac, { passengers: 16, seed: 360 });
    const c = createCast(scene, { revo: false, driver: false }); ac.body.add(c.umer.root);
    const smokeM = new THREE.SpriteMaterial({ map: softSprite('#e8e8e8', 64), transparent: true, depthWrite: false, opacity: 0 });
    const puffs = []; for (let i = 0; i < 8; i++) { const s = new THREE.Sprite(smokeM.clone()); scene.add(s); puffs.push(s); }
    return { L, ac, cab, puffs, ...c };
  },
  shots: [
    { id: 'L01', dur: 4.5, desc: 'SELFIE: captain ka landing announcement', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 76, shake: 0.4 }); } },
    { id: 'L02', dur: 8.5, desc: 'WINDOW: descent, Islamabad neeche, Margalla Hills door background mein', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 4.5, { fov: 70, shake: 0.5 }); } },
    { id: 'L03', dur: 9.0, desc: 'WINDOW: flare, runway par touchdown, rollout', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 13, { fov: 70, shake: 0.8 }); } },
    { id: 'L04', dur: 4.0, desc: 'SELFIE: Alhamdulillah, Islamabad', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 22, { fov: 76, shake: 0.4 }); } }
  ],
  update(t, c) {
    const s = state(t); const { ac, cab, umer, vcam } = c;
    ac.group.position.set(s.x, s.y, 0); ac.pitch(s.pitch); ac.gearDown(smooth(range(t, 9, 12))); ac.rollWheels(s.d); ac.spin(t);
    ac.group.updateMatrixWorld(true);
    cabinPeople(cab, t); faceUpdate(cab.pilot, t, 0);
    umer.setNeutral(); cab.sit(umer, ROW, 'A'); poseSit(umer, 1);
    if (t < 4.5 || t >= 22) vlogPose(umer, vcam, 0, null, t);
    else { poseReach(umer, 'R', 0.9, 1); umer.J.upperArmR.rotation.z = 0.6; umer.J.neck.rotation.y = 0.7; windowCam(ac, cab, vcam, ROW, V3(seatX(ROW) + 1.5, t < 15 ? -2.0 : 0.6, -16)); }
    faceUpdate(umer, t, speaking(SUBS, t, 'Umer'));
    c.puffs.forEach((p, i) => {
      const age = t - TD - i * 0.04; const on = age > 0 && age < 1.6; p.visible = on; if (!on) return;
      const side = i % 2 ? 1 : -1; p.position.set(150 + 2 - age * 6, 0.6 + age * 1.2, side * 3.8 + (i - 4) * 0.1);
      const sc = 1.5 + age * 5; p.scale.set(sc, sc * 0.6, 1); p.material.opacity = 0.55 * (1 - age / 1.6);
    });
    c.L.follow(new THREE.Vector3(s.x, 0, 0));
  }
};
