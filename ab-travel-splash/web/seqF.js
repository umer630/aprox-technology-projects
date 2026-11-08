// SEQUENCE F (v3) — Cruise: window se baadal, cabin crew lunch serve karta hai, tray table par khana, Umer khata hai
import * as THREE from 'three';
import { setupSkyAndLight, buildClouds } from './lib/env.js';
import { createAircraft } from './lib/aircraft.js';
import { buildCabin, cabinPeople, seatX, SEATZ, windowCam } from './lib/cabin.js';
import { createCast } from './lib/cast.js';
import { createCharacter, LOOKS, poseSit, poseIdle, poseReach, poseEat, faceUpdate } from './lib/character.js';
import { attachToHand, placeWorld, speaking, V3 } from './lib/anim.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
import { mat, mesh, box, smooth, range } from './lib/util.js';

const V = 230, ROW = 12;
const SUBS = [
  [0.6, 4.6, 'Umer', 'Dekhiye dosto — baadalon ke upar kya nazara hai!', 'دیکھیے دوستو، بادلوں کے اوپر کیا نظارہ ہے!'],
  [5.6, 9.4, 'Umer', 'Aur ab... lunch ka waqt ho gaya hai!', 'اور اب... لنچ کا وقت ہو گیا ہے!'],
  [10.4, 13.4, 'CrewM', 'Sir, lunch — chicken biryani ya sandwich?', 'سر، لنچ، چکن بریانی یا سینڈوچ؟'],
  [13.6, 15.6, 'Umer', 'Biryani please, aur paani.', 'بریانی پلیز، اور پانی۔'],
  [16.0, 17.6, 'CrewM', 'Ji zaroor, yeh lijiye.', 'جی ضرور، یہ لیجیے۔'],
  [19.0, 23.0, 'Umer', 'Wah — biryani zabardast hai! Flight mein bhi ghar jaisa khana.', 'واہ، بریانی زبردست ہے! فلائٹ میں بھی گھر جیسا کھانا۔'],
  [24.4, 27.6, 'Umer', 'Thori der mein Islamabad, InshaAllah!', 'تھوڑی دیر میں اسلام آباد، ان شاء اللہ!']
];
const MODE = [[0, 0], [10.0, 1]];
function mealTray() {
  const g = new THREE.Group();
  g.add(box(0.36, 0.02, 0.28, mat('#3b4250', 0.6), 0, 0, 0));
  const bowl = mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.05, 18), mat('#f2f2f2', 0.4)); bowl.position.set(-0.06, 0.035, 0.02); g.add(bowl);
  const rice = mesh(new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e3a64a', 0.9)); rice.scale.y = 0.35; rice.position.set(-0.06, 0.055, 0.02); g.add(rice);
  const w = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 12), new THREE.MeshPhysicalMaterial({ color: '#cfe8ff', roughness: 0.1, transparent: true, opacity: 0.7 })); w.position.set(0.11, 0.09, -0.08); g.add(w);
  g.add(box(0.06, 0.03, 0.08, mat('#c8873a', 0.7), 0.1, 0.02, 0.07)); // bread roll
  g.add(box(0.12, 0.005, 0.03, mat('#bbb', 0.3, 0.8), 0.06, 0.012, 0.11)); // spoon
  return g;
}
export default {
  id: 'F', ambience: 'cabin', title: 'Baadalon ke upar — Lunch', subs: SUBS,
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 24, azim: 120, sunI: 3.4, turbidity: 5, rayleigh: 2.4, fog: [0xc9d6e6, 800, 7000], shadowSize: 30, sunColor: '#fff0d8' });
    scene.fog.color.set('#cfdcec');
    const clouds = buildClouds(scene, { y: -70, count: 1100, spread: 7000, seed: 8 });
    const ac = createAircraft(); scene.add(ac.group); ac.gearDown(0);
    const cab = buildCabin(ac, { passengers: 18, seed: 340 });
    const c = createCast(scene, { revo: false, driver: false }); ac.body.add(c.umer.root);
    const crew = createCharacter({ ...LOOKS.cabinCrewM }, 530); ac.body.add(crew.root);
    const cart = new THREE.Group(); ac.body.add(cart); cart.add(box(0.75, 1.0, 0.32, mat('#c9ccd1', 0.35, 0.7), 0, 0.5, 0)); cart.add(box(0.77, 0.04, 0.34, mat('#2a2d33', 0.6), 0, 1.02, 0)); cart.add(mealTray()); cart.children[2].position.set(0, 1.05, 0);
    const meal = mealTray(); ac.body.add(meal);
    return { L, ac, cab, crew, cart, meal, clouds, ...c };
  },
  shots: [
    { id: 'F01', dur: 5.0, desc: 'WINDOW: baadalon ke upar, wing', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 70, shake: 0.3 }); } },
    { id: 'F02', dur: 5.0, desc: 'SELFIE: seat 12A, lunch ka waqt', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 5, { fov: 76, shake: 0.4 }); } },
    { id: 'F03', dur: 8.0, desc: 'REAR on cabin crew: lunch trolley, tray table khulti hai, tray milti hai', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 10, { fov: 76, shake: 0.4 }); } },
    { id: 'F04', dur: 10.0, desc: 'CAMERA TRAY TABLE PAR: Umer biryani khata hai', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 18, { fov: 74, shake: 0 }); } }
  ],
  update(t, c) {
    const { ac, cab, umer, vcam, crew, cart, meal } = c; const x = V * t;
    ac.group.position.set(x, 0.15 * Math.sin(t * 0.9), 0); ac.pitch(0.03); ac.roll(0.004 * Math.sin(t * 0.7)); ac.spin(t);
    ac.group.updateMatrixWorld(true);
    cabinPeople(cab, t);
    const sx = seatX(ROW), FY = cab.FY;
    // trolley + crew aisle mein
    cart.position.set(sx + 0.85, FY, 0.02); crew.setNeutral(); poseIdle(crew, t); crew.root.position.set(sx + 0.1, FY, 0.12); crew.root.rotation.y = Math.PI;
    faceUpdate(crew, t, speaking(SUBS, t, 'CrewM'));
    // tray table khulti hai (12.0–12.8)
    const u = smooth(range(t, 12.0, 12.8)); cab.trayPivot.rotation.z = -Math.PI / 2 * u; cab.trayPivot.position.y = FY + 0.92 - 0.2 * u;
    const tablePos = V3(seatX(ROW - 1) - 0.48, FY + 0.735, SEATZ.A);
    meal.visible = t >= 17.0;
    if (t > 15.8 && t < 17.4) poseReach(crew, 'R', 1.1, 1);
    if (t >= 17.0) { if (meal.parent !== ac.body) ac.body.add(meal); meal.position.copy(tablePos); meal.rotation.set(0, 0, 0); meal.scale.setScalar(1); }
    umer.setNeutral(); cab.sit(umer, ROW, 'A'); poseSit(umer, 1);
    if (t < 5) { poseReach(umer, 'R', 0.9, 1); umer.J.upperArmR.rotation.z = 0.6; umer.J.neck.rotation.y = 0.7; windowCam(ac, cab, vcam, ROW, V3(sx - 1.5, -1.5, -16)); }
    else if (t < 18) { let ft = null; if (t > 10) { ft = new THREE.Vector3(); crew.J.head.getWorldPosition(ft); } vlogPose(umer, vcam, modeAt(MODE, t), ft, t, { free: true }); if (t > 12 && t < 13) poseReach(umer, 'L', 0.9, 1); }
    else {
      // camera tray table par, lens Umer ki taraf
      if (vcam.parent !== ac.body) ac.body.add(vcam); vcam.scale.setScalar(1); vcam.position.set(tablePos.x + 0.1, tablePos.y + 0.06, SEATZ.A + 0.1);
      vcam.lookAt(V3(sx - 0.2, FY + 1.05, SEATZ.A).applyMatrix4(ac.body.matrixWorld)); vcam.updateMatrixWorld(true);
      if (t > 18.4 && !(t > 24.2 && t < 27.6)) poseEat(umer, t, 1);
    }
    faceUpdate(umer, t, speaking(SUBS, t, 'Umer'));
    c.L.follow(new THREE.Vector3(x, 0, 0));
  }
};
