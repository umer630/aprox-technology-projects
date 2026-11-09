// SEQUENCE E — Islamabad: avenue (Corolla Grande, left-hand) → Faisal Mosque → Umer ka vlog outro
import * as THREE from 'three';
import { setupSkyAndLight, buildIslamabadAvenue, buildFaisalMosque, margallaHills, ground, islamabadTowers } from './lib/env.js';
import { createTraffic } from './lib/vehicles.js';
import { createCast, seatInCorolla, selfieCam } from './lib/cast.js';
import { createCorolla, brandBillboard, roadSign } from './lib/world2.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
const MODE = [[0, 0], [17.2, 1]];
import { speaking } from './lib/anim.js';
import { plan, applyPlan, holdCamera, camLerp, handheld, V3 } from './lib/anim.js';
import { poseCarryCam, poseSelfie, faceUpdate, createCharacter, LOOKS } from './lib/character.js';
import { smooth, range, clamp } from './lib/util.js';

const MOSQUE = new THREE.Vector3(0, 0, -440);
const PLAT = 3.0; // courtyard platform height
const ROADZ = 660; // avenue group offset (avenue z: -340 … 1660)

export default {
  id: 'E', ambience: 'outdoor', sfx: [[11.0, 'birds']], title: 'Islamabad — Faisal Masjid',
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 34, azim: 345, sunI: 3.4, turbidity: 3.5, rayleigh: 2.6, fog: [0xbfcfdc, 500, 4500], shadowSize: 70, sunColor: '#fff1dc' });
    // avenue along Z: group rotated +90° → local +X = world −Z (mosque ki taraf)
    const R = new THREE.Group(); R.rotation.y = Math.PI / 2; R.position.z = ROADZ; scene.add(R);
    buildIslamabadAvenue(scene, R);
    margallaHills(scene, { z0: -540, height: 560, seed: 3 });
    const M = buildFaisalMosque(scene, MOSQUE, 1);
    islamabadTowers(scene, new THREE.Vector3(-170, 0, 420)); // Islamabad skyline reference
    islamabadTowers(scene, new THREE.Vector3(190, 0, 150)).scale.setScalar(0.8);
    // traffic in road-local frame (left-hand): +X lanes z<0
    const T = new THREE.Group(); R.add(T);
    const traffic = createTraffic(T, { lanes: [
      { z: -12.1, dir: 1, speed: 12, count: 8, kinds: ['sedan', 'hatch', 'van'] },
      { z: -4.9, dir: 1, speed: 17, count: 5, kinds: ['sedan', 'sedan'] },
      { z: 4.9, dir: -1, speed: 16, count: 8, kinds: ['sedan', 'hatch', 'van', 'bike'] },
      { z: 12.1, dir: -1, speed: 12, count: 8, kinds: ['sedan', 'bike', 'hatch'] }], seed: 61, window: 900 });
    roadSign(R, -230, -17, -Math.PI / 2, ['Srinagar Highway', 'Faisal Avenue  ↑'], 'سری نگر ہائی وے', 7, 2.8, 5.5);
    roadSign(R, -170, -17, -Math.PI / 2, ['Faisal Avenue', 'Faisal Masjid  ↑'], 'فیصل ایونیو', 7, 2.8, 5.5);
    const c = createCast(scene, { revo: false, driver: false });
    c.car = createCorolla('#f4f4f2'); R.add(c.car.group);
    // visitors on courtyard
    const npcs = [];
    const looks = [LOOKS.loungePassenger, LOOKS.passengerF, LOOKS.youngPassenger, LOOKS.passengerM];
    for (let i = 0; i < 9; i++) { const n = createCharacter({ ...looks[i % 4], cameraBag: false }, 120 + i); n.root.position.set(-30 + i * 7.5, PLAT, -360 - (i % 3) * 6); n.root.rotation.y = Math.PI + (i % 2 ? 0.4 : -0.4); scene.add(n.root); npcs.push(n); }
    const uP = plan(c.umer, [-21.5, -372.0], 0, [{ at: 17.0, face: Math.PI, dur: 1.8 }, { at: 21.5, to: [-20.5, -392] }]);
    return { L, R, M, traffic, npcs, uP, ...c };
  },
  shots: [
    { id: 'E01', dur: 6.0, desc: 'DASHBOARD aage: Srinagar Highway → Faisal Avenue, saamne Faisal Masjid aur Margalla', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 74, shake: 0.4 }); } },
    { id: 'E02', dur: 5.0, desc: 'DASHBOARD Umer ki taraf: Islamabad ki sarkein', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 6, { fov: 80, shake: 0.2 }); } },
    { id: 'E03', dur: 6.0, desc: 'SELFIE courtyard mein — peeche Faisal Masjid', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 11, { fov: 80 }); } },
    { id: 'E04', dur: 8.0, desc: 'REAR PAN reveal: camera ghoom kar Faisal Masjid — minarets aur tent-shaped hall', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 17, { fov: 82 }); } },
    { id: 'E05', dur: 5.0, desc: 'REAR: masjid ki taraf walk, minarets upar', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 25, { fov: 82 }); } }
  ],
  subs: [
    [0.8, 5.4, 'Umer', 'Srinagar Highway se Faisal Avenue — saamne Faisal Masjid!', 'سری نگر ہائی وے سے فیصل ایونیو، سامنے فیصل مسجد!'],
    [6.4, 10.4, 'Umer', 'Islamabad ki sarkein — saaf, hari bhari, aur peeche Margalla!', 'اسلام آباد کی سڑکیں، صاف، ہری بھری، اور پیچھے مارگلہ!'],
    [11.8, 16.2, 'Umer', 'Dosto, hum pohanch gaye hain... mere peeche dekhiye!', 'دوستو، ہم پہنچ گئے ہیں... میرے پیچھے دیکھیے!'],
    [19.2, 23.4, 'Umer', 'Yeh hai Faisal Masjid... SubhanAllah, kitni khoobsurat!', 'یہ ہے فیصل مسجد... سبحان اللہ، کتنی خوبصورت!'],
    [25.4, 29.4, 'Umer', 'Chaar minar aur khaime jaisa hall — Margalla ke daaman mein.', 'چار مینار اور خیمے جیسا ہال، مارگلہ کے دامن میں۔']
  ],
  update(t, c, cam, shot) {
    const x = -300 + 15 * Math.min(t, 11);
    c.car.group.position.set(x, 0, -8.3); c.car.roll(x);
    c.revoWorldZ = ROADZ - x;
    c.traffic.update(t, x);
    for (const n of c.npcs) { n.setNeutral(); faceUpdate(n, t, 0); }
    if (t < 11.0) {
      seatInCorolla(c, c.car, t, { talk: speaking(this.subs, t, 'Umer'), forward: t < 6 });
    } else {
      const { umer, vcam } = c;
      if (umer.root.parent !== c.R.parent) c.R.parent.add(umer.root);
      umer.setNeutral(); applyPlan(umer, c.uP, t, PLAT);
      vlogPose(umer, vcam, modeAt(MODE, t), new THREE.Vector3(0, PLAT + 24 + 8 * smooth(range(t, 20, 30)), -440), t, { free: true });
      faceUpdate(umer, t, speaking(this.subs, t, 'Umer'));
    }
    c.L.follow(t < 11 ? new THREE.Vector3(0, 0, c.revoWorldZ) : new THREE.Vector3(0, 0, -400));
  },
  overlay() {}
};
