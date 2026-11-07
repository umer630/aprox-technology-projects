// SEQUENCE N — Departure lounge: food court (McDonald's, Chai Khana, Biryani), doston se mulaqat, nashta,
// speaker par boarding announcement
import * as THREE from 'three';
import { setupSkyAndLight, ground } from './lib/env.js';
import { buildFoodCourt, foodTray, wallBanner } from './lib/world2.js';
import { createAircraft } from './lib/aircraft.js';
import { createCast } from './lib/cast.js';
import { createCharacter, LOOKS, poseIdle, poseSit, poseEat, poseReach, poseCarryFront, poseCarryCam, poseWave, faceUpdate } from './lib/character.js';
import { plan, applyPlan, holdCamera, attachToHand, placeWorld, camLerp, handheld, speaking, V3 } from './lib/anim.js';
import { mat, mesh, box, canvasTex, smooth, range } from './lib/util.js';

const SUBS = [
  [9.0, 12.4, 'Umer', 'Ek burger, fries aur ek chai, please.', 'ایک برگر، فرائز اور ایک چائے، پلیز۔'],
  [12.8, 15.4, 'Staff', 'Ji sir, abhi lijiye!', 'جی سر، ابھی لیجیے!'],
  [21.0, 24.4, 'Bilal', 'Arey Umer! Tum bhi Islamabad ja rahe ho?', 'ارے عمر! تم بھی اسلام آباد جا رہے ہو؟'],
  [24.8, 29.6, 'Umer', 'Haan yaar! Raaste mein gaari kharab ho gayi thi, bas abhi pohancha hoon.', 'ہاں یار! راستے میں گاڑی خراب ہو گئی تھی، بس ابھی پہنچا ہوں۔'],
  [30.0, 33.6, 'Hamza', 'Shukar hai pohanch gaye! Chalo, araam se nashta karo.', 'شکر ہے پہنچ گئے! چلو، آرام سے ناشتہ کرو۔'],
  [34.4, 37.6, 'Umer', 'Yeh burger to zabardast hai, yaar!', 'یہ برگر تو زبردست ہے یار!'],
  [41.0, 49.0, 'Announcement', 'Mohtaram musafiron, Islamabad jane wali parwaz ki boarding shuru ho chuki hai. Baraye meharbani gate ki taraf tashreef le jayen. Shukriya.', 'محترم مسافروں، اسلام آباد جانے والی پرواز کی بورڈنگ شروع ہو چکی ہے۔ برائے مہربانی گیٹ کی طرف تشریف لے جائیں۔ شکریہ۔'],
  [49.6, 52.4, 'Umer', 'Chalo yaar, boarding shuru!', 'چلو یار، بورڈنگ شروع!']
];
const TBL = new THREE.Vector3(-4, 0, -6);
export default {
  id: 'N', title: 'Departure Lounge', exposure: 0.66, subs: SUBS, ambience: 'hall', sfx: [[40.2, 'chime']],
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 40, azim: 160, sunI: 2.6, hemiI: 0.6, fog: [0xdcd8d0, 200, 900], shadowSize: 30 });
    ground(scene, 2000, '#8f8f8a');
    const floorT = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, w, h); g.strokeStyle = '#cfc8bb'; g.lineWidth = 2; for (let i = 0; i <= w; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }, { repeat: [20, 14] });
    const f = mesh(new THREE.PlaneGeometry(80, 32), new THREE.MeshPhysicalMaterial({ map: floorT, roughness: 0.2, clearcoat: 0.6 }), { cast: false }); f.rotation.x = -Math.PI / 2; f.position.set(0, 0.01, 0); scene.add(f);
    scene.add(box(80, 0.4, 32, mat('#f4f3ef', 0.8), 0, 8.2, 0));
    const lg = new THREE.InstancedMesh(new THREE.CircleGeometry(0.2, 12), new THREE.MeshBasicMaterial({ color: '#fffbee' }), 400); const o = new THREE.Object3D(); let k = 0;
    for (let x = -38; x < 38; x += 3) for (let z = -14; z < 15; z += 3) { o.position.set(x, 7.99, z); o.rotation.set(Math.PI / 2, 0, 0); o.updateMatrix(); if (k < 400) lg.setMatrixAt(k++, o.matrix); } lg.count = k; scene.add(lg);
    scene.add(box(80, 8, 0.4, mat('#ece8e0', 0.7), 0, 4, -16)); for (const s of [-1, 1]) scene.add(box(0.4, 8, 32, mat('#ece8e0', 0.7), s * 40, 4, 0));
    // glass wall (z=+16) — bahar apron par aircraft
    const glass = new THREE.MeshPhysicalMaterial({ color: '#cfe0ea', roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false });
    const gw = mesh(new THREE.PlaneGeometry(80, 8), glass, { cast: false }); gw.position.set(0, 4, 16); gw.rotation.y = Math.PI; scene.add(gw);
    for (let x = -40; x <= 40; x += 4) scene.add(box(0.18, 8, 0.25, mat('#b9bfc5', 0.35, 0.8), x, 4, 16));
    const ac = createAircraft(); ac.group.position.set(-6, 0, 52); ac.group.rotation.y = Math.PI; scene.add(ac.group);
    const ac2 = createAircraft(); ac2.group.position.set(40, 0, 70); ac2.group.rotation.y = Math.PI * 0.9; scene.add(ac2.group);
    // seating rows near glass + banners
    for (let x = -30; x < 30; x += 7) for (const z of [11, 13]) { const r = new THREE.Group(); r.position.set(x, 0, z); scene.add(r); for (let i = 0; i < 5; i++) { r.add(box(0.5, 0.06, 0.48, mat('#3d4650', 0.5, 0.5), i * 0.55 - 1.1, 0.45, 0)); r.add(box(0.5, 0.45, 0.05, mat('#3d4650', 0.5, 0.5), i * 0.55 - 1.1, 0.7, -0.24)); } }
    wallBanner(scene, 8, 3, 0, 22, 5, -15.7); wallBanner(scene, 8, 3, 2, -24, 5, -15.7);
    const fc = buildFoodCourt(scene, new THREE.Vector3(0, 0, -12));
    // stools around our table
    const seats = []; for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + Math.PI; const p = TBL.clone().add(V3(Math.sin(a) * 0.95, 0, Math.cos(a) * 0.95)); const st = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.46, 14), mat('#c0392b', 0.5)); st.position.set(p.x, 0.23, p.z); scene.add(st); seats.push({ p, face: a + Math.PI }); }
    const c = createCast(scene, { revo: false, driver: false });
    const bilal = createCharacter({ ...LOOKS.friend1, cameraBag: false }, 81), hamza = createCharacter({ ...LOOKS.friend2, cameraBag: false }, 82);
    const staff = createCharacter({ ...LOOKS.agent, vest: '#da291c', cameraBag: false }, 83); staff.root.position.set(-7, 0, -12.9); scene.add(staff.root);
    [bilal, hamza].forEach(x => scene.add(x.root));
    const npcs = []; const looks = [LOOKS.driver, LOOKS.ammi, { ...LOOKS.agent, vest: null, shirt: '#6b8aa8' }, LOOKS.friend1];
    for (let i = 0; i < 8; i++) { const n = createCharacter({ ...looks[i % 4], cameraBag: false }, 400 + i); n.root.position.set(-26 + i * 7, 0, i % 2 ? 11.2 : -1.5); n.root.rotation.y = i % 2 ? Math.PI : 0.3; scene.add(n.root); npcs.push(n); }
    const tray = foodTray(); scene.add(tray);
    const P1 = plan(c.umer, [-1.2, -4.2], -Math.PI / 2, [{ at: 0.3, to: [-6.6, -10.9] }, { at: 16.2, to: [-4.0, -7.75] }]);
    const P2 = plan(c.umer, [-4.0, -5.05], 0, [{ at: 52.6, to: [8, 2] }]);
    const Pf = [plan(bilal, [-4.8, -6.5], Math.PI / 2, [{ at: 52.8, to: [7.2, 1.0] }]), plan(hamza, [-3.2, -6.5], -Math.PI / 2, [{ at: 53.0, to: [8.8, 1.2] }])];
    return { L, fc, seats, bilal, hamza, staff, npcs, tray, P1, P2, Pf, ...c };
  },
  shots: [
    { id: 'N01', dur: 8.0, desc: 'Lounge wide: food court — McDonald\'s, Chai Khana, Karachi Biryani; glass ke bahar jahaz', cam(t, c, cam) { camLerp(cam, V3(14, 3.2, 8), V3(10, 2.8, 6), V3(-8, 2.6, -12), V3(-6, 2.0, -10), t / 8, 52); } },
    { id: 'N02', dur: 10.0, desc: 'McDonald\'s counter par order, tray haath mein', cam(t, c, cam) { camLerp(cam, V3(-4.6, 1.75, -7.0), V3(-4.9, 1.7, -7.4), V3(-7, 1.4, -10.5), V3(-7, 1.4, -10.4), t / 10, 44); } },
    { id: 'N03', dur: 21.0, desc: 'Doston (Bilal, Hamza) ke saath table par nashta, baatein', cam(t, c, cam) {
      if (t < 10) camLerp(cam, V3(-1.4, 1.6, -3.6), V3(-1.6, 1.55, -3.9), V3(-4, 1.0, -6), V3(-4, 1.0, -6), t / 10, 44);
      else camLerp(cam, V3(-6.4, 1.4, -4.2), V3(-6.2, 1.4, -4.4), V3(-4, 1.05, -6.1), V3(-4, 1.05, -6.1), (t - 10) / 11, 40); } },
    { id: 'N04', dur: 12.0, desc: 'Speaker par announcement — sab upar dekhte hain', cam(t, c, cam) { camLerp(cam, V3(-1.0, 2.6, -1.0), V3(-1.4, 2.4, -1.6), V3(-4, 1.2, -6), V3(-4, 1.4, -6.2), t / 12, 48); } },
    { id: 'N05', dur: 9.0, desc: 'Dost gate ki taraf chal padte hain', cam(t, c, cam) { const p = c.umer.root.position; cam.position.set(p.x + 2.5, 1.7, p.z + 4.2); cam.lookAt(p.x, 1.3, p.z); cam.fov = 50; } }
  ],
  update(t, c, cam, shot) {
    const { umer, bilal, hamza, staff, tray, vcam } = c; const scene = staff.root.parent;
    for (const n of c.npcs) { n.setNeutral(); poseIdle(n, t); faceUpdate(n, t, 0); }
    staff.setNeutral(); poseIdle(staff, t); faceUpdate(staff, t, speaking(SUBS, t, 'Staff'));
    const ann = t > 40.5 && t < 49.5;
    // Umer
    if (t < 52.6) {
      if (t < 20) { applyPlan(umer, c.P1, t); }
      else { umer.setNeutral(); const s = c.seats[0]; umer.root.position.set(s.p.x, 0.07, s.p.z); umer.root.rotation.y = s.face; poseSit(umer, 1); if (t < 40) poseEat(umer, t, 1); }
      if (t > 8.8 && t < 16.2) umer.root.rotation.y = Math.PI;
      if (t > 15.4 && t < 20) { poseCarryFront(umer, 1); attachToHand(tray, umer, 'R', V3(0.17, -0.12, 0.08), new THREE.Euler(0, 0, Math.PI / 2)); }
      else if (t >= 20) placeWorld(tray, scene, TBL.clone().add(V3(0, 0.78, 0.25)), 0);
      else { tray.visible = t > 13.6; placeWorld(tray, scene, V3(-7, 1.11, -11.9), 0); if (t > 13.6 && t < 15.4) poseReach(staff, 'R', 1.2, 1); }
    } else { applyPlan(umer, c.P2, t); tray.visible = false; }
    if (t < 15.4 || t >= 52.6) { poseCarryCam(umer, 1); holdCamera(umer, vcam, V3(-7, 1.4, -12)); }
    else if (t >= 20) { placeWorld(vcam, scene, TBL.clone().add(V3(0.35, 0.8, -0.3)), 0); vcam.rotation.set(0, 2.4, 0); }
    if (ann) umer.J.head.rotation.x = -0.35;
    faceUpdate(umer, t, speaking(SUBS, t, 'Umer') && !(t > 20 && t < 40 && Math.sin(t * 2.2) > 0.6) ? 1 : 0);
    // dost
    [[bilal, 1, 'Bilal'], [hamza, 2, 'Hamza']].forEach(([F, i, nm]) => {
      F.setNeutral();
      if (t < 52.8) { const s = c.seats[i]; F.root.position.set(s.p.x, 0.07, s.p.z); F.root.rotation.y = s.face; poseSit(F, 1); if (t > 30 && t < 40) poseEat(F, t + i, 0.7); if (t > 20.5 && t < 21.5 && nm === 'Bilal') poseWave(F, t, 'R', 1); }
      else applyPlan(F, c.Pf[i - 1], t);
      if (ann) F.J.head.rotation.x = -0.35;
      faceUpdate(F, t, speaking(SUBS, t, nm));
    });
  }
};
