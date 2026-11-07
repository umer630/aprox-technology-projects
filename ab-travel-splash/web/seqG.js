// SEQUENCE G — Gate lounge → glass jet bridge → aircraft door (Karachi)
import * as THREE from 'three';
import { setupSkyAndLight, ground, buildGateAndBridge } from './lib/env.js';
import { createAircraft } from './lib/aircraft.js';
import { createCast } from './lib/cast.js';
import { createCharacter, LOOKS, poseCarryCam, poseSit, faceUpdate } from './lib/character.js';
import { plan, applyPlan, holdCamera, camLerp, handheld, V3 } from './lib/anim.js';
import { mat, mesh } from './lib/util.js';

export default {
  id: 'G', title: 'Gate aur Jet Bridge',
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 34, azim: 150, sunI: 3.2, hemiI: 1.1, fog: [0xdcd8cc, 150, 1500], shadowSize: 60 });
    ground(scene, 3000, '#b5ab92');
    const apron = mesh(new THREE.PlaneGeometry(400, 300), mat('#9c9c98', 0.95), { cast: false }); apron.rotation.x = -Math.PI / 2; apron.position.set(0, 0.005, 40); scene.add(apron);
    const ac = createAircraft(); scene.add(ac.group);
    const FL = ac.CY - 1.2;
    const gb = buildGateAndBridge(scene, FL);
    const c = createCast(scene, { revo: false, driver: false });
    const npcs = [];
    const looks = [{ ...LOOKS.driver, grey: false, hair: '#111', shirt: '#ece7dc', pants: '#ece7dc' }, { ...LOOKS.agent, vest: null, shirt: '#3e5f7a', pants: '#2b2b2b' }, { ...LOOKS.driver, shirt: '#8aa0b4', pants: '#8aa0b4', grey: true }];
    for (let i = 0; i < 8; i++) { const n = createCharacter(looks[i % 3], 140 + i); const x = [-4, -2.9, 8, 9.1, 20, 21.1, 32, 33.1][i]; n.root.position.set(x - 0.3, FL + 0.0, -44 - (i % 2) * 2.2); n.root.rotation.y = Math.PI; scene.add(n.root); npcs.push(n); }
    const P1 = plan(c.umer, [6.0, -47.5], 0.6, [{ at: 0.2, to: [13.6, -42.2] }]);
    const P2 = plan(c.umer, [14.0, -15.0], 0, [{ at: 5.5, to: [14.0, -7.0] }]);
    return { L, ac, FL, gb, npcs, P1, P2, ...c };
  },
  shots: [
    { id: 'G01', dur: 5.5, desc: 'Gate lounge: steel seats, glass wall ke bahar aircraft, Umer gate ki taraf',
      cam(t, c, cam) { const h = handheld(t, 0.5); camLerp(cam, V3(18.5, c.FL + 1.7, -51).add(h), V3(18, c.FL + 1.7, -50).add(h), V3(9.5, c.FL + 1.4, -44), V3(12.5, c.FL + 1.5, -40), t / 5.5, 50); } },
    { id: 'G02', dur: 6.0, desc: 'Jet bridge: Umer ke peeche se tracking, glass ke bahar apron',
      cam(t, c, cam) { const z = c.umer.root.position.z; cam.position.set(14.35, c.FL + 1.62, z - 3.2 + Math.sin(t * 5) * 0.01); cam.lookAt(14.0, c.FL + 1.35, z + 6); cam.fov = 58; } },
    { id: 'G03', dur: 4.5, desc: 'Exterior: jet bridge aircraft ke port door se attached',
      cam(t, c, cam) { camLerp(cam, V3(46, 6, -36), V3(40, 5, -30), V3(12, 3.5, -10), V3(12, 3.5, -8), t / 4.5, 40); } }
  ],
  subs: [
    [0.6, 3.6, 'Umer', 'Boarding shuru ho gayi — gate ki taraf chalte hain!'],
    [6.0, 9.6, 'Umer', 'Yeh jet bridge seedha jahaz ke darwaze tak jata hai.']
  ],
  update(t, c) {
    const { umer, vcam } = c;
    for (const n of c.npcs) { n.setNeutral(); poseSit(n, 1); n.root.position.y = c.FL + 0.0; faceUpdate(n, t, 0); }
    applyPlan(umer, t < 5.5 ? c.P1 : c.P2, t, c.FL); poseCarryCam(umer, 1);
    umer.root.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(Math.sin(umer.root.rotation.y), 0, Math.cos(umer.root.rotation.y));
    holdCamera(umer, vcam, umer.root.position.clone().addScaledVector(fwd, 4).setY(c.FL + 1));
    faceUpdate(umer, t, (t > 0.6 && t < 3.6) || (t > 6.0 && t < 9.6) ? 1 : 0);
    c.ac.gearDown(1); c.ac.spin(0);
    c.L.follow(new THREE.Vector3(8, 0, -20));
  }
};
