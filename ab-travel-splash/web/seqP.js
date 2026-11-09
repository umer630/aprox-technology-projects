// SEQUENCE P — Airblue A320 ke andar: darwaze par cockpit ki jhalak (pilot + co-pilot), aisle walk, seat 12A window
import * as THREE from 'three';
import { setupSkyAndLight, buildRunway } from './lib/env.js';
import { createAircraft } from './lib/aircraft.js';
import { buildCabin, cabinPeople, seatX, windowCam } from './lib/cabin.js';
import { createCast } from './lib/cast.js';
import { createCharacter, LOOKS, poseIdle, poseSit, poseWave, poseReach, faceUpdate } from './lib/character.js';
import { plan, applyPlan, speaking, V3 } from './lib/anim.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
import { smooth, range } from './lib/util.js';

const ROW = 12;
const SUBS = [
  [0.8, 3.0, 'Pilot', 'Assalam o Alaikum, welcome aboard!', 'السلام علیکم، ویلکم ابورڈ!'],
  [3.2, 5.4, 'Umer', 'Walaikum Assalam, Captain sahab!', 'وعلیکم السلام، کیپٹن صاحب!'],
  [6.6, 10.0, 'Umer', 'Dosto, yeh dekhiye — cockpit! Ab apni seat dhoondte hain.', 'دوستو، یہ دیکھیے، کاک پٹ! اب اپنی سیٹ ڈھونڈتے ہیں۔'],
  [12.2, 14.8, 'CrewM', 'Sir, aap ki seat 12A — window seat, yeh rahi.', 'سر، آپ کی سیٹ بارہ اے، ونڈو سیٹ، یہ رہی۔'],
  [15.2, 16.4, 'Umer', 'Shukriya!', 'شکریہ!'],
  [17.0, 21.4, 'Umer', 'Dosto, seat 12A — window seat mil gayi! Bilkul wing ke saath.', 'دوستو، سیٹ بارہ اے، ونڈو سیٹ مل گئی! بالکل ونگ کے ساتھ۔'],
  [22.6, 26.0, 'Umer', 'Bahar dekhiye — Jinnah Terminal, aur hamara jahaz tayyar hai.', 'باہر دیکھیے، جناح ٹرمینل، اور ہمارا جہاز تیار ہے۔']
];
const MODE = [[0, 1], [6.2, 0], [9.6, 1], [15.2, 0]];
export default {
  id: 'P', title: 'Airblue A320 — Cabin', subs: SUBS, ambience: 'cabin', exposure: 1.0,
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 36, azim: 160, sunI: 3.0, hemiI: 1.2, fog: [0xd8d6cc, 300, 3500], shadowSize: 50 });
    buildRunway(scene, { terrain: 'karachi' });
    const ac = createAircraft(); ac.group.position.set(-120, 0, -250); scene.add(ac.group); ac.gearDown(1);
    const cab = buildCabin(ac, { passengers: 18 });
    const c = createCast(scene, { revo: false, driver: false });
    ac.body.add(c.umer.root);
    const crewM = createCharacter({ ...LOOKS.cabinCrewM }, 520); ac.body.add(crewM.root); crewM.root.position.set(seatX(15) - 0.1, cab.FY, 0.02); crewM.root.rotation.y = Math.PI / 2;
    const crewF = createCharacter({ ...LOOKS.cabinCrewF }, 521); ac.body.add(crewF.root); crewF.root.position.set(14.4, cab.FY, 0.3); crewF.root.rotation.y = -Math.PI / 2 - 0.6;
    const uP = plan(c.umer, [13.7, -0.1], Math.PI / 2, [{ at: 5.6, face: -Math.PI / 2, dur: 0.6 }, { at: 6.2, to: [12.9, 0.0] }, { at: 7.0, to: [seatX(ROW) + 0.1, 0.0] }]);
    return { L, ac, cab, crewM, crewF, uP, ...c };
  },
  shots: [
    { id: 'P01', dur: 6.0, desc: 'REAR: aircraft darwaze par — cockpit ki jhalak, pilot aur co-pilot', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 76 }); } },
    { id: 'P02', dur: 10.0, desc: 'SELFIE → REAR: aisle mein row 12 tak, cabin crew', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 6, { fov: 78 }); } },
    { id: 'P03', dur: 6.0, desc: 'SELFIE: seat 12A par baith kar', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 16, { fov: 76 }); } },
    { id: 'P04', dur: 4.6, desc: 'WINDOW: camera window par — wing, engine, terminal', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 22, { fov: 70, shake: 0.4 }); } }
  ],
  update(t, c) {
    const { umer, vcam, ac, cab, crewM, crewF } = c;
    ac.spin(0); cabinPeople(cab, t);
    if (t > 0.6 && t < 2.6) { cab.pilot.J.neck.rotation.y = -1.0; poseWave(cab.pilot, t, 'L', 1); }
    faceUpdate(cab.pilot, t, speaking(SUBS, t, 'Pilot')); faceUpdate(cab.copilot, t, 0);
    crewM.setNeutral(); poseIdle(crewM, t); faceUpdate(crewM, t, speaking(SUBS, t, 'CrewM')); if (t > 12.4 && t < 14.6) poseReach(crewM, 'R', 0.7, 1);
    crewF.setNeutral(); poseIdle(crewF, t); faceUpdate(crewF, t, 0);
    ac.group.updateMatrixWorld(true);
    umer.setNeutral();
    if (t < 16) {
      applyPlan(umer, c.uP, t, cab.FY);
      let ft = null;
      if (t < 6) ft = V3(17.9, cab.FY + 1.0, 0.0).applyMatrix4(ac.body.matrixWorld);
      else if (t > 11.5) { ft = new THREE.Vector3(); crewM.J.head.getWorldPosition(ft); }
      vlogPose(umer, vcam, modeAt(MODE, t), ft, t);
    } else {
      cab.sit(umer, ROW, 'A'); poseSit(umer, 1);
      if (t < 22) vlogPose(umer, vcam, modeAt(MODE, t), null, t);
      else { poseReach(umer, 'R', 0.9, 1); umer.J.upperArmR.rotation.z = 0.6; umer.J.neck.rotation.y = 0.7; windowCam(ac, cab, vcam, ROW, V3(seatX(ROW) - 3, 1.0, -14)); }
    }
    faceUpdate(umer, t, speaking(SUBS, t, 'Umer'));
    c.L.follow(new THREE.Vector3(-120, 0, -250));
  }
};
