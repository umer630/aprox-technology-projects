// INTRO — Karachi subah ka drone shot + title
import * as THREE from 'three';
import { setupSkyAndLight, buildKarachiRoad } from './lib/env.js';
import { createTraffic } from './lib/vehicles.js';
import { SHAHRAH_LANES as KHI_LANES } from './lib/karachi.js';
import { camLerp, V3 } from './lib/anim.js';
import { clamp, smooth } from './lib/util.js';

export default {
  id: 'I', ambience: 'street', sfx: [[0.0, 'music_sting']], title: null, exposure: 0.8,
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 9, azim: 95, sunI: 3.0, turbidity: 6, rayleigh: 2.2, fog: [0xe6c9a4, 90, 700], shadowSize: 120, sunColor: '#ffd29a' });
    buildKarachiRoad(scene);
    const traffic = createTraffic(scene, { lanes: KHI_LANES.map(l => ({ ...l, z: l.z === -2.75 ? -2.75 : l.z })), seed: 4 });
    return { L, traffic };
  },
  shots: [
    { id: 'I01', dur: 5.5, desc: 'Drone dawn shot — Karachi shahrah, title card',
      cam(t, c, cam) { camLerp(cam, V3(-130, 55, 0.5), V3(-80, 38, 0.5), V3(60, 4, 0), V3(80, 2, -2), t / 5.5, 50); } }
  ],
  update(t, c) { c.traffic.update(t, 0); c.L.follow(new THREE.Vector3(0, 0, 0)); },
  overlay(g, W, H, t) {
    const a = clamp(Math.min((t - 0.4) / 0.8, (5.5 - t) / 0.6));
    g.fillStyle = `rgba(0,0,0,${clamp(1 - t / 0.6) })`; g.fillRect(0, 0, W, H);
    g.globalAlpha = a; g.textAlign = 'center';
    g.fillStyle = 'rgba(8,18,32,0.55)'; g.fillRect(W / 2 - 560, H / 2 - 150, 1120, 270);
    g.fillStyle = '#ffc93c'; g.fillRect(W / 2 - 560, H / 2 + 116, 1120, 6);
    g.fillStyle = '#ffffff'; g.font = 'bold 118px DejaVu Sans'; g.fillText('AB TRAVEL SPLASH', W / 2, H / 2 - 10);
    g.font = '600 50px DejaVu Sans'; g.fillStyle = '#ffd34d'; g.fillText('Episode 1  ·  Karachi se Islamabad', W / 2, H / 2 + 80);
    g.textAlign = 'left'; g.globalAlpha = 1;
  }
};
