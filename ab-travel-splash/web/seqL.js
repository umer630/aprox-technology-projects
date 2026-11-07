// SEQUENCE L — Islamabad landing: runway alignment, 3° glide, flare, touchdown, rollout. Margalla Hills peeche.
import * as THREE from 'three';
import { setupSkyAndLight, buildRunway, margallaHills } from './lib/env.js';
import { createAircraft } from './lib/aircraft.js';
import { V3 } from './lib/anim.js';
import { smooth, range, clamp, softSprite } from './lib/util.js';

const TD = 4.2; // touchdown time
function state(t) {
  const v = t < TD ? 68 : Math.max(20, 68 - 4.5 * (t - TD));
  const x = t < TD ? 150 - 68 * (TD - t) : 150 + 68 * (t - TD) - 0.5 * 4.5 * (t - TD) ** 2;
  let y = t < TD ? Math.tan(3 * Math.PI / 180) * (150 - x) : 0;
  const flare = smooth(range(t, TD - 1.6, TD)); if (t < TD) y *= (1 - 0.45 * flare);
  const pitch = t < TD ? 0.04 + 0.06 * flare : 0.1 * (1 - smooth(range(t, TD + 0.3, TD + 2.0)));
  return { x, y, v, pitch, d: x };
}

export default {
  id: 'L', ambience: 'jet', sfx: [[0.0, 'jet_approach'], [4.2, 'touchdown']], title: 'Islamabad — Landing',
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 26, azim: 210, sunI: 3.2, fog: [0xc6d3dc, 400, 5000], shadowSize: 60, sunColor: '#fff0da' });
    buildRunway(scene, { terrain: 'islamabad' });
    margallaHills(scene, { z0: -700, height: 520, seed: 5 });
    const ac = createAircraft(); scene.add(ac.group);
    // touchdown tyre smoke puffs
    const smokeM = new THREE.SpriteMaterial({ map: softSprite('#e8e8e8', 64), transparent: true, depthWrite: false, opacity: 0 });
    const puffs = []; for (let i = 0; i < 8; i++) { const s = new THREE.Sprite(smokeM.clone()); scene.add(s); puffs.push(s); }
    return { L, ac, puffs };
  },
  shots: [
    { id: 'L01', dur: 4.0, desc: 'Final approach: runway se aligned, gear down, Margalla Hills peeche',
      cam(t, c, cam) { const p = c.ac.group.position; cam.position.set(255, 2.0, 80); cam.lookAt(p.x + 5, p.y + 4, 0); cam.fov = 34; } },
    { id: 'L02', dur: 4.5, desc: 'Touchdown + rollout — main gear pehle, phir nose gear',
      cam(t, c, cam) { const p = c.ac.group.position; cam.position.set(p.x - 30 + t * 4, 3.2, 48); cam.lookAt(p.x + 4, 3.5, 0); cam.fov = 42; } }
  ],
  subs: [
    [0.4, 3.6, 'Umer', 'Islamabad aa gaya! Peeche Margalla Hills dekhiye.', 'اسلام آباد آ گیا! پیچھے مارگلہ ہلز دیکھیے۔'],
    [5.0, 7.6, 'Umer', 'Smooth landing — Alhamdulillah!', 'اسموتھ لینڈنگ، الحمدللہ!']
  ],
  update(t, c) {
    const s = state(t); const ac = c.ac;
    ac.group.position.set(s.x, s.y, 0); ac.pitch(s.pitch); ac.gearDown(1); ac.rollWheels(t > TD ? s.d : 0); ac.spin(t);
    // nose-wheel tak pitch → nose gear ground par TD+2s ke baad
    c.puffs.forEach((p, i) => {
      const age = t - TD - i * 0.04; const on = age > 0 && age < 1.6;
      p.visible = on; if (!on) return;
      const side = i % 2 ? 1 : -1; p.position.set(150 + 2 - age * 6, 0.6 + age * 1.2, side * 3.8 + (i - 4) * 0.1);
      const sc = 1.5 + age * 5; p.scale.set(sc, sc * 0.6, 1); p.material.opacity = 0.55 * (1 - age / 1.6);
    });
    c.L.follow(new THREE.Vector3(s.x, 0, 0));
  }
};
