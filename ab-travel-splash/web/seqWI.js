// REFERENCE — airport 3D architectural views (reference sheet only, video mein drone shots nahi)
import * as THREE from 'three';
import { setupSkyAndLight, ground, margallaHills } from './lib/env.js'; import { buildIIAPExterior } from './lib/world2.js';
const C = new THREE.Vector3(0, 10, 0);
const VIEWS = [['Aerial 3/4', [150, 110, 170]], ['Front elevation', [0, 12, 160]], ['Side / approach', [-190, 30, 70]], ['Kerb level (passenger eye)', [40, 1.7, 40]]];
const shots = VIEWS.map(([vn, p], i) => ({ id: 'WI' + (i + 1), dur: 1, desc: vn, cam(t, c, cam) { cam.position.set(C.x + p[0], p[1], C.z + p[2]); cam.lookAt(C.x, i === 3 ? 8 : C.y, C.z); cam.fov = i === 3 ? 70 : 45; cam.updateProjectionMatrix(); } }));
export default {
  id: 'WI', title: null, exposure: 0.9, shots,
  build(scene, renderer) { const L = setupSkyAndLight(scene, renderer, { elev: 38, azim: 340, sunI: 3.2, fog: [0xd0d8e0, 600, 4000], shadowSize: 200 }); ground(scene, 4000, '#86a85a'); buildIIAPExterior(scene); margallaHills(scene, { z0: -500, height: 500, seed: 9 }); L.follow(C.clone()); return { L }; },
  update() {},
  overlay(g, W, H, t) { const v = VIEWS[Math.min(3, Math.floor(t))][0]; g.save(); g.fillStyle = 'rgba(12,28,58,0.88)'; g.fillRect(0, H - 120, W, 120); g.fillStyle = '#ffd34d'; g.font = 'bold 32px DejaVu Sans'; g.fillText('Islamabad International Airport — terminal (3D reference)', 40, H - 68); g.fillStyle = '#fff'; g.font = '600 32px DejaVu Sans'; g.fillText('View: ' + v + '   ·   Ab Travel Splash EP1', 40, H - 24); g.restore(); }
};
