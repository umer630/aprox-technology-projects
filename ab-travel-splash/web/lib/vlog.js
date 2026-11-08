// VLOG CAMERA SYSTEM — Travel Splash ka locked camera grammar.
// Render camera hamesha Umer ke haath wale vlog camera ke lens se dekhta hai (selfie ya rear mode),
// ya camera kisi physical jagah (table/dashboard) par rakha hota hai. Drone/floating camera nahi.
import * as THREE from 'three';
import { poseSelfie, poseVlogForward, poseCarryCam } from './character.js';
import { holdCamera } from './anim.js';
import { smooth, clamp } from './util.js';

// mode(t) → 0 = selfie, 1 = rear/forward. Keyframes: [[t, mode], ...] beech mein smooth ghoomna (0.9 s)
export function modeAt(keys, t) {
  let m = keys[0][1];
  for (let i = 0; i < keys.length; i++) { const [tk, mk] = keys[i]; if (t >= tk) { const prev = i ? keys[i - 1][1] : mk; m = prev + (mk - prev) * smooth((t - tk) / 0.9); } }
  return clamp(m);
}
// Umer ka haath + camera pose, aur lens ka target set karo. forwardTarget = rear mode mein camera kahan dekhe (world point)
export function vlogPose(C, vcam, m, forwardTarget = null, t = 0, { free = false } = {}) {
  poseCarryCam(C, 1);
  const sw = 1 - m;
  if (sw > 0.001) poseSelfie(C, sw, Math.sin(t * 2) * 0.5);
  if (m > 0.001) poseVlogForward(C, m);
  C.root.updateMatrixWorld(true);
  const head = new THREE.Vector3(); C.J.head.getWorldPosition(head); head.y += 0.08;
  // rear mode hamesha Umer ke saamne (jidhar wo mun karta hai); forwardTarget sirf unchai/doori ke liye
  const q = new THREE.Quaternion(); C.root.getWorldQuaternion(q); const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q); fwd.y = 0; fwd.normalize();
  let ft = head.clone().addScaledVector(fwd, 4); ft.y = 1.2;
  if (forwardTarget) { const d = forwardTarget.clone().sub(head); d.y = 0; if (free || d.dot(fwd) > 0.2 * d.length()) ft = forwardTarget.clone(); }
  // lens ki direction ko ghumao (point lerp camera ke peeche se guzar jata tha → chhat dikhti thi)
  holdCamera(C, vcam, null); const p = new THREE.Vector3(); vcam.getWorldPosition(p);
  const d0 = head.clone().sub(p).normalize(), d1 = ft.clone().sub(p).normalize(); const s = smooth(m);
  let d = d0.clone().lerp(d1, s); if (d.length() < 0.35) { const side = new THREE.Vector3().crossVectors(d0, new THREE.Vector3(0, 1, 0)).normalize(); d.addScaledVector(side, Math.sin(s * Math.PI) * 0.8); }
  d.normalize(); const tgt = p.clone().addScaledVector(d, 3);
  holdCamera(C, vcam, tgt);
  return tgt;
}
// Render camera = vlog camera ka lens (+ halki haath ki larzish)
export function lensCam(vcam, cam, t, { fov = 74, shake = 1, back = 0 } = {}) {
  vcam.updateMatrixWorld(true);
  const p = new THREE.Vector3(); vcam.getWorldPosition(p);
  const q = new THREE.Quaternion(); vcam.getWorldQuaternion(q);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q); // lens +Z
  const up = new THREE.Vector3(0, 1, 0);
  const sh = new THREE.Vector3(Math.sin(t * 1.7) * 0.005 + Math.sin(t * 4.3) * 0.002, Math.sin(t * 2.1) * 0.004, 0).multiplyScalar(shake);
  cam.position.copy(p).addScaledVector(fwd, 0.06 - back).add(sh);
  cam.up.copy(up); cam.lookAt(cam.position.clone().add(fwd));
  cam.fov = fov; cam.updateProjectionMatrix();
}
// Camera kisi cheez par rakha hua (table/dashboard/seat-back): fixed lens
export function restCam(cam, pos, look, fov = 70) { cam.position.copy(pos); cam.lookAt(look); cam.fov = fov; cam.updateProjectionMatrix(); }
