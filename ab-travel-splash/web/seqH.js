// SEQUENCE H — Ghar (subah): alarm → uthna → vlog intro → daant brush → Ammi ko awaaz → bag →
// almari se kapre → packing → driver ko phone → nashta → horn
import * as THREE from 'three';
import { buildHomeInterior } from './lib/world2.js';
import { createCast, selfieCam } from './lib/cast.js';
import { createCharacter, LOOKS, poseCarryCam, poseSelfie, posePullBag, poseSit, poseBrush, posePhone, poseEat, poseCarryFront, poseReach, poseWave, faceUpdate, setGrip, poseIdle, showCamBag } from './lib/character.js';
import { createToothbrush, createPhone, createTeapot, createOpenSuitcase, createClothStack } from './lib/props.js';
import { plan, applyPlan, holdCamera, attachToHand, placeWorld, attachBagToHand, camLerp, handheld, speaking, placeByHips, V3 } from './lib/anim.js';
import { mat, mesh, smooth, range, lerp, clamp } from './lib/util.js';

const SUBS = [
  [1.0, 4.6, 'Umer', 'Uff... subah ke chhe baj gaye!', 'اف... صبح کے چھ بج گئے!'],
  [12.6, 15.6, 'Umer', 'Chalo Umer, uth jao — aaj safar ka din hai!', 'چلو عمر، اٹھ جاؤ، آج سفر کا دن ہے!'],
  [20.5, 24.6, 'Umer', 'Assalam o Alaikum dosto! Main hoon Umer, aur yeh hai Ab Travel Splash.', 'السلام علیکم دوستو! میں ہوں عمر، اور یہ ہے اب ٹریول اسپلیش۔'],
  [24.8, 28.4, 'Umer', 'Aaj hum Karachi se Islamabad ja rahe hain — bohat khaas din hai!', 'آج ہم کراچی سے اسلام آباد جا رہے ہیں، بہت خاص دن ہے!'],
  [28.6, 31.6, 'Umer', 'Lekin pehle... daant saaf karte hain!', 'لیکن پہلے... دانت صاف کرتے ہیں!'],
  [52.6, 55.6, 'Umer', 'Daant saaf, din saaf! Ab packing ka time.', 'دانت صاف، دن صاف! اب پیکنگ کا ٹائم۔'],
  [58.6, 62.6, 'Umer', 'Ammi! Ammi! Mera bag nikaal dein, please!', 'امی! امی! میرا بیگ نکال دیں، پلیز!'],
  [64.4, 67.4, 'Ammi', 'Aa rahi hoon beta! Yeh lo tumhara bag.', 'آ رہی ہوں بیٹا! یہ لو تمہارا بیگ۔'],
  [70.0, 73.6, 'Umer', 'Shukriya Ammi! Aur meri blue shirt kahan hai?', 'شکریہ امی! اور میری بلیو شرٹ کہاں ہے؟'],
  [74.0, 78.0, 'Ammi', 'Almari mein hai beta — sab istri karke rakha hai.', 'الماری میں ہے بیٹا، سب استری کر کے رکھا ہے۔'],
  [90.0, 93.6, 'Ammi', 'Charger aur dawai bhi rakh lena!', 'چارجر اور دوائی بھی رکھ لینا!'],
  [96.0, 99.0, 'Umer', 'Ji Ammi, sab rakh liya!', 'جی امی، سب رکھ لیا!'],
  [106.0, 109.6, 'Umer', 'Packing mukammal! Ab chacha ko phone karta hoon.', 'پیکنگ مکمل! اب چچا کو فون کرتا ہوں۔'],
  [113.0, 118.4, 'Umer', 'Hello chacha, Assalam o Alaikum! Revo le kar aa jayein — aath baje nikalna hai.', 'ہیلو چچا، السلام علیکم! ریوو لے کر آ جائیں، آٹھ بجے نکلنا ہے۔'],
  [118.8, 123.0, 'Driver', 'Walaikum Assalam Umer bhai! Bas aadhe ghante mein pohanch raha hoon.', 'وعلیکم السلام عمر بھائی! بس آدھے گھنٹے میں پہنچ رہا ہوں۔'],
  [123.4, 125.4, 'Umer', 'Theek hai, shukriya!', 'ٹھیک ہے، شکریہ!'],
  [131.0, 134.6, 'Ammi', 'Araam se khao beta, garam garam paratha hai.', 'آرام سے کھاؤ بیٹا، گرم گرم پراٹھا ہے۔'],
  [136.0, 140.4, 'Umer', 'Ammi, aap ke haath ka paratha — iska koi jawab nahi!', 'امی، آپ کے ہاتھ کا پراٹھا، اس کا کوئی جواب نہیں!'],
  [142.0, 147.0, 'Ammi', 'Safar mein apna khayal rakhna, aur pohanch kar phone karna.', 'سفر میں اپنا خیال رکھنا، اور پہنچ کر فون کرنا۔'],
  [147.6, 150.0, 'Umer', 'Ji Ammi, InshaAllah.', 'جی امی، ان شاء اللہ۔'],
  [158.4, 161.4, 'Umer', 'Lagta hai chacha aa gaye!', 'لگتا ہے چچا آ گئے!'],
  [162.0, 166.4, 'Ammi', 'Fi Amanillah beta — Allah ki amaan mein.', 'فی امان اللہ بیٹا، اللہ کی امان میں۔']
];

