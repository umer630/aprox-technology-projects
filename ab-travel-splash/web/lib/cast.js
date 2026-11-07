// LOCKED cast — har sequence mein yahi models (same look + seed) → shot-to-shot identity consistent.
import * as THREE from 'three';
import { createCharacter, LOOKS, poseSit, poseCarryCam, poseSelfie, faceUpdate } from './character.js';
import { createVlogCam, createSuitcase } from './props.js';
import { createRevo } from './vehicles.js';
import { holdCamera } from './anim.js';

export function createCast(scene, { revo = true, driver = true } = {}) {
  const umer = createCharacter(LOOKS.umer, 1); scene.add(umer.root);
  const drv = driver ? createCharacter(LOOKS.driver, 2) : null;
  const vcam = createVlogCam();
  const bag = createSuitcase('#2e4a6b');
  const rv = revo ? createRevo('#121416') : null;
  if (rv) { scene.add(rv.group); rv.group.add(bag.group); bag.group.position.set(-2.15, 0.88, 0); bag.group.rotation.y = Math.PI / 2; bag.setExtend(0); }
  if (rv && drv) rv.group.add(drv.root);
  return { umer, driver: drv, vcam, bag, revo: rv };
}

// Revo ke andar: driver RIGHT seat (+Z), Umer LEFT/passenger seat (−Z)
export function seatInRevo(c, t, { selfie = 0, talk = 0 } = {}) {
  const { umer, driver, revo, vcam } = c;
  if (umer.root.parent !== revo.group) revo.group.add(umer.root);
  for (const [C, seat] of [[umer, revo.seats.passenger], [driver, revo.seats.driver]]) {
    if (!C) continue;
    C.setNeutral(); poseSit(C, 1); C.root.position.set(seat.x - 0.1, 0.43, seat.z); C.root.rotation.y = Math.PI / 2;
    C.J.chest.rotation.x = 0.012 * Math.sin(t * 1.6);
    faceUpdate(C, t, 0);
  }
  if (driver) { driver.J.upperArmL.rotation.x = -0.9; driver.J.upperArmR.rotation.x = -0.9; driver.J.forearmL.rotation.x = -0.5; driver.J.forearmR.rotation.x = -0.5; driver.J.head.rotation.y = 0.05 * Math.sin(t * 0.7); }
  poseCarryCam(umer, 1);
  if (selfie > 0) poseSelfie(umer, selfie, Math.sin(t * 2));
  umer.root.updateMatrixWorld(true);
  const head = new THREE.Vector3(); umer.J.head.getWorldPosition(head); head.y += 0.08;
  const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(revo.group.quaternion);
  holdCamera(umer, vcam, selfie > 0.5 ? head : head.clone().addScaledVector(fwd, 3));
  faceUpdate(umer, t, talk);
}

// Vlog-camera POV (selfie) render camera
export function selfieCam(c, cam, t, { fov = 70, shake = 0.8 } = {}) {
  c.vcam.updateMatrixWorld(true); const p = new THREE.Vector3(); c.vcam.getWorldPosition(p);
  const head = new THREE.Vector3(); c.umer.J.head.getWorldPosition(head); head.y += 0.07;
  const dir = head.clone().sub(p).normalize();
  const sh = new THREE.Vector3(Math.sin(t * 1.7) * 0.006 + Math.sin(t * 4.3) * 0.003, Math.sin(t * 2.1) * 0.005, 0).multiplyScalar(shake);
  cam.position.copy(p).addScaledVector(dir, 0.07).add(sh); cam.lookAt(head.x, head.y - 0.1, head.z); cam.fov = fov; cam.updateProjectionMatrix();
}
