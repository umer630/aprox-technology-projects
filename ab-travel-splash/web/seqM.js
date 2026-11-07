// SEQUENCE M — Islamabad International Airport: baggage carousel → arrival hall → walking selfie
import * as THREE from 'three';
import { buildArrivalHall } from './lib/env.js';
import { buildCarousel } from './lib/world2.js';
import { createSuitcase } from './lib/props.js';
import { createCast, selfieCam } from './lib/cast.js';
import { createCharacter, LOOKS, poseCarryCam, posePullBag, poseSelfie, poseReach, poseIdle, faceUpdate } from './lib/character.js';
import { plan, applyPlan, attachBagToHand, holdCamera, camLerp, speaking, V3 } from './lib/anim.js';
import { smooth, range } from './lib/util.js';

const CZ = -34, CX = 6, BELT_Y = 0.545;
const SUBS = [
  [1.0, 4.6, 'Umer', 'Islamabad pohanch gaye! Ab bas apna bag mil jaye...', 'اسلام آباد پہنچ گئے! اب بس اپنا بیگ مل جائے...'],
  [7.4, 10.4, 'Umer', 'Woh raha — mera blue bag!', 'وہ رہا، میرا بلیو بیگ!'],
  [17.4, 20.4, 'Umer', 'Dosto, yeh hai Islamabad International Airport!', 'دوستو، یہ ہے اسلام آباد انٹرنیشنل ایئرپورٹ!'],
  [20.6, 24.2, 'Umer', 'Kitna bada, saaf aur khoobsurat hai — maza aa gaya!', 'کتنا بڑا، صاف اور خوبصورت ہے، مزہ آ گیا!']
];
export default {
  id: 'M', title: 'Islamabad International Airport', subs: SUBS, ambience: 'hall',
  build(scene) {
    buildArrivalHall(scene);
    buildCarousel(scene, new THREE.Vector3(CX, 0, CZ));
    const c = createCast(scene, { revo: false, driver: false }); scene.add(c.bag.group);
    const others = ['#7a1d1d', '#222', '#3c6e47', '#c8a165', '#5b2a86'].map(col => { const s = createSuitcase(col); s.setExtend(0); scene.add(s.group); return s; });
    const npcs = []; const looks = [LOOKS.driver, { ...LOOKS.agent, vest: null, shirt: '#5b6b3a', pants: '#222' }, LOOKS.ammi, LOOKS.friend1, LOOKS.friend2];
    for (let i = 0; i < 9; i++) { const n = createCharacter({ ...looks[i % 5], cameraBag: false }, 160 + i); const near = i < 4; n.root.position.set(near ? CX - 4 + i * 2.2 : -14 + i * 3.6, 0, near ? CZ + 1.4 : -18 - (i % 3) * 5); n.root.rotation.y = near ? Math.PI : (i % 2 ? 0.3 : -2.6); scene.add(n.root); npcs.push(n); }
    const P = plan(c.umer, [CX + 0.6, CZ + 1.35], Math.PI, [{ at: 10.6, face: 0.3, dur: 0.6 }, { at: 11.4, to: [-3.4, -22] }, { at: 21.8, to: [-3.4, -14] }]);
    return { others, npcs, P, ...c };
  },
  shots: [
    { id: 'M01', dur: 11.0, desc: 'Baggage carousel: bags belt par, Umer apna blue bag uthata hai', cam(t, c, cam) { camLerp(cam, V3(CX + 3.6, 1.7, CZ + 4.4), V3(CX + 3.0, 1.65, CZ + 4.0), V3(CX - 1, 0.9, CZ), V3(CX + 0.5, 0.9, CZ), t / 11, 46); } },
    { id: 'M02', dur: 6.0, desc: 'Arrival hall wide — teal signage band, Umer suitcase ke saath', cam(t, c, cam) { const p = c.umer.root.position; cam.position.set(p.x - 2.5, 2.2, p.z + 6.5); cam.lookAt(p.x + 1, 3.2, p.z - 6); cam.fov = 54; } },
    { id: 'M03', dur: 7.0, desc: 'Walking selfie', selfie: true, cam(t, c, cam) { selfieCam(c, cam, t, { fov: 74, shake: 1.2 }); } }
  ],
  update(t, c, cam, shot) {
    const { umer, bag, vcam, others } = c;
    for (const n of c.npcs) { n.setNeutral(); poseIdle(n, t); faceUpdate(n, t, 0); }
    // belt ke straight hisse par bags (x: CX+5 → CX−5)
    others.forEach((s, i) => { const x = CX + 5 - ((t * 0.55 + i * 2.1) % 10); s.group.position.set(x, BELT_Y, CZ); s.group.rotation.set(0, Math.PI / 2, 0); });
    applyPlan(umer, c.P, t); poseCarryCam(umer, 1);
    if (t < 8.6) { const x = CX + 5 - Math.min(t * 0.55, 4.4); bag.setExtend(0); bag.group.position.set(x, BELT_Y, CZ); bag.group.rotation.set(0, Math.PI / 2, 0); if (t > 7.6) poseReach(umer, 'L', 1.1, 1); }
    else if (t < 9.6) { const u = smooth(range(t, 8.6, 9.6)); poseReach(umer, 'L', 1.1 * (1 - u) + 0.3, 1); bag.setExtend(u); const p = attachBagToHand(umer, 'L', bag).clone(); bag.group.position.y = (1 - u) * BELT_Y; }
    else { posePullBag(umer, 1); bag.setExtend(1); attachBagToHand(umer, 'L', bag); }
    const sw = shot.id === 'M03' ? smooth(range(t, 17, 17.4)) : 0; if (sw > 0) poseSelfie(umer, sw, Math.sin(t * 2));
    umer.root.updateMatrixWorld(true); const head = new THREE.Vector3(); umer.J.head.getWorldPosition(head); head.y += 0.08;
    holdCamera(umer, vcam, sw > 0.5 ? head : V3(-3, 1, 10));
    faceUpdate(umer, t, speaking(SUBS, t, 'Umer'));
  }
};
