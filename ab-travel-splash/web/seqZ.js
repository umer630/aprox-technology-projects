// REFERENCE SHEETS (production bible stills): characters, vehicles, airports
import * as THREE from 'three';
import { createCharacter, LOOKS, poseIdle, poseCarryCam, poseSelfie, faceUpdate, posePullBag, poseSalaam, poseWave } from './lib/character.js';
import { createVlogCam, createSuitcase } from './lib/props.js';
import { createRevo } from './lib/vehicles.js';
import { createCorolla } from './lib/world2.js';
import { holdCamera, attachBagToHand, V3 } from './lib/anim.js';
import { mat, mesh, canvasTex } from './lib/util.js';

export const CAST = [
  ['umer', 'Umer — Vlogger'], ['ammi', 'Ammi — Mother'], ['driver', 'Rashid Bhai — Driver'], ['entranceChecker', 'Entrance Checker'], ['checkinAgent', 'Check-in Agent'],
  ['baggageStaff', 'Baggage Drop Staff'], ['securityOfficer', 'Security Officer'], ['screeningStaff', 'Screening Staff'], ['loungeStaff', 'Lounge Staff'], ['gateAgent', 'Gate Agent'],
  ['cabinCrewF', 'Cabin Crew (F)'], ['cabinCrewM', 'Cabin Crew (M)'], ['pilot', 'Pilot'], ['coPilot', 'Co-Pilot'], ['passengerM', 'Passenger (M)'],
  ['passengerF', 'Passenger (F)'], ['youngPassenger', 'Young Passenger'], ['businessTraveller', 'Business Traveller'], ['technician', 'Airport Technician'], ['hotelStaff', 'Hotel Staff']
];
function studio(scene, col = '#d9dde3') {
  scene.background = new THREE.Color(col);
  const fl = mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.9 }), { cast: false }); fl.rotation.x = -Math.PI / 2; scene.add(fl);
  scene.add(new THREE.HemisphereLight('#ffffff', '#9aa3ad', 1.6));
  const k = new THREE.DirectionalLight('#fff4e6', 2.2); k.position.set(6, 12, 10); k.castShadow = true; k.shadow.mapSize.set(2048, 2048); Object.assign(k.shadow.camera, { left: -16, right: 16, top: 10, bottom: -10, near: 1, far: 60 }); k.shadow.radius = 4; scene.add(k);
  const r = new THREE.DirectionalLight('#cfe0ff', 0.8); r.position.set(-8, 6, -6); scene.add(r);
}
const label = (g, x, y, txt, size = 22) => { g.font = `bold ${size}px DejaVu Sans`; const w = g.measureText(txt).width; g.fillStyle = 'rgba(12,28,58,0.88)'; g.fillRect(x - w / 2 - 10, y - size, w + 20, size + 12); g.fillStyle = '#ffd34d'; g.textAlign = 'center'; g.fillText(txt, x, y); g.textAlign = 'left'; };

export default {
  id: 'Z', title: null, exposure: 0.9,
  build(scene) {
    studio(scene);
    const chars = CAST.map(([k, nm], i) => {
      const C = createCharacter({ ...LOOKS[k], cameraBag: false }, 700 + i); const grp = Math.floor(i / 5), col = i % 5;
      C.root.position.set(grp * 30 + (col - 2) * 1.25, 0, 0); scene.add(C.root); return { C, nm, k };
    });
    const vcam = createVlogCam(); const bag = createSuitcase('#111', 'travelsplash'); scene.add(bag.group);
    return { chars, vcam, bag };
  },
  shots: [0, 1, 2, 3].map(k => ({ id: 'Z0' + (k + 1), dur: 1, desc: 'Character sheet ' + (k + 1), cam(t, c, cam) { cam.position.set(k * 30, 1.25, 6.2); cam.lookAt(k * 30, 0.95, 0); cam.fov = 42; c._cam = cam; } })),
  update(t, c) {
    c.chars.forEach(({ C, k }, i) => { C.setNeutral(); poseIdle(C, 1); C.root.rotation.y = i < 10 ? 0 : 0; faceUpdate(C, 2, 0);
      if (k === 'umer') { poseCarryCam(C, 1); poseSelfie(C, 0.6); C.root.updateMatrixWorld(true); holdCamera(C, c.vcam, V3(C.root.position.x, 1.6, 5)); posePullBag(C, 1); c.bag.setExtend(1); attachBagToHand(C, 'L', c.bag); }
      if (k === 'ammi') poseSalaam(C, 1); if (k === 'cabinCrewF' || k === 'gateAgent') poseWave(C, 2, 'R', 0.6); });
  },
  overlay(g, W, H, t, c) {
    g.fillStyle = 'rgba(12,28,58,0.92)'; g.fillRect(0, 0, W, 70); g.fillStyle = '#fff'; g.font = 'bold 36px DejaVu Sans'; g.fillText('TRAVEL SPLASH — EPISODE 1  ·  3D CHARACTER PACK (20)', 30, 48);
    if (!c._cam) return;
    c.chars.forEach(({ C, nm }, i) => { const p = C.root.position.clone(); p.y = -0.08; p.project(c._cam); if (Math.abs(p.x) < 1.1) label(g, (p.x * 0.5 + 0.5) * W, (-p.y * 0.5 + 0.5) * H + 34, (i + 1) + '. ' + nm, 30); });
  }
};