export default {
  id: 'H', title: 'Karachi — Subah ka aaghaz', exposure: 0.85,
  subs: SUBS,
  sfx: [[0.2, 'alarm'], [157.0, 'horn']],
  ambience: 'room',
  build(scene) {
    const home = buildHomeInterior(scene);
    const c = createCast(scene, { revo: false, driver: false });
    scene.add(c.bag.group); c.bag.group.visible = false;
    const ammi = createCharacter(LOOKS.ammi, 5); scene.add(ammi.root);
    const brush = createToothbrush(); const phone = createPhone(); const pot = createTeapot();
    const open = createOpenSuitcase('#2e4a6b'); open.group.position.set(1.6, 0.67, 2.35); open.group.visible = false; scene.add(open.group);
    const stackCols = ['#3a6ea5', '#2b3140', '#e8e4da'];
    const stacks = stackCols.map(cl => { const s = createClothStack(cl, 3); scene.add(s); return s; });
    const foam = mesh(new THREE.SphereGeometry(0.012, 8, 6), mat('#ffffff', 0.9)); foam.scale.set(2.2, 0.8, 1);
    // plans
    const P = {
      walkBath: plan(c.umer, [3.6, 2.9], Math.PI / 2, [{ at: 32.2, to: [6.6, 3.7] }, { at: 35.0, to: [6.9, 2.1] }, { at: 36.5, to: [7.55, 1.05] }, { at: 37.4, face: Math.PI, dur: 0.6 }]),
      back: plan(c.umer, [7.55, 1.05], Math.PI, [{ at: 55.8, to: [6.9, 2.3] }, { at: 57.0, to: [6.5, 3.7] }, { at: 58.4, to: [3.6, 3.6] }, { at: 61.2, face: -Math.PI / 2, dur: 0.6 }]),
      ammiIn: plan(ammi, [-2.2, 2.3], Math.PI / 2, [{ at: 63.0, to: [0.8, 2.3] }, { at: 66.0, to: [2.2, 3.7] }, { at: 68.0, face: Math.PI, dur: 0.6 }]),
      pack: plan(c.umer, [3.6, 3.6], -Math.PI / 2, [
        { at: 79.0, to: [5.2, 3.75] }, { at: 80.6, face: 0, dur: 0.4 },
        { at: 84.0, to: [2.8, 2.4] }, { at: 86.4, face: -Math.PI / 2, dur: 0.4 },
        { at: 88.6, to: [5.2, 3.75] }, { at: 91.0, face: 0, dur: 0.4 },
        { at: 92.6, to: [2.8, 2.4] }, { at: 95.0, face: -Math.PI / 2, dur: 0.4 },
        { at: 97.2, to: [5.2, 3.75] }, { at: 99.6, face: 0, dur: 0.4 },
        { at: 100.6, to: [2.8, 2.4] }, { at: 103.0, face: -Math.PI / 2, dur: 0.4 }]),
      phone: plan(c.umer, [2.8, 2.6], 0, [{ at: 111.0, to: [3.9, 3.9] }, { at: 114.0, to: [4.5, 2.2] }, { at: 117.0, to: [3.6, 1.6] }, { at: 119.5, face: 0.6, dur: 0.8 }])
    };
    return { home, ammi, brush, phone, pot, open, stacks, foam, P, ...c };
  },
  shots: [
    { id: 'H01', dur: 6.0, desc: 'Close-up: alarm 6:00 baj raha hai, Umer bistar mein',
      cam(t, c, cam) { camLerp(cam, V3(0.25, 1.15, 2.4), V3(0.35, 1.35, 2.9), V3(0.45, 0.62, 0.35), V3(1.6, 0.9, 1.7), t / 6, 44); } },
    { id: 'H02', dur: 6.0, desc: 'Wide: Umer bistar par uth kar baithta hai',
      cam(t, c, cam) { camLerp(cam, V3(4.6, 1.7, 4.4), V3(4.3, 1.6, 4.2), V3(1.6, 0.8, 2.4), V3(1.6, 1.0, 2.4), t / 6, 46); } },
    { id: 'H03', dur: 8.0, desc: 'Bistar ke kinare baith kar angraai, phir khara hota hai',
      cam(t, c, cam) { camLerp(cam, V3(4.4, 1.3, 1.4), V3(4.2, 1.4, 1.7), V3(2.7, 1.0, 2.6), V3(3.2, 1.3, 2.8), t / 8, 46); } },
    { id: 'H04', dur: 12.0, desc: 'Bedroom selfie vlog intro', selfie: true,
      cam(t, c, cam) { selfieCam(c, cam, t, { fov: 72, shake: 0.8 }); } },
    { id: 'H05', dur: 8.0, desc: 'Bathroom ki taraf walk (tracking)',
      cam(t, c, cam) { const p = c.umer.root.position; const h = handheld(t, 0.6); cam.position.set(p.x - 1.6, 1.65, p.z + 1.3).add(h); cam.lookAt(p.x + 0.3, 1.25, p.z - 0.3); cam.fov = 52; } },
    { id: 'H06', dur: 18.0, desc: 'Sink par daant brush — Roman Urdu baatein',
      cam(t, c, cam) { camLerp(cam, V3(6.45, 1.6, 1.9), V3(6.55, 1.62, 1.75), V3(7.5, 1.45, 0.75), V3(7.5, 1.5, 0.8), t / 18, 44); } },
    { id: 'H07', dur: 6.0, desc: 'Bedroom wapas — Ammi ko awaaz',
      cam(t, c, cam) { camLerp(cam, V3(1.0, 1.6, 4.6), V3(1.3, 1.6, 4.5), V3(4.6, 1.4, 3.2), V3(3.6, 1.45, 3.4), t / 6, 48); } },
    { id: 'H08', dur: 16.0, desc: 'Ammi bag le kar aati hain, bistar par kholti hain',
      cam(t, c, cam) { camLerp(cam, V3(3.7, 1.9, 4.7), V3(3.5, 1.85, 4.6), V3(1.2, 1.0, 2.6), V3(1.9, 1.0, 2.8), t / 16, 52); } },
    { id: 'H09', dur: 24.0, desc: 'Almari khulti hai, kapre suitcase mein (3 chakkar)',
      cam(t, c, cam) { camLerp(cam, V3(1.2, 2.2, 0.7), V3(1.5, 2.1, 0.9), V3(3.6, 1.0, 3.0), V3(3.9, 1.0, 3.0), t / 24, 58); } },
    { id: 'H10', dur: 8.0, desc: 'Suitcase band, zip, neeche khara',
      cam(t, c, cam) { camLerp(cam, V3(3.8, 1.5, 3.3), V3(3.6, 1.4, 3.1), V3(1.7, 0.8, 2.4), V3(1.9, 0.7, 2.5), t / 8, 44); } },
    { id: 'H11', dur: 16.0, desc: 'Driver ko phone call',
      cam(t, c, cam) { const p = c.umer.root.position; camLerp(cam, V3(1.0, 1.6, 4.4), V3(1.2, 1.6, 4.3), V3(p.x, 1.5, p.z), V3(p.x, 1.5, p.z), t / 16, 46); } },
    { id: 'H12', dur: 40.0, desc: 'Nashta: paratha, chai, Ammi ki dua, bahar horn',
      cam(t, c, cam) {
        if (t < 14) camLerp(cam, V3(-0.6, 1.8, 4.6), V3(-0.9, 1.7, 4.3), V3(-3, 0.9, 2.5), V3(-3, 0.9, 2.5), t / 14, 46);
        else if (t < 27) camLerp(cam, V3(-4.6, 1.3, 1.0), V3(-4.5, 1.3, 1.1), V3(-3.3, 1.15, 1.9), V3(-3.3, 1.15, 1.9), (t - 14) / 13, 40);
        else camLerp(cam, V3(-1.2, 1.35, 4.2), V3(-1.4, 1.35, 4.0), V3(-2.6, 1.25, 3.2), V3(-2.7, 1.2, 3.1), (t - 27) / 13, 40);
      } }
  ],
  update(t, c, cam, shot) {
    const { umer, ammi, vcam, home, brush, phone, pot, open, stacks, foam, bag, P } = c;
    const talkU = speaking(SUBS, t, 'Umer'), talkA = speaking(SUBS, t, 'Ammi');
    home.fan.rotation.y = t * 6;
    const B = (o, p) => { if (o.parent !== p) p.add(o); };
    const scene = home.bed.parent;
    // defaults
    brush.visible = false; phone.visible = false; pot.visible = false; foam.visible = false; vcam.visible = true;
    ammi.root.visible = t >= 62.5; umer.setNeutral(); ammi.setNeutral(); showCamBag(umer, false);
    home.blanket.position.set(0, 0.71, 1.4); home.blanket.scale.set(1, 1, 1);
    for (const d of home.doors) d.piv.rotation.y = 0;
    open.group.visible = t >= 80 && t < 110; open.setLid(t < 104 ? 1 : 1 - smooth(range(t, 104, 105.6)));
    bag.group.visible = false;
    // stacks: almari mein → haath mein → suitcase mein
    const trips = [[84.0, 88.4], [92.6, 96.8], [100.6, 104.0]];
    stacks.forEach((s, i) => {
      const [tp, td] = trips[i];
      s.visible = t >= 80;
      if (t < tp) { placeWorld(s, scene, new THREE.Vector3(5.2 + (i - 1) * 0.33, 1.3, 4.6), 0); s.visible = t < 104.0 && t >= 0; }
      else if (t < td) { attachToHand(s, umer, 'R', new THREE.Vector3(0.12, -0.1, 0.06), new THREE.Euler(0, 0, Math.PI / 2)); }
      else { const sl = open.slots[i]; open.group.updateMatrixWorld(true); const p = sl.clone().applyMatrix4(open.group.matrixWorld); placeWorld(s, scene, p, 0); s.visible = t < 105.2; }
    });
    // ---------- UMER ----------
    if (t < 12) { // bistar mein letna → uthna (6–12)
      vcam.visible = false;
      const u = smooth(range(t, 8.5, 11.5));
      umer.root.rotation.y = 0;
      umer.J.thighL.rotation.x = umer.J.thighR.rotation.x = -Math.PI / 2 * u;
      placeByHips(umer, new THREE.Vector3(1.6, 0.86, 2.35), -Math.PI / 2 * (1 - u));
      home.blanket.position.set(0, 0.92, 1.5); home.blanket.scale.set(1, 1, 1.0);
      if (t > 9) { umer.J.upperArmL.rotation.z = 0.25; umer.J.upperArmR.rotation.z = -0.25; }
      umer.J.head.rotation.x = t < 6 ? -0.1 : 0;
    } else if (t < 20) { // kinare par baithna, angraai, khara
      vcam.visible = false;
      umer.root.position.set(2.62, 0, 2.6); umer.root.rotation.y = Math.PI / 2;
      const stand = smooth(range(t, 16.5, 18.0));
      poseSit(umer, 1 - stand); umer.root.position.y = 0.3 * (1 - stand);
      const st = Math.sin(range(t, 12.4, 16.0) * Math.PI);
      umer.J.upperArmL.rotation.z = lerp(0.08, 2.8, st); umer.J.upperArmR.rotation.z = lerp(-0.08, -2.8, st); umer.J.spine.rotation.x = -0.1 * st;
      if (t > 18) { umer.root.position.x = 2.62 + (t - 18) * 0.5; poseCarryCam(umer, 1); vcam.visible = true; holdCamera(umer, vcam, V3(5, 1, 2.6)); }
    } else if (t < 32) { // selfie intro
      umer.root.position.set(3.6, 0, 2.9); umer.root.rotation.y = Math.PI / 2 + 0.6; poseIdle(umer, t);
      poseCarryCam(umer, 1); poseSelfie(umer, smooth(range(t, 20, 20.4)) * (1 - smooth(range(t, 31.5, 32))), Math.sin(t * 2));
      umer.root.updateMatrixWorld(true); const head = new THREE.Vector3(); umer.J.head.getWorldPosition(head); head.y += 0.08; holdCamera(umer, vcam, head);
    } else if (t < 55.8) { // bathroom walk + brush
      applyPlan(umer, P.walkBath, t);
      if (t < 38.5) { poseCarryCam(umer, 1); holdCamera(umer, vcam, V3(7.5, 1, 0)); }
      else {
        placeWorld(vcam, scene, V3(7.18, 0.97, 0.32), 0); vcam.rotation.set(0, 0.6, 0); // camera sink ke kinare par
        if (t < 52.0) { poseBrush(umer, t, smooth(range(t, 38.5, 39.2))); brush.visible = true; attachToHand(brush, umer, 'R', V3(0.03, -0.09, 0.04), new THREE.Euler(Math.PI / 2, 0, -Math.PI / 2)); foam.visible = t > 41; }
        if (foam.visible) { umer.root.updateMatrixWorld(true); const m = new THREE.Vector3(); umer.mouth.getWorldPosition(m); placeWorld(foam, scene, m.add(V3(0, -0.012, -0.012)), Math.PI); }
        if (t > 52) { umer.J.upperArmR.rotation.x = -0.2; }
      }
    } else if (t < 63) { // bedroom wapas, awaaz
      applyPlan(umer, P.back, t); poseCarryCam(umer, 1); holdCamera(umer, vcam, V3(0, 1.4, 2.3));
      if (t > 58.6) { poseReach(umer, 'L', 1.4, 1); umer.J.forearmL.rotation.x = -2.0; umer.J.head.rotation.x = -0.1; } // haath munh ke paas (awaaz)
    } else if (t < 79) { // Ammi aati hain
      umer.root.position.set(3.6, 0, 3.6); umer.root.rotation.y = -Math.PI / 2 + (t > 64 ? -0.4 : 0); poseIdle(umer, t); poseCarryCam(umer, 1); holdCamera(umer, vcam, V3(0, 1, 3));
    } else if (t < 106) { // packing trips
      applyPlan(umer, P.pack, t);
      const carrying = trips.some(([a, b]) => t > a && t < b - 0.3);
      if (carrying) { poseCarryFront(umer, 1); } else { umer.J.upperArmR.rotation.x = -0.1; }
      const reach = trips.some(([a]) => t > a - 0.8 && t < a + 0.2) || trips.some(([, b]) => t > b - 0.9 && t < b);
      if (reach) poseReach(umer, 'R', 1.0, 1);
      // camera bistar par rakha hai (packing ke dauran)
      placeWorld(vcam, scene, V3(1.15, 0.72, 3.0), 0); vcam.rotation.set(0, Math.PI * 0.35, 0);
      // almari ke darwaze
      const d = smooth(range(t, 80.8, 82.0)) * (1 - smooth(range(t, 104.2, 105.2)));
      for (const dd of home.doors) dd.piv.rotation.y = -dd.s * 1.9 * d;
      if (t > 104 && t < 106) poseReach(umer, 'R', 0.9, 1);
    } else if (t < 110) { // zip + bag neeche
      umer.root.position.set(2.8, 0, 2.4); umer.root.rotation.y = -Math.PI / 2; poseReach(umer, 'R', 0.9, 1); poseReach(umer, 'L', 0.9 * smooth(range(t, 107.5, 108.5)), 1);
      umer.J.spine.rotation.x = 0.3; placeWorld(vcam, scene, V3(1.15, 0.72, 3.0), 0); vcam.rotation.set(0, Math.PI * 0.35, 0);
      if (t > 108.6) { open.group.visible = false; bag.group.visible = true; bag.setExtend(0); placeWorld(bag.group, scene, V3(2.3, 0, 2.0), Math.PI / 2); }
    } else if (t < 128) { // phone call
      applyPlan(umer, P.phone, t); posePhone(umer, smooth(range(t, 111.5, 112.3)) * (1 - smooth(range(t, 125.6, 126.4))), 'L');
      phone.visible = t > 111.5 && t < 126.4; attachToHand(phone, umer, 'L', V3(-0.03, -0.1, 0.03), new THREE.Euler(0, Math.PI / 2, 0));
      poseCarryCam(umer, 1); holdCamera(umer, vcam, V3(0, 1, 2)); bag.group.visible = true; placeWorld(bag.group, scene, V3(2.3, 0, 2.0), Math.PI / 2);
    } else { // nashta
      bag.group.visible = false;
      umer.root.position.set(-3.45, 0.105, 1.65); umer.root.rotation.y = 0; poseSit(umer, 1);
      if (t < 156) poseEat(umer, t, 1); else { umer.J.head.rotation.y = -0.6; }
      if (t > 160) { const s = smooth(range(t, 160, 161.5)); umer.root.position.y = lerp(0.105, 0, s); poseSit(umer, 1 - s); }
      placeWorld(vcam, scene, V3(-3.0, 0.83, 2.1), 0); vcam.rotation.set(0, -2.6, 0);
    }
    // ---------- AMMI ----------
    if (t >= 62.5 && t < 128) {
      const ap = applyPlan(ammi, P.ammiIn, Math.min(t, 79));
      if (t < 68) { bag.group.visible = true; bag.setExtend(1); posePullBag(ammi, 1); attachBagToHand(ammi, 'L', bag); }
      else if (t < 80) { // bag bistar par lita kar kholna
        poseReach(ammi, 'L', 1.0, 1); poseReach(ammi, 'R', 1.0, 1); ammi.J.spine.rotation.x = 0.35 * Math.sin(range(t, 68, 79.5) * Math.PI);
        if (t < 80) { bag.group.visible = true; bag.setExtend(0); placeWorld(bag.group, scene, V3(1.75, 0.68 + 0.0, 2.6), 0); bag.group.rotation.set(-Math.PI / 2, 0, 0); }
      }
      if (t > 79) { ammi.root.position.set(0.9, 0, 3.9); ammi.root.rotation.y = Math.PI / 2 + 0.5; poseIdle(ammi, t); }
      if (t > 89 && t < 94) poseWave(ammi, t, 'R', 0.5);
      faceUpdate(ammi, t, talkA);
      ammi.root.visible = true;
    }
    if (t >= 128) { // nashte par Ammi: chai daalti hain, phir baithti hain
      ammi.root.visible = true;
      if (t < 141) { ammi.root.position.set(-2.25, 0, 3.3); ammi.root.rotation.y = -2.5; poseIdle(ammi, t); poseReach(ammi, 'R', 0.9, 1); pot.visible = true; attachToHand(pot, ammi, 'R', V3(0.03, -0.12, 0.05)); pot.rotation.z = -0.6 * Math.sin(range(t, 129, 135) * Math.PI); }
      else { ammi.root.position.set(-2.55, 0.105, 3.35); ammi.root.rotation.y = Math.PI; poseSit(ammi, 1); }
      if (t > 161) { ammi.root.position.set(-2.4, 0, 3.0); ammi.root.rotation.y = -2.4; poseSit(ammi, 0); poseWave(ammi, t, 'R', smooth(range(t, 162, 162.5))); }
      faceUpdate(ammi, t, talkA);
    }
    faceUpdate(umer, t, talkU && !brush.visible ? 1 : 0);
    if (t < 6) { umer.eyes.forEach(e => e.lid.rotation.x = 1.05); } // aankhein band
  }
};
