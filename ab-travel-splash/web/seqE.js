// SEQUENCE E — Islamabad: avenue (Revo, left-hand) → Faisal Mosque → Umer ka vlog outro
import * as THREE from 'three';
import { setupSkyAndLight, buildIslamabadAvenue, buildFaisalMosque, margallaHills, ground, islamabadTowers } from './lib/env.js';
import { createTraffic } from './lib/vehicles.js';
import { createCast, seatInRevo, selfieCam } from './lib/cast.js';
import { plan, applyPlan, holdCamera, camLerp, handheld, V3 } from './lib/anim.js';
import { poseCarryCam, poseSelfie, faceUpdate, createCharacter, LOOKS } from './lib/character.js';
import { smooth, range, clamp } from './lib/util.js';

const MOSQUE = new THREE.Vector3(0, 0, -440);
const PLAT = 3.0; // courtyard platform height
const ROADZ = 660; // avenue group offset (avenue z: -340 … 1660)

export default {
  id: 'E', title: 'Islamabad — Faisal Masjid',
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 28, azim: 165, sunI: 3.4, turbidity: 3.5, rayleigh: 2.6, fog: [0xbfcfdc, 500, 4500], shadowSize: 70, sunColor: '#fff1dc' });
    // avenue along Z: group rotated +90° → local +X = world −Z (mosque ki taraf)
    const R = new THREE.Group(); R.rotation.y = Math.PI / 2; R.position.z = ROADZ; scene.add(R);
    buildIslamabadAvenue(scene, R);
    margallaHills(scene, { z0: -540, height: 560, seed: 3 });
    const M = buildFaisalMosque(scene, MOSQUE, 1);
    islamabadTowers(scene, new THREE.Vector3(-170, 0, 420)); // Islamabad skyline reference
    islamabadTowers(scene, new THREE.Vector3(190, 0, 150)).scale.setScalar(0.8);
    // traffic in road-local frame (left-hand): +X lanes z<0
    const T = new THREE.Group(); R.add(T);
    const traffic = createTraffic(T, { lanes: [
      { z: -12.1, dir: 1, speed: 12, count: 8, kinds: ['sedan', 'hatch', 'van'] },
      { z: -4.9, dir: 1, speed: 17, count: 5, kinds: ['sedan', 'sedan'] },
      { z: 4.9, dir: -1, speed: 16, count: 8, kinds: ['sedan', 'hatch', 'van', 'bike'] },
      { z: 12.1, dir: -1, speed: 12, count: 8, kinds: ['sedan', 'bike', 'hatch'] }], seed: 61, window: 900 });
    const c = createCast(scene);
    R.add(c.revo.group);
    // visitors on courtyard
    const npcs = [];
    const looks = [{ ...LOOKS.driver, grey: false, hair: '#111', shirt: '#f1efe8', pants: '#f1efe8' }, { ...LOOKS.umer, cameraBag: false, shirt: '#5b6b3a', beardStyle: 'none', pants: '#222' }, { ...LOOKS.driver, shirt: '#9fb1c2', pants: '#9fb1c2' }];
    for (let i = 0; i < 9; i++) { const n = createCharacter(looks[i % 3], 120 + i); n.root.position.set(-30 + i * 7.5, PLAT, -360 - (i % 3) * 6); n.root.rotation.y = Math.PI + (i % 2 ? 0.4 : -0.4); scene.add(n.root); npcs.push(n); }
    const uP = plan(c.umer, [-6, -352], Math.PI, [{ at: 0.0, to: [-5.5, -357.5] }, { at: 4.95, face: 0, dur: 0.8 }]);
    return { L, R, M, traffic, npcs, uP, ...c };
  },
  shots: [
    { id: 'E01', dur: 6.0, desc: 'Drone: Revo avenue par Faisal Masjid ki taraf, Margalla Hills peeche',
      cam(t, c, cam) { const z = c.revoWorldZ; camLerp(cam, V3(-4, 70, z + 140), V3(-6, 48, z + 70), V3(0, 20, -440), V3(0, 25, -440), t / 6, 42); } },
    { id: 'E02', dur: 5.0, desc: 'Faisal Masjid establishing — minarets, tent-shaped hall, hills',
      cam(t, c, cam) { camLerp(cam, V3(70, 4, -215), V3(40, 5, -230), V3(0, 34, -440), V3(0, 38, -440), t / 5, 46); } },
    { id: 'E03', dur: 5.5, desc: 'Umer courtyard mein camera ke saath walk karta hai',
      cam(t, c, cam) { const h = handheld(t, 0.7); const p = c.umer.root.position; camLerp(cam, V3(p.x + 2.2, PLAT + 1.6, p.z + 4.2).add(h), V3(p.x + 1.8, PLAT + 1.65, p.z + 3.6).add(h), V3(p.x, PLAT + 6, p.z - 40), V3(p.x, PLAT + 10, p.z - 60), t / 5.5, 50); } },
    { id: 'E04', dur: 9.0, desc: 'Selfie vlog outro — Faisal Masjid peeche', selfie: true,
      cam(t, c, cam) { selfieCam(c, cam, t, { fov: 76, shake: 0.7 }); } },
    { id: 'E05', dur: 5.0, desc: 'Drone pull-back + end card',
      cam(t, c, cam) { camLerp(cam, V3(-12, PLAT + 6, -330), V3(-60, 90, -120), V3(0, 25, -430), V3(0, 30, -440), t / 5, 48); } }
  ],
  subs: [
    [1.0, 4.8, 'Umer', 'Islamabad ki sarkein — saaf, hari bhari, aur peeche Margalla!'],
    [6.5, 10.5, 'Umer', 'Aur yeh hai Faisal Masjid... SubhanAllah.'],
    [17.0, 20.0, 'Umer', 'Dosto, Karachi se Islamabad ka safar mukammal hua!'],
    [20.0, 22.8, 'Umer', 'Video pasand aaye to like, share aur subscribe zaroor karein.'],
    [22.8, 25.3, 'Umer', 'Agli episode mein milte hain — Allah Hafiz!']
  ],
  update(t, c, cam, shot) {
    // Revo: road-local +X par (world −Z), lane z = −8.5 (left), mosque ki taraf
    const x = -260 + 15 * Math.min(t, 6.0);
    c.revo.group.position.set(x, 0, -8.3); c.revo.roll(x);
    c.revoWorldZ = ROADZ - x;
    c.traffic.update(t, x);
    for (const n of c.npcs) { n.setNeutral(); faceUpdate(n, t, 0); }
    if (t < 11.0) {
      seatInRevo(c, t);
    } else {
      const lt = t - 11.0; const { umer, vcam } = c;
      if (umer.root.parent !== c.R.parent) c.R.parent.add(umer.root);
      applyPlan(umer, c.uP, lt, PLAT); poseCarryCam(umer, 1);
      const sw = smooth(range(lt, 5.0, 5.5)) * (1 - smooth(range(lt, 14.2, 14.6)));
      if (sw > 0) poseSelfie(umer, sw, Math.sin(lt * 2));
      umer.root.updateMatrixWorld(true);
      const head = new THREE.Vector3(); umer.J.head.getWorldPosition(head); head.y += 0.08;
      holdCamera(umer, vcam, sw > 0.5 ? head : new THREE.Vector3(0, PLAT + 20, -440));
      if (lt < 4.9) { umer.J.head.rotation.x = -0.25; } // minaret ki taraf upar dekhna
      faceUpdate(umer, lt, (t > 17.0 && t < 25.3) ? 1 : 0);
    }
    c.L.follow(t < 11 ? new THREE.Vector3(0, 0, c.revoWorldZ) : new THREE.Vector3(0, 0, -400));
  },
  overlay(g, W, H, t) {
    if (t < 26.3) return;
    const a = clamp((t - 26.3) / 0.6);
    g.globalAlpha = a; g.textAlign = 'center';
    g.fillStyle = 'rgba(8,18,32,0.6)'; g.fillRect(W / 2 - 600, H / 2 - 140, 1200, 260);
    g.fillStyle = '#ffffff'; g.font = 'bold 84px DejaVu Sans'; g.fillText('Shukriya dekhne ka!', W / 2, H / 2 - 20);
    g.fillStyle = '#ffd34d'; g.font = '600 44px DejaVu Sans'; g.fillText('Ab Travel Splash · Episode 2 jald aa raha hai', W / 2, H / 2 + 60);
    g.textAlign = 'left'; g.globalAlpha = 1;
  }
};
