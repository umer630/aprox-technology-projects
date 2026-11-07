// SEQUENCE R — Jaldi jaldi airport ki taraf (Karachi shahrah)
import * as THREE from 'three';
import { buildKarachiScene, LANE_Z } from './seqB.js';
import { createCast, seatInRevo, selfieCam } from './lib/cast.js';
import { faceUpdate } from './lib/character.js';
import { camLerp, speaking, V3 } from './lib/anim.js';

const SUBS = [
  [1.0, 4.4, 'Umer', 'Dosto, gaari theek ho gayi — ab full speed airport!', 'دوستو، گاڑی ٹھیک ہو گئی، اب فل اسپیڈ ایئرپورٹ!'],
  [7.6, 11.0, 'Umer', 'Dua karein flight na nikle!', 'دعا کریں فلائٹ نہ نکلے!'],
  [11.6, 15.6, 'Driver', 'Fikar na karein Umer bhai, bas das minute mein airport!', 'فکر نہ کریں عمر بھائی، بس دس منٹ میں ایئرپورٹ!']
];
export default {
  id: 'R', title: null, subs: SUBS, ambience: 'street', sfx: [[0.5, 'engine']],
  build(scene, renderer) { const k = buildKarachiScene(scene, renderer, 44); const c = createCast(scene); return { ...k, ...c }; },
  shots: [
    { id: 'R01', dur: 7.0, desc: 'Low fast tracking — Revo overtake karti hai', cam(t, c, cam) { const x = c.revo.group.position.x; cam.position.set(x + 7 - t * 1.2, 0.7, LANE_Z + 3.6); cam.lookAt(x + 1, 1, LANE_Z); cam.fov = 40; } },
    { id: 'R02', dur: 9.0, desc: 'Andar selfie — tension', selfie: true, cam(t, c, cam) { selfieCam(c, cam, t, { fov: 74, shake: 1.8 }); } },
    { id: 'R03', dur: 6.0, desc: 'Aerial — banners ke beech se tez raftar', cam(t, c, cam) { const x = c.revo.group.position.x; camLerp(cam, V3(x - 30, 20, 14), V3(x - 10, 26, 6), V3(x + 20, 0, -4), V3(x + 40, 0, -4), t / 6, 46); } }
  ],
  update(t, c, cam, shot) {
    const x = 600 + 19 * t; c.revo.group.position.set(x, 0, LANE_Z); c.revo.roll(x);
    c.traffic.update(t * 1.0, x); c.train.update(-900, 0);
    seatInRevo(c, t, { selfie: shot.id === 'R02' ? 1 : 0, talk: speaking(SUBS, t, 'Umer') });
    faceUpdate(c.driver, t, speaking(SUBS, t, 'Driver'));
    c.L.follow(new THREE.Vector3(x, 0, -4));
  }
};
