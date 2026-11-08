// SEQUENCE H (v3) — Ghar, FIRST-PERSON VLOG: camera table se uthana → selfie salaam → rear mode kamra →
// fan switch → almari → packing (Ammi trolley laati hain) → Rashid Bhai ko phone → kitchen: Ammi paratha,
// Aprox AI ki baat, chabana → horn
import * as THREE from 'three';
import { buildHomeInterior } from './lib/world2.js';
import { createCast } from './lib/cast.js';
import { createCharacter, LOOKS, poseCarryCam, posePullBag, poseSit, posePhone, poseCarryFront, poseReach, poseWave, poseWork, faceUpdate, setGrip, poseIdle, showCamBag, chew } from './lib/character.js';
import { createPhone, createOpenSuitcase, createClothStack, createSuitcase } from './lib/props.js';
import { plan, applyPlan, holdCamera, attachToHand, placeWorld, attachBagToHand, speaking, placeByHips, V3 } from './lib/anim.js';
import { modeAt, vlogPose, lensCam, restCam } from './lib/vlog.js';
import { mat, mesh, smooth, range, lerp } from './lib/util.js';

const SUBS = [
  [1.2, 4.4, 'Umer', 'Uff... subah ke chhe baj gaye!', 'اف... صبح کے چھ بج گئے!'],
  [14.6, 20.6, 'Umer', 'Assalam-o-alaikum guys, kaise hain aap sab? Aaj hum Karachi se Islamabad ja rahe hain!', 'السلام علیکم گائز، کیسے ہیں آپ سب؟ آج ہم کراچی سے اسلام آباد جا رہے ہیں!'],
  [21.6, 25.0, 'Umer', 'Ye dekhiye mera kamra... aur garmi bohat hai.', 'یہ دیکھیے میرا کمرہ... اور گرمی بہت ہے۔'],
  [25.4, 28.0, 'Umer', 'Pehle pankha on karte hain.', 'پہلے پنکھا آن کرتے ہیں۔'],
  [31.0, 35.0, 'Umer', 'Ab packing — chaliye almari kholte hain.', 'اب پیکنگ، چلیے الماری کھولتے ہیں۔'],
  [36.4, 41.4, 'Umer', 'Ye rahe kapre — shirts, pants, aur mera travel pouch.', 'یہ رہے کپڑے، شرٹس، پینٹس، اور میرا ٹریول پاؤچ۔'],
  [47.0, 50.4, 'Umer', 'Ammi! Mera Travel Splash wala bag de dein, please!', 'امی! میرا ٹریول اسپلیش والا بیگ دے دیں، پلیز!'],
  [51.4, 54.4, 'Ammi', 'Ye lo beta, tumhara bag.', 'یہ لو بیٹا، تمہارا بیگ۔'],
  [55.0, 57.4, 'Umer', 'Shukriya Ammi!', 'شکریہ امی!'],
  [70.4, 75.0, 'Umer', 'Hello Rashid Bhai, Assalam-o-alaikum! Revo le kar aa jayein — aath baje nikalna hai.', 'ہیلو راشد بھائی، السلام علیکم! ریوو لے کر آ جائیں، آٹھ بجے نکلنا ہے۔'],
  [75.6, 79.4, 'Driver', 'Walaikum Assalam Umer bhai! Bas aadhe ghante mein pohanch raha hoon.', 'وعلیکم السلام عمر بھائی! بس آدھے گھنٹے میں پہنچ رہا ہوں۔'],
  [88.0, 91.4, 'Umer', 'Kitchen se khushboo aa rahi hai — Ammi paratha bana rahi hain!', 'کچن سے خوشبو آ رہی ہے، امی پراٹھا بنا رہی ہیں!'],
  [93.0, 95.6, 'Umer', 'Ammi, aaj Islamabad ja rahe hain.', 'امی، آج اسلام آباد جا رہے ہیں۔'],
  [96.0, 98.4, 'Ammi', 'Achha? Tayari ho gayi?', 'اچھا؟ تیاری ہو گئی؟'],
  [98.8, 101.4, 'Umer', 'Ji, bas ab nikalna hai.', 'جی، بس اب نکلنا ہے۔'],
  [102.0, 105.0, 'Ammi', 'Lo, garam garam paratha khao.', 'لو، گرم گرم پراٹھا کھاؤ۔'],
  [111.4, 115.0, 'Ammi', 'Waise tumhari ye nayi Aprox AI kya cheez hai?', 'ویسے تمہاری یہ نئی ایپروکس اے آئی کیا چیز ہے؟'],
  [115.6, 122.6, 'Umer', 'Ammi, Aprox AI launch ho gayi hai. Aap is se sawal kar sakti hain, research kar sakti hain — Urdu mein bhi.', 'امی، ایپروکس اے آئی لانچ ہو گئی ہے۔ آپ اس سے سوال کر سکتی ہیں، ریسرچ کر سکتی ہیں، اردو میں بھی۔'],
  [123.0, 126.4, 'Ammi', 'Achha! Phir to main is se recipe poochungi.', 'اچھا! پھر تو میں اس سے ریسیپی پوچھوں گی۔'],
  [126.8, 130.0, 'Umer', 'Bilkul Ammi, aap ke phone mein install kar dunga.', 'بالکل امی، آپ کے فون میں انسٹال کر دوں گا۔'],
  [132.4, 134.6, 'Umer', 'Lagta hai Rashid Bhai aa gaye!', 'لگتا ہے راشد بھائی آ گئے!'],
  [135.0, 138.4, 'Ammi', 'Safar mein khayal rakhna — Fi Amanillah, beta.', 'سفر میں خیال رکھنا، فی امان اللہ بیٹا۔']
];
// vlog mode keyframes (0 selfie, 1 rear)
const MODE = [[0, 0], [21.0, 1], [29.0, 0], [31.4, 1], [42.0, 0], [86.0, 1], [92.4, 0], [103.6, 1], [106.0, 0], [131.0, 1], [134.6, 0]];

