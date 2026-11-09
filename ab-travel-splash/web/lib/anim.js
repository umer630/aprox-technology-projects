import * as THREE from 'three';
import { walkSpeed, WALK, poseWalk, poseIdle, faceUpdate } from './character.js';
import { clamp, lerp, smooth } from './util.js';

const headingOf = (dx, dz) => Math.atan2(dx, dz);
const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; };

// Walk plan: [{at, to:[x,z]} | {at, face:rad, dur}] — speed character ke stride se derive hoti hai (no foot sliding)
export function plan(C, start, heading, steps) {
  const v = walkSpeed(C); const segs = []; let p = [...start], h = heading;
  for (const s of steps) {
    if (s.to) {
      const dx = s.to[0] - p[0], dz = s.to[1] - p[1], d = Math.hypot(dx, dz);
      const nh = headingOf(dx, dz); const dur = d / v;
      segs.push({ type: 'walk', t0: s.at, t1: s.at + dur, from: [...p], to: [...s.to], h0: h, h: nh, d });
      p = [...s.to]; h = nh;
    } else if (s.face !== undefined) {
      segs.push({ type: 'turn', t0: s.at, t1: s.at + (s.dur || 0.6), h0: h, h: s.face, pos: [...p] }); h = s.face;
    }
  }
  return { segs, start, heading, v, end: { pos: p, h } };
}

export function evalPlan(P, t) {
  let pos = [...P.start], h = P.heading, walking = 0, phase = 0, dist = 0;
  for (const s of P.segs) {
    if (t < s.t0) break;
    if (s.type === 'walk') {
      const u = clamp((t - s.t0) / (s.t1 - s.t0));
      pos = [lerp(s.from[0], s.to[0], u), lerp(s.from[1], s.to[1], u)];
      h = angLerp(s.h0, s.h, smooth((t - s.t0) / 0.45));
      if (t < s.t1) { walking = Math.min(1, (t - s.t0) / 0.25, (s.t1 - t) / 0.25 + 0.15); dist = u * s.d; phase = dist * WALK.f / P.v; }
    } else { pos = [...s.pos]; h = angLerp(s.h0, s.h, smooth((t - s.t0) / (s.t1 - s.t0))); }
  }
  return { pos, h, walking: clamp(walking), phase };
}

export function applyPlan(C, P, t, groundY = 0) {
  const st = evalPlan(P, t);
  C.root.position.set(st.pos[0], groundY, st.pos[1]); C.root.rotation.y = st.h;
  C.setNeutral(); poseIdle(C, t);
  if (st.walking > 0.01) poseWalk(C, st.phase, st.walking);
  faceUpdate(C, t, 0);
  return st;
}

// Bag ka handle hamesha haath ke grip point par (float/teleport nahi)
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
export function attachBagToHand(C, side, S, { lift = false, yaw = null } = {}) {
  C.root.updateMatrixWorld(true);
  const hand = C.J['hand' + side];
  hand.localToWorld(_v.set(side === 'L' ? -0.035 : 0.035, -0.075, 0.0));
  const gl = S.gripLocal();
  const yy = yaw ?? C.root.rotation.y;
  S.group.rotation.set(0, yy, 0);
  const off = gl.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yy);
  S.group.position.set(_v.x - off.x, lift ? _v.y - gl.y : 0, _v.z - off.z);
  return S.group.position;
}

// Vlog camera right haath mein — har frame hand ke saath move karta hai
export function holdCamera(C, cam, lookTarget) {
  C.root.updateMatrixWorld(true);
  const hand = C.J.handR;
  if (cam.parent !== hand) { hand.add(cam); }
  cam.position.set(0.045, -0.075, 0.015);
  cam.scale.setScalar(1 / C.rig.scale.x);
  if (lookTarget) cam.lookAt(lookTarget);
  cam.updateMatrixWorld(true);
}

// Simple camera rig helpers
export function handheld(t, amt = 1, seed = 0) {
  return new THREE.Vector3(
    (Math.sin(t * 1.7 + seed) * 0.6 + Math.sin(t * 4.3 + seed * 2) * 0.3) * 0.012 * amt,
    (Math.sin(t * 2.1 + seed * 3) * 0.6 + Math.sin(t * 5.1) * 0.25) * 0.01 * amt,
    (Math.sin(t * 1.3 + seed) * 0.5) * 0.008 * amt);
}
export function camLerp(cam, a, b, la, lb, u, fov = null) {
  const e = smooth(u);
  cam.position.lerpVectors(a, b, e);
  const l = new THREE.Vector3().lerpVectors(la, lb, e); cam.lookAt(l);
  if (fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
}
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Kisi object ko haath ke grip point par lock karna (boarding pass, camera, tray item)
export function attachToHand(obj, C, side, offset = new THREE.Vector3(0, -0.09, 0.02), rot = new THREE.Euler(0, 0, 0)) {
  const hand = C.J['hand' + side];
  if (obj.parent !== hand) hand.add(obj);
  obj.position.copy(offset); obj.rotation.copy(rot); obj.scale.setScalar(1 / C.rig.scale.x);
}
export function placeWorld(obj, scene, pos, rotY = 0) {
  if (obj.parent !== scene) scene.add(obj);
  obj.position.copy(pos); obj.rotation.set(0, rotY, 0); obj.scale.setScalar(1);
}

// Subtitles se mouth animation: jis waqt us speaker ki line chal rahi ho
export function speaking(subs, t, who) { for (const s of subs) if (s[2] === who && t >= s[0] && t < s[1]) return 1; return 0; }
// Root ko hips pivot ke gird ghumana (letna ↔ uthna)
export function placeByHips(C, hipsWorld, rigRotX) {
  const s = C.rig.scale.x; C.rig.rotation.x = rigRotX;
  const v = new THREE.Vector3(0, 0.94 * s, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), rigRotX).applyAxisAngle(new THREE.Vector3(0, 1, 0), C.root.rotation.y);
  C.root.position.copy(hipsWorld).sub(v);
}
