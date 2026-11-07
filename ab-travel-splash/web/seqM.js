// SEQUENCE M — Islamabad International Airport: arrival hall
import * as THREE from 'three';
import { buildArrivalHall } from './lib/env.js';
import { createCast, selfieCam } from './lib/cast.js';
import { createCharacter, LOOKS, poseCarryCam, posePullBag, poseSelfie, faceUpdate } from './lib/character.js';
import { plan, applyPlan, attachBagToHand, holdCamera, camLerp, V3 } from './lib/anim.js';
import { smooth, range } from './lib/util.js';

export default {
  id: 'M', title: 'Islamabad International Airport',
  build(scene) {
    buildArrivalHall(scene);
    const c = createCast(scene, { revo: false, driver: false }); scene.add(c.bag.group);
    const npcs = [];
    const looks = [{ ...LOOKS.driver, grey: false, hair: '#111', shirt: '#f1efe8', pants: '#f1efe8' }, { ...LOOKS.agent, vest: null, shirt: '#5b6b3a', pants: '#222' }, { ...LOOKS.driver, shirt: '#9fb1c2', pants: '#9fb1c2' }];
    for (let i = 0; i < 7; i++) { const n = createCharacter(looks[i % 3], 160 + i); n.root.position.set(-12 + i * 4.2 + (Math.abs(-12 + i * 4.2 + 3.5) < 1.5 ? 2.5 : 0), 0, -16 - (i % 3) * 5); n.root.rotation.y = (i % 2 ? 0.3 : -2.6); scene.add(n.root); npcs.push(n); }
    const P = plan(c.umer, [-3.5, -27], 0, [{ at: 0.3, to: [-3.4, -14.5] }]);
    return { npcs, P, ...c };
  },
  shots: [
    { id: 'M01', dur: 5.0, desc: 'Arrival hall wide: Umer suitcase ke saath, teal signage band',
      cam(t, c, cam) { camLerp(cam, V3(-2.2, 1.9, -6.0), V3(-2.5, 1.8, -7.0), V3(-3.6, 5.2, -24), V3(-3.5, 2.2, -20), t / 5, 48); } },
    { id: 'M02', dur: 5.5, desc: 'Walking selfie — Islamabad pohanch gaye', selfie: true,
      cam(t, c, cam) { selfieCam(c, cam, t, { fov: 74, shake: 1.2 }); } }
  ],
  subs: [
    [5.4, 8.0, 'Umer', 'Dosto, hum Islamabad pohanch gaye!'],
    [8.0, 10.4, 'Umer', 'Airport bohat khoobsurat aur saaf hai.']
  ],
  update(t, c, cam, shot) {
    const { umer, vcam, bag } = c;
    for (const n of c.npcs) { n.setNeutral(); faceUpdate(n, t, 0); }
    applyPlan(umer, c.P, t); poseCarryCam(umer, 1); posePullBag(umer, 1);
    bag.setExtend(1); attachBagToHand(umer, 'L', bag);
    const sw = smooth(range(t, 5.0, 5.4));
    if (sw > 0) poseSelfie(umer, sw, Math.sin(t * 2));
    umer.root.updateMatrixWorld(true);
    const head = new THREE.Vector3(); umer.J.head.getWorldPosition(head); head.y += 0.08;
    holdCamera(umer, vcam, sw > 0.5 ? head : new THREE.Vector3(-1, 1, 10));
    faceUpdate(umer, t, t > 5.4 && t < 10.4 ? 1 : 0);
  }
};
