// SEQUENCE X (v3) — Shahrah-e-Faisal par Revo mein masla → Aprox AI DRIVER MODE (phone screen saaf nazar aata hai)
import * as THREE from 'three';
import { buildKarachiScene, LANE_Z } from './lib/karachi.js';
import { createCast, seatInRevo } from './lib/cast.js';
import { faceUpdate } from './lib/character.js';
import { createAproxPhone, drawPhoneInset } from './lib/aproxui.js';
import { attachToHand, speaking, V3 } from './lib/anim.js';
import { modeAt, vlogPose, lensCam } from './lib/vlog.js';
import { mat, mesh, softSprite, smooth, range, lerp } from './lib/util.js';

const X0 = 420, ZS = -6.6;
function rx(t) { if (t < 7) return X0 - 63 - 14 * (7 - t); const u = Math.min(t - 7, 6); return X0 - 63 + 14 * u - (7 / 6) * u * u * 1.0 + (u * u * 0 ); }
const CHAT = [
  { who: 'user', t0: 21.0, cps: 22, text: 'Gaari ke bonnet se dhuaan nikal raha hai aur temperature ki sui laal par hai. Kya karein?' },
  { who: 'ai', t0: 26.6, cps: 30, text: '1) Gaari ko left kinare par rok kar hazard lights on rakhein.  2) Engine band karein aur 10-15 minute thanda hone dein — garam radiator ka dhakkan bilkul na kholein.  3) Coolant ka level aur pipes ka leak check karein.  4) Qareeb tareen workshop: Auto Workshop, 650 m, Shahrah-e-Faisal service road.' }
];
const SUBS = [
  [2.8, 6.4, 'Driver', 'Yaar, gaari mein kuch masla aa gaya hai.', 'یار، گاڑی میں کچھ مسئلہ آ گیا ہے۔'],
  [8.0, 11.4, 'Umer', 'Bonnet se dhuaan! Rashid Bhai, kinare par laga dein.', 'بونٹ سے دھواں! راشد بھائی، کنارے پر لگا دیں۔'],
  [13.4, 19.8, 'Umer', 'Yaar, kisi ko call karne se behtar hai Aprox AI se poochte hain. Aprox AI ka Driver Mode on karte hain.', 'یار، کسی کو کال کرنے سے بہتر ہے ایپروکس اے آئی سے پوچھتے ہیں۔ ایپروکس اے آئی کا ڈرائیور موڈ آن کرتے ہیں۔'],
  [38.4, 45.0, 'Umer', 'Aprox AI keh raha hai — engine thanda hone dein, garam radiator mat kholein, aur workshop sirf 650 meter par hai.', 'ایپروکس اے آئی کہہ رہا ہے، انجن ٹھنڈا ہونے دیں، گرم ریڈی ایٹر مت کھولیں، اور ورکشاپ صرف چھ سو پچاس میٹر پر ہے۔'],
  [45.4, 48.4, 'Driver', 'Wah Umer bhai! Chalo, dheere dheere workshop chalte hain.', 'واہ عمر بھائی! چلو، دھیرے دھیرے ورکشاپ چلتے ہیں۔']
];
const MODE = [[0, 0], [7.0, 1], [13.0, 0], [20.0, 1], [38.0, 0]];
export default {
  id: 'X', title: 'Shahrah-e-Faisal — Gaari mein masla', subs: SUBS, ambience: 'street', exposure: 1.0, sfx: [[2.4, 'hiss'], [21.0, 'tap'], [26.6, 'chime']],
  build(scene, renderer) {
    const k = buildKarachiScene(scene, renderer, 31);
    const c = createCast(scene);
    const sm = new THREE.SpriteMaterial({ map: softSprite('#f2f2f2', 64), transparent: true, depthWrite: false, opacity: 0.6 });
    const steam = []; for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(sm.clone()); scene.add(s); steam.push(s); }
    const hm = new THREE.MeshStandardMaterial({ color: '#ffb000', emissive: '#ff9a00', emissiveIntensity: 0 });
    for (const [x, z] of [[2.62, 0.75], [2.62, -0.75], [-2.62, 0.82], [-2.62, -0.82]]) { const b = mesh(new THREE.BoxGeometry(0.08, 0.06, 0.16), hm); b.position.set(x, 0.9, z); c.revo.group.add(b); }
    const phone = createAproxPhone();
    return { ...k, ...c, steam, hm, phone };
  },
  shots: [
    { id: 'X01', dur: 7.0, desc: 'SELFIE: Rashid Bhai — gaari mein masla', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t, { fov: 78, shake: 1.1 }); } },
    { id: 'X02', dur: 6.0, desc: 'REAR windshield: bonnet se dhuaan, kinare par rukna', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 7, { fov: 78 }); } },
    { id: 'X03', dur: 7.0, desc: 'SELFIE: Aprox AI Driver Mode on karte hain', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 13, { fov: 78 }); } },
    { id: 'X04', dur: 18.0, desc: 'REAR on phone: Aprox AI Driver Mode chat — sawal aur jawab screen par', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 20, { fov: 86, shake: 0.4 }); } },
    { id: 'X05', dur: 10.4, desc: 'SELFIE: hal mil gaya, workshop ki taraf', selfie: true, cam(t, c, cam) { lensCam(c.vcam, cam, t + 38, { fov: 78 }); } }
  ],
  overlay(g, W, H, t, c) { if (t > 20.4 && t < 38) drawPhoneInset(g, W, H, c.phone.canvas, Math.min(1, (t - 20.4) / 0.4, (38 - t) / 0.4)); },
  update(t, c, cam, shot) {
    const { revo, umer, driver, vcam, phone } = c;
    const x = rx(t); const lat = smooth(range(t, 8.5, 13));
    revo.group.position.set(x, 0, LANE_Z + (ZS - LANE_Z) * lat); revo.group.rotation.y = -0.1 * Math.sin(lat * Math.PI); revo.roll(x);
    c.traffic.update(t, x); for (const it of c.traffic.items) it.v.group.visible = !(it.ln.z < -7 && Math.abs(it.v.group.position.x - x) < 25);
    c.train.update(-900, 0);
    c.hm.emissiveIntensity = t > 8 && (t % 0.8) < 0.4 ? 2.5 : 0;
    revo.group.updateMatrixWorld(true);
    const hood = V3(1.9, 1.2, 0).applyMatrix4(revo.group.matrixWorld);
    c.steam.forEach((s, i) => { const age = ((t * 0.9 + i / 16 * 2.2) % 2.2); s.visible = t > 2.4 && t < 40; s.position.set(hood.x + Math.sin(i * 7) * 0.3 - (t < 13 ? age * 3 : 0), hood.y + age * 1.1, hood.z + Math.cos(i * 3) * 0.3); const sc = 0.4 + age * 0.9; s.scale.set(sc, sc, 1); s.material.opacity = 0.5 * (1 - age / 2.2) * (t > 30 ? 1 - range(t, 30, 40) : 1); });
    seatInRevo(c, t, {});
    // phone left haath mein (20–38): seene ke saamne, screen camera ki taraf
    const ph = t > 19.6 && t < 38.4; phone.group.visible = ph;
    if (ph) { umer.J.upperArmL.rotation.x = -1.05; umer.J.upperArmL.rotation.z = -0.35; umer.J.forearmL.rotation.x = -0.9; umer.J.forearmL.rotation.z = -0.4; attachToHand(phone.group, umer, 'L', V3(-0.03, -0.11, 0.05)); phone.update(t, { script: CHAT }); }
    revo.group.updateMatrixWorld(true);
    let ft = V3(16, 1.3, 0).applyMatrix4(revo.group.matrixWorld);
    if (ph) { phone.group.updateMatrixWorld(true); ft = new THREE.Vector3(); phone.group.getWorldPosition(ft); }
    vlogPose(umer, vcam, modeAt(MODE, t), ft, t);
    if (ph) { vcam.updateMatrixWorld(true); const cp = new THREE.Vector3(); vcam.getWorldPosition(cp); phone.group.lookAt(cp); phone.group.translateY(0.045); }
    faceUpdate(umer, t, speaking(SUBS, t, 'Umer')); faceUpdate(driver, t, speaking(SUBS, t, 'Driver'));
    c.L.follow(new THREE.Vector3(x, 0, -4));
  }
};
