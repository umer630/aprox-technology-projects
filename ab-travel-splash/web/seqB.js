// SEQUENCE B — Karachi arterial road (Shahrah-e-Faisal style): Revo LEFT carriageway par, traffic left-hand.
import * as THREE from 'three';
import { setupSkyAndLight, buildKarachiRoad } from './lib/env.js';
import { createTraffic } from './lib/vehicles.js';
import { createCast, seatInRevo, selfieCam } from './lib/cast.js';
import { camLerp, V3 } from './lib/anim.js';
import { smooth, range } from './lib/util.js';

export const KHI_LANES = [
  { z: -6.45, dir: 1, speed: 11.5, count: 16, kinds: ['sedan', 'hatch', 'hatch', 'van', 'sedan', 'bus'] },
  { z: -7.75, dir: 1, speed: 9.0, count: 18, kinds: ['bike', 'bike', 'rickshaw', 'bike'] },
  { z: 2.75, dir: -1, speed: 15, count: 14, kinds: ['sedan', 'hatch', 'sedan', 'van'] },
  { z: 6.45, dir: -1, speed: 11, count: 14, kinds: ['sedan', 'hatch', 'van', 'bus', 'rickshaw'] },
  { z: 7.75, dir: -1, speed: 9, count: 14, kinds: ['bike', 'bike', 'rickshaw'] }
];
const LANE_Z = -2.75, SPEED = 14;

export default {
  id: 'B', title: 'Karachi — Shahrah par safar',
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 30, azim: 150, sunI: 3.3, fog: [0xd9d3c4, 80, 520], shadowSize: 45, sunColor: '#fff0d6' });
    buildKarachiRoad(scene);
    const traffic = createTraffic(scene, { lanes: KHI_LANES, seed: 12 });
    const c = createCast(scene);
    c.revo.group.position.set(0, 0, LANE_Z);
    return { L, traffic, ...c };
  },
  shots: [
    { id: 'B01', dur: 5.0, desc: 'Aerial crane: Revo left carriageway par, dono taraf traffic',
      cam(t, c, cam) { const x = c.revo.group.position.x; camLerp(cam, V3(x - 42, 26, 22), V3(x - 22, 12, 12), V3(x + 10, 0, -3), V3(x + 4, 0.8, -3), t / 5, 42); } },
    { id: 'B02', dur: 4.5, desc: 'Side tracking shot — wheels rotating, driver RIGHT seat',
      cam(t, c, cam) { const x = c.revo.group.position.x; cam.position.set(x + 1.2 - t * 0.5, 1.15, LANE_Z - 7.2 + Math.sin(t * 7) * 0.01); cam.lookAt(x + 0.4, 1.0, LANE_Z); cam.fov = 38; } },
    { id: 'B03', dur: 5.0, desc: 'Andar se selfie vlog — Karachi traffic', selfie: true,
      cam(t, c, cam) { selfieCam(c, cam, t, { fov: 74, shake: 1.4 }); } }
  ],
  subs: [
    [9.9, 12.3, 'Umer', 'Dekhiye dosto, Karachi ki sarkon par subah ka rush!'],
    [12.3, 14.5, 'Umer', 'Airport bas thori hi door hai.']
  ],
  update(t, c, cam, shot) {
    const x = SPEED * t; c.revo.group.position.set(x, 0, LANE_Z); c.revo.roll(x);
    c.revo.group.position.y = 0.006 * Math.sin(t * 9.0); // road texture vibration
    c.traffic.update(t, x);
    seatInRevo(c, t, { selfie: shot.id === 'B03' ? 1 : 0, talk: t > 9.9 && t < 14.4 ? 1 : 0 });
    c.L.follow(new THREE.Vector3(x, 0, 0));
  }
};
