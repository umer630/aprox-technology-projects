// SEQUENCE D — Karachi runway: taxi → takeoff roll → rotation → climb (nose +X, physically correct direction)
import * as THREE from 'three';
import { setupSkyAndLight, buildRunway } from './lib/env.js';
import { createAircraft } from './lib/aircraft.js';
import { camLerp, V3 } from './lib/anim.js';
import { smooth, range, clamp } from './lib/util.js';

// kinematics per shot (s = shot-local time)
function state(lt) {
  if (lt < 5.0) { const s = lt; return { x: -230 + 9 * s, y: 0, pitch: 0, v: 9, gear: 1, d: 9 * s }; }
  if (lt < 10.0) { const s = lt - 5.0; const v0 = 36, a = 3.0; return { x: 300 + v0 * s + 0.5 * a * s * s, y: 0, pitch: 0, v: v0 + a * s, gear: 1, d: v0 * s + 0.5 * a * s * s }; }
  const s = lt - 10.0; const v0 = 72, a = 1.6; const x = 1350 + v0 * s + 0.5 * a * s * s;
  const pitch = 0.15 * smooth(range(s, 0.5, 2.6)) + 0.02 * smooth(range(s, 4, 6));
  const air = Math.max(0, s - 1.9); const y = 0.5 * 3.2 * air * air; // vertical accel → climb
  return { x, y, pitch, v: v0 + a * s, gear: 1 - smooth(range(s, 4.2, 6.0)), d: x };
}

export default {
  id: 'D', title: 'Runway — Takeoff',
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 30, azim: 200, sunI: 3.4, fog: [0xd8d6cc, 300, 3500], shadowSize: 50, sunColor: '#fff2dc' });
    buildRunway(scene, { terrain: 'karachi' });
    const ac = createAircraft(); scene.add(ac.group);
    // ground vehicles near apron (left-hand)
    return { L, ac };
  },
  shots: [
    { id: 'D01', dur: 5.0, desc: 'Runway par taxi — nose aage, gear down, wheels ground par',
      cam(t, c, cam) { const x = c.ac.group.position.x; camLerp(cam, V3(x + 28, 2.2, 44), V3(x + 20, 2.0, 40), V3(x + 2, 4, 0), V3(x + 2, 4, 0), t / 5, 40); } },
    { id: 'D02', dur: 5.0, desc: 'Takeoff roll — runway follow shot, speed barhti hai',
      cam(t, c, cam) { const x = c.ac.group.position.x; cam.position.set(x - 42 + t * 2, 6.5, -24); cam.lookAt(x + 6, 4, 0); cam.fov = 44; } },
    { id: 'D03', dur: 7.0, desc: 'Rotation + liftoff + climb, gear retract — wide side',
      cam(t, c, cam) { const p = c.ac.group.position; cam.position.set(1700, 1.8, 120); cam.lookAt(p.x, p.y + 4, p.z); cam.fov = 30 - t * 1.2; } }
  ],
  subs: [
    [0.6, 3.6, 'Umer', 'Boarding ho gayi — ab runway ki taraf!'],
    [5.4, 8.4, 'Umer', 'Takeoff... Bismillah!']
  ],
  update(lt, c) {
    const s = state(lt); const ac = c.ac;
    ac.group.position.set(s.x, s.y, 0); ac.pitch(s.pitch); ac.gearDown(s.gear); ac.rollWheels(s.d); ac.spin(lt);
    c.L.follow(new THREE.Vector3(s.x, 0, 0));
  }
};
