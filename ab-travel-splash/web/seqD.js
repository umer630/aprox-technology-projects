// SEQUENCE D (v3) — Takeoff Umer ki window seat (12A) se: taxi → runway par line up → takeoff roll → rotate → climb
import * as THREE from 'three';
import { setupSkyAndLight, buildRunway } from './lib/env.js';
import { createAircraft } from './lib/aircraft.js';
import { buildCabin, cabinPeople, seatX, windowCam } from './lib/cabin.js';
import { createCast } from './lib/cast.js';
import { poseSit, poseReach, faceUpdate } from './lib/character.js';
import { speaking, V3 } from './lib/anim.js';
import { vlogPose, lensCam } from './lib/vlog.js';
import { smooth, range } from './lib/util.js';

const ROW = 12, A = 3.5, CUT = 17.0, SKIP = 13.0;
// world kinematics: connector (x=-240) se runway (z=0, nose +X)
function state(t) {
  if (t < 7) return { x: -240, z: -68 + 8 * t, yaw: -Math.PI / 2, y: 0, pitch: 0, d: 8 * t, gear: 1 };
  if (t < 10.14) { const u = (t - 7) / 3.14; const ph = Math.PI - u * Math.PI / 2; return { x: -228 + 12 * Math.cos(ph), z: -12 + 12 * Math.sin(ph), yaw: -Math.PI / 2 * (1 - u), y: 0, pitch: 0, d: 56 + 18.85 * u, gear: 1 }; }
  if (t < 11.5) return { x: -228, z: 0, yaw: 0, y: 0, pitch: 0, d: 75, gear: 1 };
  let s = t - 11.5; if (t >= CUT) s += SKIP;
  const x = -228 + 0.5 * A * s * s;
  const pitch = 0.15 * smooth(range(s, 20, 22.2)) - 0.03 * smooth(range(s, 26, 29));
  const air = Math.max(0, s - 21.6); const y = 0.5 * 3.0 * air * air;
  return { x, z: 0, yaw: 0, y, pitch, d: 75 + 0.5 * A * s * s, gear: 1 - smooth(range(s, 25, 27.5)) };
}
const SUBS = [
  [0.5, 4.2, 'Umer', 'Seat belt bandh — jahaz runway ki taraf ja raha hai!', 'سیٹ بیلٹ بند، جہاز رن وے کی طرف جا رہا ہے!'],
  [4.8, 8.8, 'Pilot', 'Cabin crew, takeoff ke liye tayyar ho jayein.', 'کیبن کریو، ٹیک آف کے لیے تیار ہو جائیں۔'],
  [12.0, 14.8, 'Umer', 'Takeoff... Bismillah!', 'ٹیک آف... بسم اللہ!'],
  [20.4, 23.6, 'Umer', 'Wheels up — hum hawa mein hain!', 'ویلز اپ، ہم ہوا میں ہیں!'],
  [26.4, 29.6, 'Umer', 'Karachi neeche reh gaya — ab Islamabad ki taraf!', 'کراچی نیچے رہ گیا، اب اسلام آباد کی طرف!']
];
export default {
  id: 'D', ambience: 'cabin', sfx: [[0.0, 'jet_taxi'], [4.4, 'ding'], [11.5, 'jet_roar']], title: 'Takeoff — Window Seat 12A', subs: SUBS,
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 30, azim: 200, sunI: 3.4, fog: [0xd8d6cc, 300, 3500], shadowSize: 50, sunColor: '#fff2dc' });
    buildRunway(scene, { terrain: 'karachi' });
    const ac = createAircraft(); scene.add(ac.group);
    const cab = buildCabin(ac, { passengers: 16 });
    const c = createCast(scene, { revo: false, driver: false }); ac.body.add(c.umer.root);
    return { L, ac, cab, ...c };
  },
  shots: [
    { id: 'D01', dur: 4.5, desc: 'SELFIE: seat 12A, seat belt, taxi shuru', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 76, shake: 0.5 }); } },
    { id: 'D02', dur: 5.7, desc: 'WINDOW: taxiway se runway par mudna (line up)', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 4.5, { fov: 70, shake: 0.5 }); } },
    { id: 'D03', dur: 6.8, desc: 'WINDOW: takeoff roll — terminal aur tower peeche bhaagte hain', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 10.2, { fov: 70, shake: 0.9 }); } },
    { id: 'D04', dur: 9.0, desc: 'WINDOW: rotate → liftoff → climb, zameen neeche', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 17, { fov: 70, shake: 0.6 }); } },
    { id: 'D05', dur: 4.0, desc: 'SELFIE: hawa mein, Karachi peeche', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 26, { fov: 76, shake: 0.4 }); } }
  ],
  update(t, c) {
    const s = state(t); const { ac, cab, umer, vcam } = c;
    ac.group.position.set(s.x, s.y, s.z); ac.group.rotation.y = s.yaw; ac.pitch(s.pitch); ac.gearDown(s.gear); ac.rollWheels(s.d); ac.spin(t);
    ac.group.updateMatrixWorld(true);
    cabinPeople(cab, t); faceUpdate(cab.pilot, t, 0);
    umer.setNeutral(); cab.sit(umer, ROW, 'A'); poseSit(umer, 1);
    const win = t >= 4.5 && t < 26;
    if (!win) vlogPose(umer, vcam, 0, null, t);
    else { poseReach(umer, 'R', 0.9, 1); umer.J.upperArmR.rotation.z = 0.6; umer.J.neck.rotation.y = 0.7;
      const look = t < 17 ? V3(seatX(ROW) - 0.5, 2.6, -16) : V3(seatX(ROW) - 1.5, 0.8, -16);
      windowCam(ac, cab, vcam, ROW, look); }
    faceUpdate(umer, t, speaking(SUBS, t, 'Umer'));
    c.L.follow(new THREE.Vector3(s.x, 0, s.z));
  }
};
