// SEQUENCE M — Islamabad International Airport: baggage carousel → arrival hall → walking selfie
import * as THREE from 'three';
import { buildArrivalHall } from './lib/env.js';
import { buildCarousel } from './lib/world2.js';
import { createSuitcase } from './lib/props.js';
import { createCast, selfieCam } from './lib/cast.js';
import { createCharacter, LOOKS, poseCarryCam, posePullBag, poseSelfie, poseReach, poseIdle, faceUpdate } from './lib/character.js';
import { plan, applyPlan, attachBagToHand, holdCamera, camLerp, speaking, V3 } from './lib/anim.js';
import { smooth, range } from './lib/util.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
const MODE = [[0, 0], [5.0, 1], [16.6, 0]];

const CZ = -34, CX = 6, BELT_Y = 0.545;
const SUBS = [
  [1.0, 4.6, 'Umer', 'Islamabad pohanch gaye! Ab bas apna bag mil jaye...', 'اسلام آباد پہنچ گئے! اب بس اپنا بیگ مل جائے...'],
  [7.4, 10.4, 'Umer', 'Woh raha — mera Travel Splash bag!', 'وہ رہا، میرا ٹریول اسپلیش بیگ!'],
  [17.4, 20.4, 'Umer', 'Dosto, yeh hai Islamabad International Airport!', 'دوستو، یہ ہے اسلام آباد انٹرنیشنل ایئرپورٹ!'],
  [20.6, 24.2, 'Umer', 'Kitna bada, saaf aur khoobsurat hai — maza aa gaya!', 'کتنا بڑا، صاف اور خوبصورت ہے، مزہ آ گیا!']
];
export default {
  id: 'M', title: 'Islamabad International Airport', subs: SUBS, ambience: 'hall',
  build(scene) {
    buildArrivalHall(scene);
    buildCarousel(scene, new THREE.Vector3(CX, 0, CZ));
    const c = createCast(scene, { revo: false, driver: false }); scene.add(c.bag.group);
    const others = ['#7a1d1d', '#222', '#3c6e47', '#c8a165', '#5b2a86'].map(col => { const s = createSuitcase(col, 'hard'); s.setExtend(0); scene.add(s.group); return s; });
    const npcs = []; const looks = [LOOKS.passengerM, LOOKS.passengerF, LOOKS.businessTraveller, LOOKS.youngPassenger, LOOKS.loungePassenger];
    for (let i = 0; i < 9; i++) { const n = createCharacter({ ...looks[i % 5], cameraBag: false }, 160 + i); const near = i < 4; n.root.position.set(near ? CX + [-4, -1.8, 2.6, 4.8][i] : -14 + i * 3.6, 0, near ? CZ + 1.4 : -18 - (i % 3) * 5); n.root.rotation.y = near ? Math.PI : (i % 2 ? 0.3 : -2.6); scene.add(n.root); npcs.push(n); }
    const P = plan(c.umer, [CX + 0.6, CZ + 1.35], Math.PI, [{ at: 10.6, face: 0.3, dur: 0.6 }, { at: 11.4, to: [-3.4, -22] }, { at: 21.8, to: [-3.4, -14] }]);
    return { others, npcs, P, ...c };
  },
  shots: [
    { id: 'M01', dur: 5.0, desc: 'SELFIE: baggage claim, carousel peeche', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 76 }); } },
    { id: 'M02', dur: 6.0, desc: 'REAR on carousel: bags belt par (khare), apna Travel Splash bag uthana', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 5, { fov: 74 }); } },
    { id: 'M03', dur: 6.0, desc: 'REAR: arrival hall, teal signage, bag ke saath', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 11, { fov: 78 }); } },
    { id: 'M04', dur: 7.0, desc: 'SELFIE: walking — Islamabad International Airport', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 17, { fov: 76 }); } }
  ],
  update(t, c, cam, shot) {
    const { umer, bag, vcam, others } = c;
    for (const n of c.npcs) { n.setNeutral(); poseIdle(n, t); faceUpdate(n, t, 0); }
    // belt ke straight hisse par bags (x: CX+5 → CX−5)
    others.forEach((s, i) => { const x = CX + 5 - ((t * 0.55 + i * 2.1) % 10); s.group.position.set(x, BELT_Y, CZ); s.group.rotation.set(0, Math.PI / 2, 0); });
    umer.setNeutral(); applyPlan(umer, c.P, t);
    if (t < 8.6) { const x = CX + 5 - Math.min(t * 0.55, 4.4); bag.setExtend(0); bag.group.position.set(x, BELT_Y, CZ); bag.group.rotation.set(0, Math.PI / 2, 0); if (t > 7.6) poseReach(umer, 'L', 1.1, 1); }
    else if (t < 9.6) { const u = smooth(range(t, 8.6, 9.6)); poseReach(umer, 'L', 1.1 * (1 - u) + 0.3, 1); bag.setExtend(u); const p = attachBagToHand(umer, 'L', bag).clone(); bag.group.position.y = (1 - u) * BELT_Y; }
    else { posePullBag(umer, 1); bag.setExtend(1); attachBagToHand(umer, 'L', bag); }
    const bp = new THREE.Vector3(); bag.group.getWorldPosition(bp); bp.y = 1.15;
    vlogPose(umer, vcam, modeAt(MODE, t), t < 10 ? bp : V3(-3.4, 1.6, 0), t);
    faceUpdate(umer, t, speaking(SUBS, t, 'Umer'));
  }
};