export default {
  id: 'H', title: 'Karachi (DHA) — Subah ka aaghaz', exposure: 0.88, subs: SUBS, ambience: 'room',
  sfx: [[0.2, 'alarm'], [27.6, 'switch'], [34.0, 'door'], [131.6, 'horn']],
  build(scene) {
    const home = buildHomeInterior(scene);
    const c = createCast(scene, { revo: false, driver: false });
    const ammi = createCharacter(LOOKS.ammi, 5); scene.add(ammi.root);
    const phone = createPhone();
    const open = createOpenSuitcase('#111'); open.group.position.set(1.6, 0.61, 2.35); scene.add(open.group);
    const ts = createSuitcase('#111', 'travelsplash'); scene.add(ts.group);
    const stacks = ['#3a6ea5', '#2b3140', '#e8e4da'].map(cl => { const s = createClothStack(cl, 3); scene.add(s); return s; });
    const bite = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 12, 1, false, 0, Math.PI), mat('#d9a556', 0.8)); scene.add(bite);
    const plate = mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.02, 20), mat('#fafafa', 0.3)); plate.position.set(-5.5, 0.94, 3.1); scene.add(plate);
    const P = {
      toSwitch: plan(c.umer, [2.4, 2.9], Math.PI / 2, [{ at: 24.2, to: [0.55, 1.45] }, { at: 26.4, face: -Math.PI / 2, dur: 0.5 }]),
      toWar: plan(c.umer, [0.55, 1.45], -Math.PI / 2, [{ at: 30.0, to: [5.2, 2.85] }, { at: 34.0, face: 0, dur: 0.5 }]),
      packTrips: plan(c.umer, [5.2, 2.85], 0, [{ at: 41.0, to: [2.8, 2.4] }, { at: 43.6, face: -Math.PI / 2, dur: 0.4 }, { at: 58.0, to: [5.2, 3.75] }, { at: 60.4, face: 0, dur: 0.4 }, { at: 62.0, to: [2.8, 2.4] }, { at: 64.4, face: -Math.PI / 2, dur: 0.4 }]),
      toKitchen: plan(c.umer, [2.8, 2.4], -Math.PI / 2, [{ at: 84.0, to: [0.6, 2.3] }, { at: 86.0, to: [-3.4, 3.7] }, { at: 90.0, to: [-4.15, 3.25] }, { at: 91.2, face: -1.9, dur: 0.6 }]),
      ammiIn: plan(ammi, [-2.2, 2.3], Math.PI / 2, [{ at: 49.0, to: [0.8, 2.3] }, { at: 52.0, to: [2.0, 3.4] }, { at: 53.4, face: Math.PI * 0.9, dur: 0.6 }])
    };
    return { home, ammi, phone, open, ts, stacks, bite, plate, P, ...c };
  },
  shots: [
    { id: 'H01', dur: 8.0, desc: 'Rest cam (vlog camera side table par): alarm, Umer jaagta hai', cam(t, c, cam) { restCam(cam, V3(3.4, 1.05, 4.5), V3(1.6, 0.8, 2.2), 58); } },
    { id: 'H02', dur: 6.0, desc: 'Umer table se camera uthata hai', cam(t, c, cam) { if (t < 3.5) restCam(cam, V3(3.4, 1.05, 4.5), V3(1.5, 0.9, 2.2), 58); else lensCam(c.vcam, cam, t, { fov: 74, shake: 0.6 }); } },
    { id: 'H03', dur: 16.0, desc: 'SELFIE salaam → REAR kamra → fan switch → SELFIE', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 14); } },
    { id: 'H04', dur: 16.0, desc: 'REAR: almari khulti hai — kapre, joote, pouch; SELFIE', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 30); } },
    { id: 'H05', dur: 24.0, desc: 'Rest cam (camera bistar par): Ammi trolley laati hain, packing', cam(t, c, cam) { restCam(cam, V3(0.95, 0.78, 3.3), V3(2.3, 0.9, 2.5), 72); } },
    { id: 'H06', dur: 14.0, desc: 'Rest cam: Rashid Bhai ko phone', cam(t, c, cam) { restCam(cam, V3(0.95, 0.78, 3.3), V3(3.3, 1.35, 2.3), 66); } },
    { id: 'H07', dur: 56.0, desc: 'Kitchen vlog: REAR Ammi paratha, SELFIE baat-cheet + chabana, Aprox AI, horn', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 82, { fov: 76 }); } }
  ],
  update(t, c, cam, shot) {
    const { umer, ammi, vcam, home, phone, open, ts, stacks, bite, plate, P } = c;
    const scene = home.bed.parent;
    const talkU = speaking(SUBS, t, 'Umer'), talkA = speaking(SUBS, t, 'Ammi');
    umer.setNeutral(); ammi.setNeutral(); showCamBag(umer, false); phone.visible = false; if (umer.J.backpack) umer.J.backpack.visible = false;
    // pankha: switch ON 27.6 ke baad tez hota hai
    const fanOn = smooth(range(t, 27.6, 31)); home.fan.rotation.y = (t > 27.6 ? (t - 27.6) * 7 * fanOn : 0);
    home.fanSwitch.rotation.x = t > 27.6 ? -0.35 : 0.25;
    home.flame.visible = t > 80;
    for (const d of home.doors) d.piv.rotation.y = -d.s * 1.55 * smooth(range(t, 33.6, 34.8)) * (1 - smooth(range(t, 67, 68)));
    // suitcase / packing state
    open.group.visible = t >= 54.4 && t < 68.5; open.setLid(t < 66 ? 1 : 1 - smooth(range(t, 66, 67.4)));
    ts.group.visible = (t >= 48.6 && t < 54.4) || t >= 68.5; ts.setExtend(t < 54.4 ? 1 : 0);
    const trips = [[39.6, 44.6], [60.6, 65.0], [60.6, 65.0]];
    stacks.forEach((s, i) => {
      const [tp, td] = trips[i]; s.visible = t >= 30 && t < 67.4;
      if (t < tp) placeWorld(s, scene, V3(5.2 + (i - 1) * 0.33, 1.3, 4.6), 0);
      else if (t < td) attachToHand(s, umer, 'L', V3(-0.12, -0.1, 0.06), new THREE.Euler(0, 0, -Math.PI / 2));
      else { open.group.updateMatrixWorld(true); placeWorld(s, scene, open.slots[i].clone().applyMatrix4(open.group.matrixWorld), 0); }
    });
    // ---------- UMER ----------
    let fwdTarget = V3(5, 1.2, 3);
    if (t < 14) {
      if (t < 12) { const u = smooth(range(t, 7.0, 10.0)); umer.root.rotation.y = 0; umer.J.thighL.rotation.x = umer.J.thighR.rotation.x = -Math.PI / 2 * u; placeByHips(umer, V3(1.6, 0.74, 2.35), -Math.PI / 2 * (1 - u)); home.blanket.position.set(0, 0.86 - 0.12 * u, 1.5); if (u > 0.6) { poseReach(umer, 'R', 0.9 * smooth(range(t, 9.8, 10.6)), 1); umer.J.upperArmR.rotation.z = -0.5; } }
      else { umer.root.position.set(1.2, 0.0, 2.2); umer.root.rotation.y = -0.6; poseSit(umer, 0); }
      if (t < 10.6) { placeWorld(vcam, scene, V3(0.45, 0.62, 0.38), 0); vcam.rotation.set(0, 0.6, 0); }
      else { poseCarryCam(umer, 1); holdCamera(umer, vcam, V3(5, 1.2, 4)); }
      if (t < 6) umer.eyes.forEach(e => e.lid.rotation.x = 1.05);
    } else if (t < 30) {
      home.blanket.position.set(0, 0.71, 1.4);
      if (t < 24.2) { umer.root.position.set(2.4, 0, 2.9); umer.root.rotation.y = Math.PI / 2 + 0.7; poseIdle(umer, t); } else applyPlan(umer, P.toSwitch, t);
      fwdTarget = t < 24.2 ? V3(-1, 1.4, 4.5) : V3(0, 1.3, 1.35);
      vlogPose(umer, vcam, modeAt(MODE, t), fwdTarget, t);
      if (t > 26.8 && t < 28.2) { poseReach(umer, 'L', 1.25 * Math.sin(range(t, 26.8, 28.2) * Math.PI), 1); }
    } else if (t < 46) {
      if (t < 41) applyPlan(umer, P.toWar, t); else applyPlan(umer, P.packTrips, t);
      fwdTarget = t < 41 ? V3(5.2, 1.2, 4.6) : V3(1.6, 0.7, 2.4);
      vlogPose(umer, vcam, modeAt(MODE, t), fwdTarget, t);
      if (t > 33.4 && t < 34.6) poseReach(umer, 'L', 1.2, 1);
      if (t > 39.0 && t < 40.0) poseReach(umer, 'L', 1.1, 1);
    } else if (t < 84) {
      if (t < 68.5) applyPlan(umer, P.packTrips, t); else { umer.root.position.set(3.3, 0, 2.3); umer.root.rotation.y = -Math.PI / 2 - 0.4; poseIdle(umer, t); }
      placeWorld(vcam, scene, V3(0.95, 0.72, 3.3), 0); vcam.rotation.set(0, 0.9, 0);
      const carrying = t > 60.6 && t < 64.6; if (carrying) poseCarryFront(umer, 1);
      if ((t > 44.0 && t < 45.0) || (t > 64.4 && t < 65.4) || (t > 65.8 && t < 67.8)) { poseReach(umer, 'L', 1.0, 1); poseReach(umer, 'R', 1.0, 1); umer.J.spine.rotation.x = 0.3; }
      if (t > 47 && t < 50.4) { poseReach(umer, 'L', 1.4, 1); umer.J.forearmL.rotation.x = -2.0; }
      if (t > 69.4 && t < 80.4) { posePhone(umer, smooth(range(t, 69.4, 70.2)) * (1 - smooth(range(t, 79.6, 80.4))), 'L'); phone.visible = true; attachToHand(phone, umer, 'L', V3(-0.03, -0.1, 0.03), new THREE.Euler(0, Math.PI / 2, 0)); } else phone.visible = false;
      if (t > 68.4 && t < 68.5) {} // bag neeche
      if (t >= 68.5) placeWorld(ts.group, scene, V3(2.4, 0, 1.95), Math.PI / 2);
      if (t > 80.6) { const u = smooth(range(t, 80.6, 82.4)); poseReach(umer, 'R', 1.0 * Math.sin(u * Math.PI), 1); if (t > 81.5) { poseCarryCam(umer, 1); holdCamera(umer, vcam, V3(0, 1.3, 2.3)); } }
    } else { // KITCHEN
      applyPlan(umer, P.toKitchen, t);
      if (t > 92) { const m0 = modeAt(MODE, t); umer.root.rotation.y = 1.3 + (-1.9 - 1.3) * m0; } // selfie mein Ammi peeche frame mein
      fwdTarget = t < 92 ? V3(-5.4, 1.1, 3.6) : V3(-5.6, 0.95, 3.7);
      vlogPose(umer, vcam, modeAt(MODE, t), fwdTarget, t);
      // paratha ka niwala: 104.4 par Ammi plate deti, Umer left haath se torta → khata
      bite.visible = t > 105.4 && t < 111;
      if (t > 104.6 && t < 106.0) poseReach(umer, 'L', 1.1, 1);
      if (bite.visible) { poseReach(umer, 'L', 0.55, 1); umer.J.forearmL.rotation.x = -2.1 + 0.25 * Math.sin(t * 3); attachToHand(bite, umer, 'L', V3(-0.02, -0.1, 0.06), new THREE.Euler(Math.PI / 2, 0, 0)); }
      if (t > 106 && t < 111.2 && !talkU) chew(umer, t, 1);
      ts.group.visible = false;
    }
    // ---------- AMMI ----------
    ammi.root.visible = t >= 48.5;
    if (t >= 48.5 && t < 84) {
      if (t < 54.4) { applyPlan(ammi, P.ammiIn, t); posePullBag(ammi, 1); attachBagToHand(ammi, 'L', ts); }
      else { ammi.root.position.set(0.9, 0, 3.9); ammi.root.rotation.y = Math.PI / 2 + 0.5; poseIdle(ammi, t); }
      if (t > 53.4 && t < 54.4) { poseReach(ammi, 'L', 1.0, 1); poseReach(ammi, 'R', 1.0, 1); }
    } else if (t >= 84) { // chulhe par: paratha seekna (bele se palatna), phir plate
      ammi.root.position.set(-5.05, 0, 3.55); ammi.root.rotation.y = t < 101.6 ? -Math.PI / 2 : -Math.PI / 2 + 1.6;
      poseIdle(ammi, t);
      if (t < 101.6) poseWork(ammi, t, 0.5); else if (t < 104.8) { poseReach(ammi, 'R', 1.0, 1); poseReach(ammi, 'L', 1.0, 1); }
      home.paratha.position.y = 1.016 + (t > 95 && t < 95.5 ? 0.06 * Math.sin(range(t, 95, 95.5) * Math.PI) : 0); home.paratha.rotation.x = t > 95.25 ? Math.PI : 0;
      if (t > 101.6) { home.paratha.visible = false; placeWorld(plate, scene, t < 104.6 ? V3(-5.35, 1.0, 3.35) : V3(-4.95, 0.95, 3.0), 0); } else home.paratha.visible = true;
      if (t > 135) poseWave(ammi, t, 'R', smooth(range(t, 135, 135.5)));
    }
    faceUpdate(ammi, t, talkA);
    if (!(t > 106 && t < 111.2 && !talkU)) faceUpdate(umer, t, talkU); else faceUpdate(umer, t, 0), chew(umer, t, 1);
  }
};
