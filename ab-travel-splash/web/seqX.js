// SEQUENCE X — Raaste mein Revo kharab: bhaap (steam), hazard lights, kinare par rukna, pareshani
import * as THREE from 'three';
import { buildKarachiScene, LANE_Z } from './seqB.js';
import { createCast, seatInRevo } from './lib/cast.js';
import { poseWatch, poseWorried, poseCarryCam, poseReach, poseWork, faceUpdate, poseIdle, poseSelfie } from './lib/character.js';
import { holdCamera, camLerp, handheld, speaking, V3 } from './lib/anim.js';
import { mat, mesh, softSprite, smooth, range, clamp, rng } from './lib/util.js';

const X0 = 420, ZS = -6.6;
function rx(t) { // 14 m/s → bhaap → dheere → kinare par stop (t=13)
  if (t < 4) return X0 - 119 + 14 * t;
  const u = Math.min(t - 4, 9); return X0 - 63 + 14 * u - (7 / 9) * u * u;
}
const SUBS = [
  [3.4, 6.4, 'Driver', 'Arey! Yeh bonnet se dhuaan kyun nikal raha hai?', 'ارے! یہ بونٹ سے دھواں کیوں نکل رہا ہے؟'],
  [7.0, 10.0, 'Umer', 'Chacha, gaari kinare par laga dein!', 'چچا، گاڑی کنارے پر لگا دیں!'],
  [16.4, 20.4, 'Driver', 'Umer bhai, radiator garam ho gaya hai — paani khatam!', 'عمر بھائی، ریڈی ایٹر گرم ہو گیا ہے، پانی ختم!'],
  [21.4, 26.0, 'Umer', 'Yaar yeh kya ho gaya! Main late ho raha hoon — meri flight nikal jayegi!', 'یار یہ کیا ہو گیا! میں لیٹ ہو رہا ہوں، میری فلائٹ نکل جائے گی!'],
  [27.0, 31.4, 'Driver', 'Fikar na karein, paas hi ek workshop hai. Dheere dheere le chalte hain.', 'فکر نہ کریں، پاس ہی ایک ورکشاپ ہے۔ دھیرے دھیرے لے چلتے ہیں۔'],
  [32.4, 37.4, 'Umer', 'Dosto, dekh rahe hain? Safar mein kuch bhi ho sakta hai... dua karein!', 'دوستو، دیکھ رہے ہیں؟ سفر میں کچھ بھی ہو سکتا ہے... دعا کریں!']
];
export default {
  id: 'X', title: 'Raaste mein mushkil!', subs: SUBS, ambience: 'street', sfx: [[3.0, 'hiss'], [14.2, 'door'], [15.0, 'hood']],
  build(scene, renderer) {
    const k = buildKarachiScene(scene, renderer, 31);
    const c = createCast(scene);
    // steam sprites
    const sm = new THREE.SpriteMaterial({ map: softSprite('#f2f2f2', 64), transparent: true, depthWrite: false, opacity: 0.6 });
    const steam = []; for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(sm.clone()); scene.add(s); steam.push(s); }
    // hazard lights (amber, 4 kone)
    const hz = []; const hm = new THREE.MeshStandardMaterial({ color: '#ffb000', emissive: '#ff9a00', emissiveIntensity: 0 });
    for (const [x, z] of [[2.62, 0.75], [2.62, -0.75], [-2.62, 0.82], [-2.62, -0.82]]) { const b = mesh(new THREE.BoxGeometry(0.08, 0.06, 0.16), hm); b.position.set(x, 0.9, z); c.revo.group.add(b); hz.push(b); }
    return { ...k, ...c, steam, hm };
  },
  shots: [
    { id: 'X01', dur: 7.0, desc: 'Tracking: bonnet se bhaap nikalti hai',
      cam(t, c, cam) { const x = c.revo.group.position.x; cam.position.set(x + 9, 2.2, -10.5); cam.lookAt(x + 1, 1.2, ZS); cam.fov = 42; } },
    { id: 'X02', dur: 7.0, desc: 'Revo left kinare par rukti hai, hazard lights',
      cam(t, c, cam) { camLerp(cam, V3(X0 + 22, 3, -12), V3(X0 + 18, 2.6, -11.5), V3(X0 - 6, 1, ZS), V3(X0, 1, ZS), t / 7, 40); } },
    { id: 'X03', dur: 12.0, desc: 'Driver bonnet kholta hai, bhaap; Umer bahar aa kar pareshan',
      cam(t, c, cam) { const h = handheld(t, 0.8); camLerp(cam, V3(X0 + 7.5, 1.7, -10.0).add(h), V3(X0 + 6.8, 1.6, -9.6).add(h), V3(X0 + 2.6, 1.3, ZS - 0.6), V3(X0 + 2.6, 1.35, ZS - 0.8), t / 12, 44); } },
    { id: 'X04', dur: 7.0, desc: 'Close: Umer ghari dekhta hai — late ho raha hoon!',
      cam(t, c, cam) { const p = c.umer.root.position; cam.position.set(p.x + 1.6, 1.6, p.z - 1.0); cam.lookAt(p.x, 1.5, p.z); cam.fov = 38; } },
    { id: 'X05', dur: 7.0, desc: 'Vlog: Umer camera se baat karta hai', selfie: true,
      cam(t, c, cam) { c.vcam.updateMatrixWorld(true); const p = new THREE.Vector3(); c.vcam.getWorldPosition(p); const hd = new THREE.Vector3(); c.umer.J.head.getWorldPosition(hd); hd.y += 0.07; cam.position.copy(p).addScaledVector(hd.clone().sub(p).normalize(), 0.07); cam.lookAt(hd.x, hd.y - 0.1, hd.z); cam.fov = 72; } }
  ],
  update(t, c, cam, shot) {
    const { revo, umer, driver, vcam } = c;
    const x = rx(t); const lat = smooth(range(t, 8, 12.5));
    revo.group.position.set(x, 0, LANE_Z + (ZS - LANE_Z) * lat); revo.group.rotation.y = -0.12 * Math.sin(lat * Math.PI); revo.roll(x);
    c.traffic.update(t, x);
    for (const it of c.traffic.items) it.v.group.visible = !(it.ln.z < -7 && Math.abs(it.v.group.position.x - x) < 25);
    c.train.update(-900, 0);
    c.hm.emissiveIntensity = t > 9 && (t % 0.8) < 0.4 ? 2.5 : 0.0;
    revo.setHood(smooth(range(t, 15.0, 16.4)));
    // bhaap: engine se upar
    const hood = new THREE.Vector3(1.9, 1.2, 0).applyMatrix4(revo.group.matrixWorld);
    const amt = t < 3 ? 0 : t < 15 ? 0.5 : 1.0;
    c.steam.forEach((s, i) => { const age = ((t * 0.9 + i / c.steam.length * 2.2) % 2.2); s.visible = amt > 0; s.position.set(hood.x + Math.sin(i * 7) * 0.3 - (t < 13 ? age * 3 : 0), hood.y + age * 1.2, hood.z + Math.cos(i * 3) * 0.3); const sc = 0.4 + age * 0.9; s.scale.set(sc, sc, 1); s.material.opacity = amt * 0.55 * (1 - age / 2.2); });
    if (t < 14) { seatInRevo(c, t, { talk: speaking(SUBS, t, 'Umer') }); revo.group.updateMatrixWorld(true); }
    else {
      const scene = revo.group.parent;
      if (umer.root.parent !== scene) scene.add(umer.root);
      if (driver.root.parent !== scene) scene.add(driver.root);
      umer.setNeutral(); driver.setNeutral(); poseIdle(umer, t); poseIdle(driver, t);
      driver.root.position.set(X0 + 3.35, 0, ZS + 0.3); driver.root.rotation.y = -Math.PI / 2;
      if (t > 14.8 && t < 16.5) poseReach(driver, 'R', 1.6, 1); else if (t > 16.5) { poseWork(driver, t, 0.6); }
      umer.root.position.set(X0 + 2.9, 0, ZS - 1.35); umer.root.rotation.y = -Math.PI / 2 + 0.4;
      poseCarryCam(umer, 1);
      if (t > 20.5 && t < 26.5) poseWorried(umer, t, smooth(range(t, 20.5, 21.2)) * (1 - smooth(range(t, 25.8, 26.4))));
      if (t > 26 && t < 33) { umer.root.rotation.y = -Math.PI / 2 + 0.9; poseWatch(umer, smooth(range(t, 26, 26.6))); }
      const sw = shot.id === 'X05' ? 1 : 0;
      if (sw) { umer.root.rotation.y = Math.PI * 0.75; poseSelfie(umer, 1, Math.sin(t * 2)); }
      umer.root.updateMatrixWorld(true); const hd = new THREE.Vector3(); umer.J.head.getWorldPosition(hd); hd.y += 0.08;
      holdCamera(umer, vcam, sw ? hd : V3(X0 + 2, 1.2, ZS));
      faceUpdate(umer, t, speaking(SUBS, t, 'Umer')); faceUpdate(driver, t, speaking(SUBS, t, 'Driver'));
    }
    c.L.follow(new THREE.Vector3(x, 0, -4));
  }
};
