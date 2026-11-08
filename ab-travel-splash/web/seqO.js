// SEQUENCE O — Murree Road par Hotel 99: shaam ko pohanchna → entrance → lobby reception (Room 305 key card) →
// room → raat ko bed par aakhri vlog: "Kal subah InshaAllah Murree ki taraf"
import * as THREE from 'three';
import { setupSkyAndLight, ground, road, kerb, streetLight, building } from './lib/env.js';
import { createCorolla } from './lib/world2.js';
import { createCast, seatInCorolla } from './lib/cast.js';
import { createCharacter, LOOKS, poseIdle, poseReach, poseSit, posePullBag, poseSalaam, faceUpdate } from './lib/character.js';
import { plan, applyPlan, attachBagToHand, attachToHand, speaking, V3 } from './lib/anim.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
import { mat, mesh, box, canvasTex, smooth, range, clamp, rng } from './lib/util.js';

const LX = 200, RX = 400; // lobby / room ke origins
const SUBS = [
  [0.8, 4.8, 'Umer', 'Lo ji dosto — Murree Road par Hotel 99 aa gaya!', 'لو جی دوستو، مری روڈ پر ہوٹل نائنٹی نائن آ گیا!'],
  [8.2, 10.6, 'Staff', 'Assalam o Alaikum sir, khush aamdeed!', 'السلام علیکم سر، خوش آمدید!'],
  [10.8, 12.6, 'Umer', 'Walaikum Assalam!', 'وعلیکم السلام!'],
  [15.0, 18.6, 'Reception', 'Sir, aap ki booking confirm hai — Room 305, yeh raha key card.', 'سر، آپ کی بکنگ کنفرم ہے، روم تین سو پانچ، یہ رہا کی کارڈ۔'],
  [19.0, 21.0, 'Umer', 'Bohat shukriya!', 'بہت شکریہ!'],
  [24.6, 28.6, 'Umer', 'Dosto, lobby bohat khoobsurat hai — chalo room dekhte hain.', 'دوستو، لابی بہت خوبصورت ہے، چلو روم دیکھتے ہیں۔'],
  [31.0, 35.4, 'Umer', 'Yeh raha hamara room — saaf, aaramdeh, aur bara bed!', 'یہ رہا ہمارا روم، صاف، آرام دہ، اور بڑا بیڈ!'],
  [36.6, 40.4, 'Umer', 'Aur khirki se raat ki roshniyan — kya nazara hai.', 'اور کھڑکی سے رات کی روشنیاں، کیا نظارہ ہے۔'],
  [43.4, 48.6, 'Umer', 'Aaj ka safar bohat lamba tha — Karachi se Islamabad, Alhamdulillah.', 'آج کا سفر بہت لمبا تھا، کراچی سے اسلام آباد، الحمدللہ۔'],
  [49.0, 55.4, 'Umer', 'Aaj ka vlog yahin end karte hain... Kal subah InshaAllah hum log Murree ki taraf nikalenge.', 'آج کا وی لاگ یہیں اینڈ کرتے ہیں... کل صبح ان شاء اللہ ہم لوگ مری کی طرف نکلیں گے۔'],
  [55.8, 59.6, 'Umer', 'Video pasand aaye to like, share aur subscribe zaroor karein. Allah Hafiz!', 'ویڈیو پسند آئے تو لائک، شیئر اور سبسکرائب ضرور کریں۔ اللہ حافظ!']
];
const MODE = [[0, 1], [10.6, 0], [12.8, 1], [24.0, 0], [29.4, 1], [42.4, 0]];
function signTex(text, sub, bg = '#0b1f3a', fg = '#ffd34d') { return canvasTex(1024, 256, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = 'bold 150px DejaVu Sans'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, sub ? h * 0.42 : h / 2); if (sub) { g.font = '600 44px DejaVu Sans'; g.fillStyle = '#fff'; g.fillText(sub, w / 2, h * 0.84); } }); }
function nightCity() { return canvasTex(1024, 512, (g, w, h) => { const r = rng(9); const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#0a1230'); grd.addColorStop(1, '#1d2244'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { const bw = 30 + r() * 70, bh = 80 + r() * 300, x = r() * w; g.fillStyle = '#0c0f1c'; g.fillRect(x, h - bh, bw, bh); for (let k = 0; k < 40; k++) { if (r() < 0.5) { g.fillStyle = r() < 0.8 ? '#ffd88a' : '#9fd0ff'; g.fillRect(x + 4 + r() * (bw - 10), h - bh + 6 + r() * (bh - 12), 4, 5); } } }
  g.fillStyle = '#ffcf6a'; for (let i = 0; i < 120; i++) g.fillRect(r() * w, h - 10 - r() * 14, 3, 3); }); }

