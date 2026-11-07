// SEQUENCE F — Cruise: baadalon ke upar exterior + cabin window seat + selfie
import * as THREE from 'three';
import { setupSkyAndLight, buildClouds } from './lib/env.js';
import { createAircraft } from './lib/aircraft.js';
import { createCast, selfieCam } from './lib/cast.js';
import { poseSit, poseCarryCam, poseSelfie, faceUpdate } from './lib/character.js';
import { holdCamera, camLerp, V3 } from './lib/anim.js';
import { mat, mesh, box, rbox, smooth, range } from './lib/util.js';

const V = 230; // m/s cruise

function buildCabin(ac) {
  // fuselage ke andar (aircraft body ke local frame mein). Exterior fuselage single-sided hai → andar se window ke bahar wing/baadal nazar aate hain.
  const g = new THREE.Group(); ac.body.add(g);
  const CY = ac.CY; const wallM = new THREE.MeshStandardMaterial({ color: '#e9e7e2', roughness: 0.7, side: THREE.DoubleSide });
  // port side wall (z = -1.72) with oval window holes
  const wallShape = new THREE.Shape(); wallShape.moveTo(-14, -1.2); wallShape.lineTo(12, -1.2); wallShape.lineTo(12, 1.5); wallShape.lineTo(-14, 1.5); wallShape.closePath();
  for (let x = -12.5; x < 11; x += 0.53 * 1.5) {
    const h = new THREE.Path(); h.absellipse(x, 0.35, 0.13, 0.19, 0, Math.PI * 2, false); wallShape.holes.push(h);
  }
  const wall = mesh(new THREE.ShapeGeometry(wallShape, 24), wallM); wall.position.set(0, CY, -1.72); g.add(wall);
  // window bezels
  for (let x = -12.5; x < 11; x += 0.53 * 1.5) { const r = mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 24), mat('#d8d5ce', 0.6)); r.scale.set(0.85, 1.2, 1); r.position.set(x, CY + 0.35, -1.7); g.add(r); }
  // floor, ceiling, overhead bins
  g.add(box(26, 0.05, 3.6, mat('#2d3644', 0.95), -1, CY - 1.2, 0, { cast: false }));
  const bins = box(26, 0.45, 0.7, mat('#efedea', 0.5), -1, CY + 1.25, -1.35); bins.rotation.x = 0.35; g.add(bins);
  g.add(box(26, 0.05, 3.6, mat('#f3f2ef', 0.6), -1, CY + 1.7, 0, { cast: false }));
  // starboard wall (solid)
  g.add(box(26, 2.8, 0.05, wallM, -1, CY + 0.15, 1.72, { cast: false }));
  // seats (3+3) rows along X
  const seatM = new THREE.MeshStandardMaterial({ color: '#25345a', roughness: 0.95 }); const headM = mat('#d9dde6', 0.8);
  for (let x = -11; x < 9; x += 0.8) for (const z of [-1.35, -0.85, -0.35, 0.35, 0.85, 1.35]) {
    if (x > -0.3 && x < 1.2 && z < -0.3) continue; // Umer ke aage wali row (selfie arm ke liye jagah)
    g.add(box(0.48, 0.12, 0.46, seatM, x, CY - 0.72, z)); const bk = box(0.1, 0.72, 0.46, seatM, x - 0.24, CY - 0.33, z); bk.rotation.z = -0.12; g.add(bk);
    g.add(box(0.06, 0.18, 0.4, headM, x - 0.3, CY + 0.06, z));
  }
  const lamp = new THREE.PointLight('#fff3e0', 6, 6, 1.5); lamp.position.set(-1, CY + 1.4, 0); g.add(lamp);
  return g;
}

export default {
  id: 'F', ambience: 'cabin', title: 'Baadalon ke upar',
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 11, azim: 120, sunI: 3.6, turbidity: 5, rayleigh: 2.6, fog: [0xc9d6e6, 800, 7000], shadowSize: 30, sunColor: '#ffe2b8' });
    scene.fog.color.set('#cfdcec');
    const clouds = buildClouds(scene, { y: -70, count: 1100, spread: 7000, seed: 8 });
    const ac = createAircraft(); scene.add(ac.group); ac.gearDown(0);
    const cabin = buildCabin(ac);
    const c = createCast(scene, { revo: false, driver: false });
    ac.body.add(c.umer.root);
    return { L, ac, clouds, cabin, ...c };
  },
  shots: [
    { id: 'F01', dur: 5.5, desc: 'Exterior chase: aircraft cruise, wings level, baadal neeche',
      cam(t, c, cam) { const x = c.ac.group.position.x; camLerp(cam, V3(x + 34, 9, 52), V3(x + 12, 5, 44), V3(x, 3.5, 0), V3(x - 2, 3.5, 0), t / 5.5, 40); } },
    { id: 'F02', dur: 5.5, desc: 'Window POV: wing, engine aur baadal (Umer ki nazar se)',
      cam(t, c, cam) { const x = c.ac.group.position.x; const CY = c.ac.CY; cam.position.set(x - 0.5 + t * 0.01, CY + 0.38, -1.2); cam.lookAt(x - 6, CY - 2.2, -14); cam.fov = 48; } },
    { id: 'F03', dur: 5.0, desc: 'Selfie vlog seat se', selfie: true,
      cam(t, c, cam) { selfieCam(c, cam, t, { fov: 72, shake: 0.5 }); } }
  ],
  subs: [
    [6.0, 8.6, 'Umer', 'Dekhiye dosto — baadalon ke upar kya nazara hai!', 'دیکھیے دوستو، بادلوں کے اوپر کیا نظارہ ہے!'],
    [11.3, 13.6, 'Umer', 'Karachi peeche reh gaya — Islamabad ab zyada door nahi.', 'کراچی پیچھے رہ گیا، اسلام آباد اب زیادہ دور نہیں۔'],
    [13.6, 16.0, 'Umer', 'Thori der mein landing hogi, InshaAllah!', 'تھوڑی دیر میں لینڈنگ ہوگی، ان شاء اللہ!']
  ],
  update(lt, c, cam, shot) {
    const { ac, umer, vcam } = c; const x = V * lt;
    ac.group.position.set(x, 0, 0); ac.pitch(0.03); ac.roll(0.004 * Math.sin(lt * 0.7)); ac.spin(lt);
    ac.group.position.y = 0.15 * Math.sin(lt * 0.9); // halki turbulence
    // Umer window seat (port, z=-1.35), facing +X
    umer.setNeutral(); poseSit(umer, 1);
    umer.root.position.set(-0.85, ac.CY - 1.04, -1.35); umer.root.rotation.y = Math.PI / 2;
    poseCarryCam(umer, 1);
    const selfie = shot.id === 'F03' ? 1 : 0;
    if (selfie) poseSelfie(umer, 1, Math.sin(lt * 2));
    if (shot.id === 'F02') { umer.J.neck.rotation.y = 0.8; umer.J.head.rotation.y = 0.3; } // window ki taraf dekhna
    ac.group.updateMatrixWorld(true);
    const head = new THREE.Vector3(); umer.J.head.getWorldPosition(head); head.y += 0.08;
    holdCamera(umer, vcam, selfie ? head : head.clone().add(new THREE.Vector3(1, -0.3, -1)));
    faceUpdate(umer, lt, (lt > 6.0 && lt < 8.6) || (lt > 11.3 && lt < 16.0) ? 1 : 0);
    c.L.follow(new THREE.Vector3(x, 0, 0));
  }
};
