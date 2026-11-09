// SEQUENCE G (v3) — Gate 5: gate agent phone par boarding pass scan karti hai → glass jet bridge → aircraft door par cabin crew
import * as THREE from 'three';
import { setupSkyAndLight, ground, buildGateAndBridge } from './lib/env.js';
import { createAircraft } from './lib/aircraft.js';
import { createCast } from './lib/cast.js';
import { createCharacter, LOOKS, poseSit, poseIdle, poseReach, poseSalaam, faceUpdate } from './lib/character.js';
import { createAproxPhone, drawPhoneInset } from './lib/aproxui.js';
import { plan, applyPlan, attachToHand, speaking, V3 } from './lib/anim.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
import { mat, mesh, box, smooth, range } from './lib/util.js';

const TICKET = { name: 'UMER', seat: '12A', gate: '5', time: '10:40' };
const MODE = [[0, 1], [10.6, 0], [14.2, 1]];
const SUBS = [
  [1.4, 3.8, 'Umer', 'Boarding shuru ho gayi — Gate 5 ki taraf chalte hain!', 'بورڈنگ شروع ہو گئی، گیٹ پانچ کی طرف چلتے ہیں!'],
  [4.4, 6.0, 'GateAgent', 'Boarding pass, please.', 'بورڈنگ پاس، پلیز۔'],
  [6.2, 7.6, 'Umer', 'Ji, yeh lijiye.', 'جی، یہ لیجیے۔'],
  [8.0, 9.8, 'GateAgent', 'Shukriya sir, tashreef le jayein.', 'شکریہ سر، تشریف لے جائیں۔'],
  [10.8, 14.0, 'Umer', 'Dosto, yeh jet bridge seedha jahaz ke darwaze tak jata hai!', 'دوستو، یہ جیٹ برج سیدھا جہاز کے دروازے تک جاتا ہے!'],
  [17.8, 20.6, 'Crew', 'Assalam o Alaikum, khush aamdeed! Aap ki seat 12A hai.', 'السلام علیکم، خوش آمدید! آپ کی سیٹ بارہ اے ہے۔'],
  [20.8, 22.4, 'Umer', 'Walaikum Assalam, shukriya!', 'وعلیکم السلام، شکریہ!']
];
export default {
  id: 'G', ambience: 'hall', title: 'Gate 5 aur Jet Bridge', subs: SUBS, sfx: [[7.4, 'beep']],
  build(scene, renderer) {
    const L = setupSkyAndLight(scene, renderer, { elev: 34, azim: 150, sunI: 3.2, hemiI: 1.1, fog: [0xdcd8cc, 150, 1500], shadowSize: 60 });
    ground(scene, 3000, '#b5ab92');
    const apron = mesh(new THREE.PlaneGeometry(400, 300), mat('#9c9c98', 0.95), { cast: false }); apron.rotation.x = -Math.PI / 2; apron.position.set(0, 0.005, 40); scene.add(apron);
    const ac = createAircraft(); scene.add(ac.group);
    const FL = ac.CY - 1.2;
    const gb = buildGateAndBridge(scene, FL);
    // gate desk + scanner
    const desk = new THREE.Group(); desk.position.set(16.3, FL, -43.4); scene.add(desk);
    desk.add(box(0.7, 1.05, 1.8, mat('#1f3f7a', 0.5), 0, 0.525, 0)); desk.add(box(0.8, 0.05, 1.9, mat('#e8e8e8', 0.3), 0, 1.07, 0));
    desk.add(box(0.12, 0.3, 0.12, mat('#222', 0.4), -0.25, 1.24, 0.5)); const scanLed = mesh(new THREE.BoxGeometry(0.02, 0.06, 0.08), new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ff3030', emissiveIntensity: 1 })); scanLed.position.set(-0.32, 1.32, 0.5); desk.add(scanLed);
    desk.add(box(0.05, 0.3, 0.42, mat('#0d1a26', 0.2), 0.32, 1.26, -0.45));
    const c = createCast(scene, { revo: false, driver: false });
    const agent = createCharacter({ ...LOOKS.gateAgent }, 150); agent.root.position.set(17.0, FL, -43.4); agent.root.rotation.y = -Math.PI / 2; scene.add(agent.root);
    const crew = createCharacter({ ...LOOKS.cabinCrewF }, 151); crew.root.position.set(14.85, FL, -2.4); crew.root.rotation.y = Math.PI; scene.add(crew.root);
    const npcs = []; const looks = [LOOKS.passengerM, LOOKS.passengerF, LOOKS.businessTraveller, LOOKS.youngPassenger, LOOKS.loungePassenger];
    for (let i = 0; i < 10; i++) { const n = createCharacter({ ...looks[i % 5], cameraBag: false }, 140 + i); const x = [-4, -2.9, 6, 7.1, 20, 21.1, 24, 25.1, 32, 33.1][i]; n.root.position.set(x - 0.3, FL, -44 - (i % 2) * 2.2); n.root.rotation.y = Math.PI; scene.add(n.root); npcs.push(n); }
    // bridge mein aage chalte musafir
    const walkers = [0, 1].map(i => { const n = createCharacter({ ...looks[(i + 2) % 5], cameraBag: false }, 160 + i); scene.add(n.root); return { n, P: plan(n, [14 + (i ? 0.2 : -0.2), -9.5 - i * 2.4], 0, [{ at: 9.8, to: [14 + (i ? 0.2 : -0.2), -1.6] }]) }; });
    const P1 = plan(c.umer, [10.6, -47.2], 0.6, [{ at: 0.2, to: [14.95, -43.4] }, { at: 3.9, face: Math.PI / 2, dur: 0.5 }]);
    const P2 = plan(c.umer, [14.0, -17.0], 0, [{ at: 10.0, to: [14.0, -3.6] }]);
    const phone = createAproxPhone({ mode: 'ticket', ticket: TICKET });
    return { L, ac, FL, gb, npcs, walkers, agent, crew, scanLed, P1, P2, phone, ...c };
  },
  shots: [
    { id: 'G01', dur: 4.0, desc: 'REAR: gate lounge, Gate 5 sign, glass ke bahar jahaz', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 78 }); } },
    { id: 'G02', dur: 6.0, desc: 'REAR on gate agent: phone par boarding pass scan', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 4, { fov: 72 }); } },
    { id: 'G03', dur: 7.0, desc: 'SELFIE → REAR: glass jet bridge, bahar apron', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 10, { fov: 78 }); } },
    { id: 'G04', dur: 6.0, desc: 'REAR: aircraft darwaza, cabin crew khush aamdeed', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 17, { fov: 74 }); } }
  ],
  overlay(g, W, H, t, c) { if (t > 6.0 && t < 9.4) drawPhoneInset(g, W, H, c.phone.canvas, Math.min(1, (t - 6.0) / 0.4, (9.4 - t) / 0.4), 'left'); },
  update(t, c) {
    const { umer, vcam, agent, crew, phone } = c;
    for (const n of c.npcs) { n.setNeutral(); poseSit(n, 1); n.root.position.y = c.FL; faceUpdate(n, t, 0); }
    for (const w of c.walkers) { if (t > 10) applyPlan(w.n, w.P, t, c.FL); w.n.root.visible = t > 10 && w.n.root.position.z < -2.0; }
    agent.setNeutral(); poseIdle(agent, t); faceUpdate(agent, t, speaking(SUBS, t, 'GateAgent'));
    crew.setNeutral(); poseIdle(crew, t); faceUpdate(crew, t, speaking(SUBS, t, 'Crew')); if (t > 17.6 && t < 19.2) poseSalaam(crew, 1);
    umer.setNeutral(); applyPlan(umer, t < 10 ? c.P1 : c.P2, t, c.FL);
    let ft = null;
    if (t > 3.6 && t < 10) { ft = new THREE.Vector3(); agent.J.head.getWorldPosition(ft); }
    if (t > 16) { ft = new THREE.Vector3(); crew.J.head.getWorldPosition(ft); }
    vlogPose(umer, vcam, modeAt(MODE, t), ft || V3(umer.root.position.x, c.FL + 1.4, umer.root.position.z + 10), t);
    // phone left haath mein scanner ki taraf (6.0–9.2)
    phone.group.visible = t > 6.0 && t < 9.2;
    if (phone.group.visible) { poseReach(umer, 'L', 1.15, 1); umer.J.upperArmL.rotation.z = 0.3; attachToHand(phone.group, umer, 'L', V3(-0.03, -0.12, 0.05)); phone.update(t, {}); umer.root.updateMatrixWorld(true); phone.group.lookAt(V3(16.3, c.FL + 1.3, -42.9)); }
    c.scanLed.material.emissive.set(t > 7.4 && t < 8.0 ? '#30ff50' : '#ff3030');
    if (t > 7.0 && t < 8.6) poseReach(agent, 'R', 0.6, 1);
    faceUpdate(umer, t, speaking(SUBS, t, 'Umer'));
    c.ac.gearDown(1); c.ac.spin(0);
    c.L.follow(new THREE.Vector3(8, 0, -20));
  }
};