export default {
  id: 'O', title: 'Hotel 99 — Murree Road', subs: SUBS, ambience: 'street', exposure: 0.95, sfx: [[5.6, 'door'], [19.2, 'beep'], [30.2, 'door']],
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 7, azim: 300, sunI: 2.2, hemiI: 0.8, turbidity: 6, rayleigh: 3, fog: [0xc9a98a, 120, 900], shadowSize: 40, sunColor: '#ffb070' });
    ground(scene, 3000, '#9a927e');
    // ---- EXTERIOR (Murree Road) ----
    road(scene, { length: 300, width: 10, z: 0, laneLines: [0] }); kerb(scene, { length: 300, z: -5.2, h: 0.2 }); kerb(scene, { length: 300, z: 5.2, h: 0.2 });
    scene.add(box(300, 0.2, 8, mat('#cfc8b8', 0.9), 0, 0.1, -9.3, { cast: false }));
    const H = new THREE.Group(); H.userData.static = true; scene.add(H);
    const facT = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#e9dcc4'; g.fillRect(0, 0, w, h); for (let y = 20; y < h; y += 64) for (let x = 16; x < w; x += 64) { g.fillStyle = Math.random() < 0.6 ? '#ffcf7a' : '#31404f'; g.fillRect(x, y, 36, 40); } }, { repeat: [3, 3] });
    H.add(mesh(new THREE.BoxGeometry(32, 20, 16), new THREE.MeshStandardMaterial({ map: facT, roughness: 0.8, emissive: '#3a2a10', emissiveIntensity: 0.15 }))); H.children[0].position.set(0, 10, -22);
    H.add(box(9, 0.35, 5, mat('#2b2b2e', 0.5), 0, 3.6, -11.5)); for (const x of [-4, 4]) H.add(box(0.25, 3.6, 0.25, mat('#c9a24a', 0.3, 0.8), x, 1.8, -9.3));
    const gl = new THREE.MeshPhysicalMaterial({ color: '#ffe2a8', roughness: 0.1, emissive: '#7a5a20', emissiveIntensity: 0.6 }); H.add(box(5, 3, 0.1, gl, 0, 1.5, -13.95));
    const st = signTex('HOTEL 99', 'Murree Road'); const sg = mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: st }), { cast: false }); sg.position.set(0, 4.6, -9.0); H.add(sg);
    const sg2 = mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: st }), { cast: false }); sg2.position.set(0, 18, -13.9); H.add(sg2);
    for (const x of [-60, -30, 30, 60]) building(scene, x, -24, 22, 14, 10 + Math.abs(x) / 6, 800 + x);
    for (let x = -90; x <= 90; x += 30) building(scene, x, 24, 22, 14, 12 + (x % 4), 860 + x);
    for (let x = -80; x < 90; x += 25) streetLight(scene, x, -5.8, 1, 8);
    const car = createCorolla('#f4f4f2'); scene.add(car.group);
    // ---- LOBBY ----
    const Lb = new THREE.Group(); Lb.position.set(LX, 0, 0); scene.add(Lb);
    const floorT = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#e7dfd0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#cbbfa8'; g.lineWidth = 3; for (let i = 0; i <= w; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }, { repeat: [4, 3] });
    { const f = mesh(new THREE.PlaneGeometry(18, 14), new THREE.MeshPhysicalMaterial({ map: floorT, roughness: 0.2, clearcoat: 0.6 }), { cast: false }); f.rotation.x = -Math.PI / 2; f.position.y = 0.01; Lb.add(f); }
    const wallM = mat('#efe6d6', 0.8); Lb.add(box(18, 0.2, 14, mat('#f5f1ea', 0.8), 0, 4.2, 0)); Lb.add(box(18, 4.2, 0.2, wallM, 0, 2.1, -7)); Lb.add(box(18, 4.2, 0.2, wallM, 0, 2.1, 7)); for (const s of [-1, 1]) Lb.add(box(0.2, 4.2, 14, wallM, s * 9, 2.1, 0));
    Lb.add(box(18, 1.0, 0.1, mat('#6b4a2e', 0.6), 0, 3.6, -6.88));
    Lb.add(box(5.2, 1.1, 0.8, mat('#5a3a22', 0.5), 0, 0.55, -4.6)); Lb.add(box(5.4, 0.06, 0.95, mat('#e8e2d6', 0.2, 0.3), 0, 1.12, -4.6));
    { const s = mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: signTex('HOTEL 99', 'Reception', '#3a2414', '#e8c46a') }), { cast: false }); s.position.set(0, 2.6, -6.85); Lb.add(s); }
    for (const x of [-5.5, 5.5]) { Lb.add(box(2.4, 0.45, 0.9, mat('#7a1d2c', 0.9), x, 0.25, 3.5)); Lb.add(box(2.4, 0.6, 0.2, mat('#7a1d2c', 0.9), x, 0.75, 3.95)); }
    Lb.add(box(1.0, 2.4, 0.1, mat('#b9bfc5', 0.3, 0.8), 7.5, 1.2, -6.88)); Lb.add(box(1.0, 2.4, 0.1, mat('#b9bfc5', 0.3, 0.8), 6.3, 1.2, -6.88));
    for (const [x, z] of [[-7.8, -6], [7.8, 5.8]]) { const p = mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.6, 12), mat('#8a6a4a', 0.7)); p.position.set(x, 0.3, z); Lb.add(p); const lf = mesh(new THREE.SphereGeometry(0.6, 10, 8), mat('#3e6b2b', 0.9)); lf.position.set(x, 1.2, z); Lb.add(lf); }
    { const ch = mesh(new THREE.SphereGeometry(0.5, 16, 10), new THREE.MeshBasicMaterial({ color: '#fff0c8' })); ch.position.set(0, 3.6, 0); Lb.add(ch); }
    for (const [x, z] of [[0, 0], [-5, -3], [5, -3], [0, 4.5]]) { const l = new THREE.PointLight('#ffe2b0', 14, 14, 1.3); l.position.set(x, 3.6, z); Lb.add(l); }
    const recep = createCharacter({ ...LOOKS.hotelStaff }, 700); recep.root.position.set(LX + 0.3, 0, -5.4); scene.add(recep.root);
    const door = createCharacter({ ...LOOKS.hotelStaff, vest: '#14306f', tie: '#c9a24a', height: 1.76 }, 701); door.root.position.set(2.6, 0.2, -10.6); door.root.rotation.y = -0.4; scene.add(door.root);
    const guests = [LOOKS.businessTraveller, LOOKS.passengerF].map((lk, i) => { const n = createCharacter({ ...lk, cameraBag: false }, 710 + i); n.root.position.set(LX + (i ? 5.0 : -5.5), 0.08, 3.3); n.root.rotation.y = Math.PI; scene.add(n.root); return n; });
    const keycard = box(0.085, 0.054, 0.004, mat('#0b1f3a', 0.4), 0, 0, 0); keycard.add(box(0.06, 0.012, 0.005, mat('#ffd34d', 0.4), 0, 0.012, 0)); scene.add(keycard);
    // ---- ROOM 305 ----
    const Rm = new THREE.Group(); Rm.position.set(RX, 0, 0); scene.add(Rm);
    const carpet = mesh(new THREE.PlaneGeometry(5, 5), mat('#8a7a68', 1), { cast: false }); carpet.rotation.x = -Math.PI / 2; carpet.position.y = 0.01; Rm.add(carpet);
    const rw = mat('#efe4d0', 0.85); Rm.add(box(5, 0.15, 5, mat('#f6f2ea', 0.8), 0, 2.85, 0)); Rm.add(box(0.15, 2.8, 5, rw, 2.5, 1.4, 0)); Rm.add(box(0.15, 2.8, 5, rw, -2.5, 1.4, 0));
    for (const [w, x] of [[1.5, -1.75], [2.4, 1.3]]) Rm.add(box(w, 2.8, 0.15, rw, x, 1.4, 2.5));
    Rm.add(box(0.9, 0.7, 0.15, rw, -0.55, 2.45, 2.5));
    const rdoor = new THREE.Group(); rdoor.position.set(-1.0, 0, 2.5); Rm.add(rdoor); rdoor.add(box(0.9, 2.1, 0.05, mat('#6b4a2e', 0.5), 0.45, 1.05, 0));
    // window wall (z=-2.5) with night city
    for (const [w, x] of [[1.2, -1.9], [1.6, 1.7]]) Rm.add(box(w, 2.8, 0.15, rw, x, 1.4, -2.5)); Rm.add(box(2.2, 0.8, 0.15, rw, -0.2, 0.4, -2.5)); Rm.add(box(2.2, 0.6, 0.15, rw, -0.2, 2.5, -2.5));
    { const v = mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: nightCity() }), { cast: false }); v.position.set(-0.2, 1.4, -3.4); Rm.add(v); }
    for (const s of [-1, 1]) Rm.add(box(0.5, 2.3, 0.06, mat('#6a3a3a', 0.9), -0.2 + s * 1.25, 1.35, -2.4));
    // bed: headboard x=2.42, mattress x 0.4 … 2.4
    Rm.add(box(0.1, 1.3, 1.9, mat('#5a3a22', 0.6), 2.4, 0.65, 0.3)); Rm.add(box(2.0, 0.3, 1.8, mat('#4a3424', 0.7), 1.4, 0.2, 0.3)); Rm.add(box(2.0, 0.22, 1.76, mat('#f4f2ee', 0.9), 1.4, 0.46, 0.3));
    for (const z of [-0.15, 0.75]) { const p = mesh(new THREE.BoxGeometry(0.45, 0.14, 0.65), mat('#ffffff', 0.9)); p.position.set(2.15, 0.64, z); Rm.add(p); }
    const blanket = box(1.3, 0.12, 1.8, mat('#7a1d2c', 0.95), 0.95, 0.6, 0.3); Rm.add(blanket);
    for (const z of [-0.95, 1.55]) { Rm.add(box(0.45, 0.55, 0.45, mat('#5a3a22', 0.6), 2.1, 0.28, z)); const lamp = mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.24, 14), new THREE.MeshBasicMaterial({ color: '#ffe6b0' })); lamp.position.set(2.1, 0.8, z); Rm.add(lamp); }
    Rm.add(box(0.06, 0.7, 1.2, mat('#111', 0.3), -2.42, 1.4, 0.3)); Rm.add(box(0.5, 0.6, 1.4, mat('#5a3a22', 0.6), -2.2, 0.3, 0.3));
    const lampL = new THREE.PointLight('#ffd49a', 6, 6, 1.4); lampL.position.set(2.0, 1.1, 1.55); Rm.add(lampL);
    const ceilL = new THREE.PointLight('#fff1d8', 10, 9, 1.3); ceilL.position.set(0, 2.6, 0.3); Rm.add(ceilL);
    const c = createCast(scene, { revo: false, driver: false }); scene.add(c.bag.group);
    const P1 = plan(c.umer, [2.4, -6.2], Math.PI, [{ at: 6.4, to: [1.0, -8.6] }, { at: 10.4, face: Math.PI * 0.75, dur: 0.5 }, { at: 12.4, to: [0.2, -12.8] }]);
    const P2 = plan(c.umer, [LX + 0.0, 4.6], Math.PI, [{ at: 14.0, to: [LX + 0.0, -3.5] }, { at: 22.6, face: Math.PI / 2 + 0.3, dur: 0.6 }, { at: 23.4, to: [LX + 6.9, -5.6] }]);
    const P3 = plan(c.umer, [RX - 0.55, 3.4], Math.PI, [{ at: 30.0, to: [RX - 0.55, 1.4] }, { at: 31.2, to: [RX - 0.2, -0.4] }, { at: 35.8, face: Math.PI + 0.15, dur: 0.6 }, { at: 36.6, to: [RX - 0.2, -1.6] }]);
    return { L, car, recep, door, guests, keycard, rdoor, blanket, lampL, ceilL, P1, P2, P3, renderer, ...c };
  },
  shots: [
    { id: 'O01', dur: 6.0, desc: 'DASHBOARD aage: shaam, Murree Road par Hotel 99 ka board', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 76, shake: 0.4 }); } },
    { id: 'O02', dur: 8.0, desc: 'REAR: bag ke saath entrance ki taraf, doorman salaam karta hai', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 6, { fov: 78 }); } },
    { id: 'O03', dur: 10.0, desc: 'REAR on reception: booking, Room 305 key card', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 14, { fov: 76 }); } },
    { id: 'O04', dur: 6.0, desc: 'SELFIE: lobby se lift ki taraf', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 24, { fov: 78 }); } },
    { id: 'O05', dur: 12.0, desc: 'REAR: Room 305 ka darwaza, bed, khirki se raat ki roshniyan', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 30, { fov: 80 }); } },
    { id: 'O06', dur: 20.0, desc: 'SELFIE raat ko bed par: aakhri vlog — kal Murree', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 42, { fov: 78, shake: 0.5 }); } }
  ],
  overlay(g, W, H, t) {
    if (t < 59.8) return; const a = clamp((t - 59.8) / 0.6);
    g.save(); g.globalAlpha = a; g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(0, 0, W, H); g.textAlign = 'center';
    g.fillStyle = '#ffffff'; g.font = 'bold 84px DejaVu Sans'; g.fillText('Shukriya dekhne ka!', W / 2, H / 2 - 30);
    g.fillStyle = '#ffd34d'; g.font = '600 46px DejaVu Sans'; g.fillText('Ab Travel Splash · Episode 2: Islamabad → Murree — jald aa raha hai', W / 2, H / 2 + 50); g.restore();
  },
  update(t, c) {
    const { umer, bag, vcam, car, recep, door, keycard } = c; const scene = car.group.parent;
    // shaam → andar → raat
    c.L.hemi.intensity = t < 14 ? 1.2 : t < 42 ? 0.35 : 0.12; c.L.dl.intensity = t < 14 ? 2.2 : 0;
    c.renderer.toneMappingExposure = t < 42 ? 0.95 : 0.85;
    c.ceilL.intensity = t < 42 ? 10 : 1.5; c.lampL.intensity = t < 42 ? 6 : 16;
    recep.setNeutral(); poseIdle(recep, t); faceUpdate(recep, t, speaking(SUBS, t, 'Reception'));
    door.setNeutral(); poseIdle(door, t); faceUpdate(door, t, speaking(SUBS, t, 'Staff')); if (t > 8.2 && t < 9.6) poseSalaam(door, 1);
    for (const n of c.guests) { n.setNeutral(); poseSit(n, 1); faceUpdate(n, t, 0); }
    const cx = t < 5 ? -60 + 60 * (1 - Math.pow(1 - t / 5, 2)) : 0; car.group.position.set(cx, 0, -2.75); car.roll(cx);
    car.setDoor(t > 5.4 && t < 7 ? 1 : 0);
    keycard.visible = t > 17.6 && t < 24;
    c.rdoor.rotation.y = -1.4 * smooth(range(t, 30.0, 31.0)) * (1 - smooth(range(t, 33.5, 34.5)));
    umer.setNeutral();
    if (t < 6) { seatInCorolla(c, car, t, { talk: speaking(SUBS, t, 'Umer'), forward: true }); bag.group.visible = false; faceUpdate(umer, t, speaking(SUBS, t, 'Umer')); c.L.follow(new THREE.Vector3(0, 0, -6)); return; }
    if (umer.root.parent !== scene) scene.add(umer.root);
    bag.group.visible = t < 42;
    let ft = null;
    if (t < 14) { applyPlan(umer, c.P1, t, t < 12.6 ? 0.2 : 0); ft = new THREE.Vector3(); door.J.head.getWorldPosition(ft); if (t > 12) ft = V3(0, 1.6, -16); }
    else if (t < 30) { applyPlan(umer, c.P2, t); ft = new THREE.Vector3(); recep.J.head.getWorldPosition(ft); if (t > 22) ft = V3(LX + 7, 1.4, -7); }
    else if (t < 42) { applyPlan(umer, c.P3, t); ft = t < 35.8 ? V3(RX + 1.6, 0.8, 0.3) : V3(RX - 0.2, 1.3, -3.4); }
    if (t < 42) {
      vlogPose(umer, vcam, modeAt(MODE, t), ft, t, { free: t > 30 && t < 36 });
      posePullBag(umer, 1); bag.setExtend(1); attachBagToHand(umer, 'L', bag);
      if (t > 17.4 && t < 18.6) { poseReach(recep, 'R', 1.1, 1); }
      if (t > 17.6 && t < 18.4) attachToHand(keycard, recep, 'R', V3(0.02, -0.09, 0.05)); else if (t >= 18.4) { poseReach(umer, 'L', 0.9 * (1 - smooth(range(t, 19.4, 20))), 1); attachToHand(keycard, umer, 'L', V3(-0.02, -0.09, 0.05)); }
    } else {
      // raat: bed par headboard se tek laga kar baitha, kambal pairon par
      umer.root.position.set(RX + 1.95, 0.2, 0.3); umer.root.rotation.y = -Math.PI / 2; poseSit(umer, 1);
      umer.J.spine.rotation.x = -0.18; for (const s of ['L', 'R']) { umer.J['shin' + s] && (umer.J['shin' + s].rotation.x = 0); }
      vlogPose(umer, vcam, 0, null, t);
      if (t > 58.4) poseReach(umer, 'L', 0.0, 1);
    }
    faceUpdate(umer, t, speaking(SUBS, t, 'Umer'));
    c.L.follow(t < 14 ? new THREE.Vector3(0, 0, -6) : t < 30 ? new THREE.Vector3(LX, 0, 0) : new THREE.Vector3(RX, 0, 0));
  }
};
