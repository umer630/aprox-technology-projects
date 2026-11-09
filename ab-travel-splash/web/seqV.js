// REFERENCE SHEET — vehicles 4-view: white Toyota Revo (Rashid Bhai) + white Toyota Corolla Grande 1.8 (Islamabad)
import * as THREE from 'three';
import { createRevo } from './lib/vehicles.js';
import { createCorolla } from './lib/world2.js';
import { mesh } from './lib/util.js';

const VIEWS = [['Front', [7.5, 1.3, 0]], ['Side (left / passenger)', [0, 1.4, -9]], ['Rear', [-7.5, 1.4, 0]], ['3/4 Front', [5.6, 2.6, -6.2]]];
const CARS = [['Toyota Revo — white (Karachi, Rashid Bhai)', 0], ['Toyota Corolla Grande 1.8 — white (Islamabad)', 40]];
const shots = []; CARS.forEach(([nm, X], ci) => VIEWS.forEach(([vn, p], vi) => shots.push({ id: `V${ci + 1}${vi + 1}`, dur: 1, desc: `${nm} — ${vn}`, label: [nm, vn],
  cam(t, c, cam) { cam.position.set(X + p[0], p[1], p[2]); cam.lookAt(X, 0.85, 0); cam.fov = 40; cam.updateProjectionMatrix(); } })));
export default {
  id: 'V', title: null, exposure: 0.9, shots,
  build(scene) {
    scene.background = new THREE.Color('#d9dde3');
    const fl = mesh(new THREE.PlaneGeometry(400, 200), new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.9 }), { cast: false }); fl.rotation.x = -Math.PI / 2; scene.add(fl);
    scene.add(new THREE.HemisphereLight('#ffffff', '#9aa3ad', 1.6));
    for (const X of [0, 40]) { const k = new THREE.DirectionalLight('#fff4e6', 2.0); k.position.set(X + 6, 12, -8); k.target.position.set(X, 0, 0); scene.add(k.target); k.castShadow = true; k.shadow.mapSize.set(2048, 2048); Object.assign(k.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 }); scene.add(k); }
    const revo = createRevo(); scene.add(revo.group); const car = createCorolla('#f4f4f2'); car.group.position.x = 40; scene.add(car.group);
    return { revo, car };
  },
  update() {},
  overlay(g, W, H, t) {
    const sh = shots[Math.min(shots.length - 1, Math.floor(t))]; g.save();
    g.fillStyle = 'rgba(12,28,58,0.88)'; g.fillRect(0, H - 120, W, 120); g.fillStyle = '#ffd34d'; g.font = 'bold 44px DejaVu Sans'; g.fillText(sh.label[0], 40, H - 66);
    g.fillStyle = '#fff'; g.font = '600 34px DejaVu Sans'; g.fillText('View: ' + sh.label[1] + '   ·   Ab Travel Splash EP1 vehicle reference', 40, H - 22); g.restore();
  }
};
