// SEQUENCE J — Jinnah International entry: security checkpoint (ticket + ID check, gaari ki mirror checking),
// boom barrier, phir "Departures" ramp upar (Arrivals neeche)
import * as THREE from 'three';
import { setupSkyAndLight, ground, road, kerb, palms, streetLight, trees } from './lib/env.js';
import { buildAirportApproach, brandBillboard } from './lib/world2.js';
import { createCast, seatInRevo } from './lib/cast.js';
import { createCharacter, LOOKS, poseIdle, poseReach, poseSalaam, faceUpdate } from './lib/character.js';
import { createBoardingPass } from './lib/props.js';
import { createTraffic } from './lib/vehicles.js';
import { plan, applyPlan, attachToHand, camLerp, handheld, speaking, V3 } from './lib/anim.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
const MODE = [[0, 1], [20.0, 0], [30.0, 1]];
import { mat, mesh, box, smooth, range, clamp } from './lib/util.js';

const LZ = -5.5;
const SUBS = [
  [9.0, 12.4, 'Guard', 'Assalam o Alaikum. Ticket aur shanakhti card dikhayein.', 'السلام علیکم۔ ٹکٹ اور شناختی کارڈ دکھائیں۔'],
  [12.8, 15.8, 'Umer', 'Yeh lijiye — Karachi se Islamabad, aaj ki flight.', 'یہ لیجیے، کراچی سے اسلام آباد، آج کی فلائٹ۔'],
  [16.6, 19.6, 'Guard', 'Theek hai. Gaari ki checking hogi.', 'ٹھیک ہے۔ گاڑی کی چیکنگ ہوگی۔'],
  [26.6, 29.0, 'Guard', 'Sab theek hai — jaayein!', 'سب ٹھیک ہے، جائیں!'],
  [31.0, 35.6, 'Umer', 'Dosto, departure upar hai aur arrival neeche — hum upar ja rahe hain!', 'دوستو، ڈیپارچر اوپر ہے اور ارائیول نیچے، ہم اوپر جا رہے ہیں!'],
  [40.6, 44.6, 'Umer', 'Woh raha Jinnah International Airport!', 'وہ رہا جناح انٹرنیشنل ایئرپورٹ!']
];
function rv(t) {
  if (t < 8) { const u = t / 8; return -80 + 78.8 * (1 - (1 - u) * (1 - u)); }
  if (t < 30) return -1.2;
  const u = t - 30; return u < 4.8 ? -1.2 + 1.25 * u * u : -1.2 + 28.8 + 12 * (u - 4.8);
}
export default {
  id: 'J', title: 'Jinnah International — Entry gate', subs: SUBS, ambience: 'street', sfx: [[28.0, 'barrier']],
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 36, azim: 150, sunI: 3.3, fog: [0xdcd6c8, 100, 900], shadowSize: 50 });
    ground(scene, 3000, '#a99d84');
    road(scene, { length: 400, width: 7.4, z: LZ, x: -160, laneLines: [0] }); road(scene, { length: 600, width: 7.4, z: 5.5, laneLines: [0] });
    road(scene, { length: 40, width: 7.4, z: LZ, x: 20, laneLines: [0] });
    kerb(scene, { length: 900, z: -9.4, h: 0.2 }); kerb(scene, { length: 900, z: 9.4, h: 0.2 });
    scene.add(box(900, 0.25, 3.0, mat('#6d8a3f', 1), 0, 0.12, 0, { cast: false }));
    const ap = buildAirportApproach(scene);
    const pal = []; for (let x = -300; x < 300; x += 16) { pal.push([x, -12.5]); pal.push([x + 8, 12.5]); } palms(scene, pal);
    for (let x = -280; x < 20; x += 40) streetLight(scene, x, 0, 1, 9, true);
    brandBillboard(scene, -60, -14, 0.4, 2); brandBillboard(scene, -130, 14, Math.PI - 0.4, 0); brandBillboard(scene, -200, -14, 0.4, 1);
    // door terminal ki imarat (beige + dark glass)
    const T = new THREE.Group(); T.position.set(430, 0, 0); scene.add(T);
    T.add(box(26, 26, 160, mat('#e6dcc6', 0.85), 0, 13, 0)); const gl = box(0.4, 15, 110, new THREE.MeshPhysicalMaterial({ color: '#2a2f38', roughness: 0.12, metalness: 0.6 }), -13.2, 14, 0); T.add(gl);
    for (const s of [-1, 1]) T.add(box(30, 32, 26, mat('#e6dcc6', 0.85), 0, 16, s * 92));
    const traffic = createTraffic(scene, { lanes: [{ z: 5.5, dir: -1, speed: 11, count: 10, kinds: ['sedan', 'hatch', 'van'] }], seed: 70, window: 500 });
    const c = createCast(scene);
    const guard = createCharacter({ ...LOOKS.guard, cameraBag: false }, 60); scene.add(guard.root);
    const guard2 = createCharacter({ ...LOOKS.guard, cameraBag: false, height: 1.74 }, 61); guard2.root.position.set(-0.8, 0, -0.1); guard2.root.rotation.y = -1.9; scene.add(guard2.root);
    const pass = createBoardingPass(); scene.add(pass);
    const mirror = new THREE.Group(); mirror.add(box(0.025, 1.4, 0.025, mat('#555', 0.4, 0.7), 0, -0.6, 0)); const mm = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 20), mat('#dfe6ea', 0.05, 1)); mm.position.y = -1.3; mm.rotation.x = 0.5; mirror.add(mm);
    const gP = plan(guard, [0.6, -3.5], Math.PI, [{ at: 20.0, to: [2.4, -3.5] }, { at: 21.8, to: [-3.4, -3.6] }, { at: 26.0, to: [0.6, -3.1] }]);
    return { L, ap, traffic, guard, guard2, pass, mirror, gP, ...c };
  },
  shots: [
    { id: 'J01', dur: 8.0, desc: 'Wide: entry checkpoint, canopy aur Jinnah International signage, Revo aati hai', selfie: true,
      cam(t, c, cam) { lensCam(c.vcam, cam, t + 0, { fov: 80 }); } },
    { id: 'J02', dur: 12.0, desc: 'Guard ticket aur shanakhti card maangta hai', selfie: true,
      cam(t, c, cam) { lensCam(c.vcam, cam, t + 8, { fov: 80 }); } },
    { id: 'J03', dur: 10.0, desc: 'Under-vehicle mirror se gaari ki checking, barrier uthta hai', selfie: true,
      cam(t, c, cam) { lensCam(c.vcam, cam, t + 20, { fov: 80 }); } },
    { id: 'J04', dur: 10.0, desc: 'Departures ramp upar — Arrivals neeche (signs)', selfie: true,
      cam(t, c, cam) { lensCam(c.vcam, cam, t + 30, { fov: 80 }); } },
    { id: 'J05', dur: 6.0, desc: 'REAR windshield: terminal saamne, ramp', selfie: true,
      cam(t, c, cam) { lensCam(c.vcam, cam, t + 40, { fov: 80 }); } }
  ],
  update(t, c, cam, shot) {
    const { revo, guard, guard2, pass, mirror, driver } = c; const scene = revo.group.parent;
    const x = rv(t); let y = 0, pitch = 0;
    if (x > 40 && x < 110) { y = (x - 40) / 70 * 6.5; pitch = Math.atan2(6.5, 70); } else if (x >= 110) y = 6.5;
    revo.group.position.set(x, y, LZ); revo.group.rotation.z = pitch; revo.roll(x);
    c.traffic.update(t, 0);
    c.ap.boom.rotation.x = 1.45 * smooth(range(t, 27.8, 29.2));
    seatInRevo(c, t, { talk: speaking(SUBS, t, 'Umer') });
    revo.group.updateMatrixWorld(true);
    { const gp = new THREE.Vector3(); c.guard.root.getWorldPosition(gp); gp.y = 1.5;
      const ft = (t > 8 && t < 20) ? gp : V3(16, 1.4, 0).applyMatrix4(revo.group.matrixWorld);
      vlogPose(c.umer, c.vcam, modeAt(MODE, t), ft, t); }
    if (t > 13 && t < 15.5) { poseReach(driver, 'R', 1.2, 1); driver.J.upperArmR.rotation.z = 1.0; }
    // guard
    guard.setNeutral(); guard2.setNeutral(); poseIdle(guard2, t); faceUpdate(guard2, t, 0);
    const st = applyPlan(guard, c.gP, t);
    if (t < 20) { guard.root.rotation.y = Math.PI; if (t > 9 && t < 10.5) poseSalaam(guard, 1); }
    pass.visible = t > 13.6 && t < 19.5;
    if (t < 14.8) attachToHand(pass, driver, 'R', V3(0.02, -0.1, 0.05), new THREE.Euler(0, Math.PI / 2, Math.PI / 2));
    else { attachToHand(pass, guard, 'R', V3(0.02, -0.1, 0.05), new THREE.Euler(0, Math.PI / 2, Math.PI / 2)); poseReach(guard, 'R', 1.0, 1); guard.J.forearmR.rotation.x = -1.3; }
    if (t > 13.8 && t < 15.0) poseReach(guard, 'R', 1.3, 1);
    mirror.visible = t > 20 && t < 26.2;
    if (mirror.visible) { poseReach(guard, 'L', 0.7, 1); attachToHand(mirror, guard, 'L', V3(0, -0.08, 0.03), new THREE.Euler(0.9, 0, 0)); }
    if (t > 26.4 && t < 28.6) { poseReach(guard, 'R', 0.6, 1); guard.J.upperArmR.rotation.z = -1.0; }
    faceUpdate(guard, t, speaking(SUBS, t, 'Guard'));
    c.L.follow(new THREE.Vector3(Math.max(0, x), 0, -3));
  }
};
