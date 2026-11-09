// A320 cabin interior (aircraft body ke local frame mein: nose +X, port −Z). 3-3 economy, pitch 0.8 m.
// Row 1 front door ke peeche, row 12 wing ke upar (12A = port window). Cockpit: bulkhead x=15.2 ke aage.
import * as THREE from 'three';
import { mat, mesh, box, canvasTex } from './util.js';
import { mergeChildren } from './optimize.js';
import { createCharacter, LOOKS, poseSit } from './character.js';

export const PITCH = 0.8, ROW1 = 12.2;
export const seatX = (row) => ROW1 - (row - 1) * PITCH;
export const SEATZ = { A: -1.45, B: -0.97, C: -0.49, D: 0.49, E: 0.97, F: 1.45 };

export function buildCabin(ac, { rows = 28, umerRow = 12, passengers = 16, seed = 300 } = {}) {
  const CY = ac.CY, FY = CY - 1.2;
  const g = new THREE.Group(); ac.body.add(g);
  const st = new THREE.Group(); g.add(st); // static (merge)
  const wallM = new THREE.MeshStandardMaterial({ color: '#ecebe6', roughness: 0.6, side: THREE.DoubleSide });
  // side walls with window holes (port + starboard)
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape(); sh.moveTo(-12.5, -0.95); sh.lineTo(13.2, -0.95); sh.lineTo(13.2, 1.15); sh.lineTo(-12.5, 1.15); sh.closePath();
    for (let r = 1; r <= rows; r++) { const x = seatX(r) + 0.12; if (x < -12) break; const h = new THREE.Path(); h.absellipse(s < 0 ? x : -x, 0.3, 0.12, 0.17, 0, Math.PI * 2, false); sh.holes.push(h); }
    const w = mesh(new THREE.ShapeGeometry(sh, 16), wallM, { cast: false }); w.position.set(0, CY, s * 1.74); if (s > 0) w.rotation.y = Math.PI; st.add(w);
    for (let r = 1; r <= rows; r++) { const x = seatX(r) + 0.12; if (x < -12) break; const b = mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 20), mat('#d6d3cc', 0.6), { cast: false }); b.scale.set(0.85, 1.18, 1); b.position.set(x, CY + 0.3, s * 1.72); st.add(b);
      const sd = box(0.3, 0.05, 0.03, mat('#cfccc4', 0.5), x, CY + 0.5, s * 1.71, { cast: false }); st.add(sd); }
    // overhead bins
    const bin = box(25.6, 0.42, 0.62, mat('#f1f0ec', 0.45), 0.35, CY + 1.22, s * 1.38, { cast: false }); bin.rotation.x = s * -0.32; st.add(bin);
    st.add(box(25.6, 0.04, 0.5, mat('#d9d6cf', 0.5), 0.35, CY + 0.98, s * 1.25, { cast: false })); // PSU strip
    st.add(box(25.6, 0.5, 0.12, mat('#e6e4de', 0.6), 0.35, CY - 0.75, s * 1.66, { cast: false })); // lower sidewall
  }
  // floor + aisle carpet + ceiling + light strip
  st.add(box(26, 0.05, 3.5, mat('#3a4250', 0.95), 0.3, FY - 0.02, 0, { cast: false }));
  const carpetT = canvasTex(128, 512, (c, w, h) => { c.fillStyle = '#1d3a78'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a4a8e'; for (let y = 0; y < h; y += 32) c.fillRect(0, y, w, 6); }, { repeat: [1, 20] });
  { const a = mesh(new THREE.PlaneGeometry(0.62, 25.6), new THREE.MeshStandardMaterial({ map: carpetT, roughness: 1 }), { cast: false }); a.rotation.x = -Math.PI / 2; a.rotation.z = Math.PI / 2; a.position.set(0.35, FY + 0.014, 0); st.add(a); }
  st.add(box(25.6, 0.05, 1.5, mat('#f6f5f2', 0.6), 0.35, CY + 1.62, 0, { cast: false }));
  st.add(box(25.6, 0.02, 0.12, new THREE.MeshBasicMaterial({ color: '#fff4e2' }), 0.35, CY + 1.59, 0, { cast: false }));
  for (const s of [-1, 1]) st.add(box(25.6, 0.02, 0.05, new THREE.MeshBasicMaterial({ color: '#cfe0ff' }), 0.35, CY + 1.45, s * 0.8, { cast: false }));
  // seats
  const seatM = mat('#22335e', 0.95), coverM = mat('#e7ebf2', 0.8), armM = mat('#6d7480', 0.6), trayM = mat('#9aa1ab', 0.6);
  const seats = [];
  for (let r = 1; r <= rows; r++) {
    const sx = seatX(r); if (sx < -11.6) break;
    for (const [k, z] of Object.entries(SEATZ)) {
      st.add(box(0.46, 0.1, 0.44, seatM, sx, FY + 0.44, z));
      const bk = box(0.09, 0.78, 0.44, seatM, sx - 0.25, FY + 0.86, z); bk.rotation.z = 0.1; st.add(bk);
      const hc = box(0.1, 0.2, 0.36, coverM, sx - 0.2, FY + 1.12, z, { cast: false }); hc.rotation.z = 0.1; st.add(hc);
      st.add(box(0.12, 0.38, 0.44, mat('#2a2d33', 0.8), sx - 0.05, FY + 0.19, z, { cast: false }));
      if (!(r === umerRow - 1 && k === 'A')) { const tr = box(0.02, 0.3, 0.38, trayM, sx - 0.31, FY + 0.78, z, { cast: false }); tr.rotation.z = 0.1; st.add(tr); }
      seats.push({ row: r, k, x: sx, z });
    }
    for (const z of [-1.69, -1.21, -0.73, -0.25, 0.25, 0.73, 1.21, 1.69]) st.add(box(0.4, 0.05, 0.05, armM, sx, FY + 0.66, z, { cast: false }));
  }
  // Umer ka tray table (row umerRow-1, seat A ke peeche) — hinge seatback ke upar
  const fx = seatX(umerRow - 1);
  const trayPivot = new THREE.Group(); trayPivot.position.set(fx - 0.33, FY + 0.92, SEATZ.A); g.add(trayPivot);
  const tray = box(0.02, 0.3, 0.38, trayM, -0.0, -0.15, 0); tray.position.set(-0.01, -0.15, 0); trayPivot.add(tray); // stowed: vertical (rotation.z=0) → open: rotation.z = π/2 (andar ki taraf)
  // row labels on PSU strip
  for (const r of [10, 11, 12, 13, 14]) { const t = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#e8e5de'; c.fillRect(0, 0, w, h); c.fillStyle = '#1c2a4a'; c.font = 'bold 44px DejaVu Sans'; c.fillText(r + '  A B C', 20, 48); });
    const p = mesh(new THREE.PlaneGeometry(0.3, 0.075), new THREE.MeshBasicMaterial({ map: t }), { cast: false }); p.position.set(seatX(r) + 0.05, CY + 0.94, -1.0); p.rotation.set(-Math.PI / 2 + 0.25, 0, Math.PI / 2); st.add(p); }
  // front: galley wall (starboard), door area, cockpit bulkhead x=15.2 with open door
  st.add(box(1.4, 2.0, 1.4, mat('#d8d9dc', 0.4, 0.4), 14.2, FY + 1.0, 1.0));
  for (const z of [-1.2, 0.95]) st.add(box(0.08, 2.1, z < 0 ? 1.2 : 1.0, wallM, 15.2, FY + 1.05, z));
  st.add(box(0.08, 0.3, 3.4, wallM, 15.2, FY + 2.0, 0));
  const door = box(0.04, 1.9, 0.75, mat('#c9ccd1', 0.4), 15.2, FY + 0.95, -0.2); door.position.set(15.2, FY + 0.95, 0.65); door.rotation.y = 1.3; st.add(door);
  // cockpit
  st.add(box(4, 0.05, 2.6, mat('#2a2d33', 0.9), 17.0, FY + 0.02, 0, { cast: false }));
  const panel = box(0.5, 0.55, 2.0, mat('#1e2126', 0.6), 18.0, FY + 0.95, 0); st.add(panel);
  st.add(box(0.5, 0.1, 2.1, mat('#15171a', 0.7), 17.85, FY + 1.27, 0));
  st.add(box(0.6, 0.25, 0.5, mat('#26292e', 0.6), 17.5, FY + 0.8, 0)); // pedestal
  st.add(box(1.6, 0.06, 1.6, mat('#2a2d33', 0.7), 17.2, CY + 1.25, 0)); // overhead panel
  for (const z of [-0.55, 0.55]) { st.add(box(0.55, 0.12, 0.5, mat('#3a3d44', 0.9), 16.7, FY + 0.48, z)); const b = box(0.1, 0.85, 0.5, mat('#3a3d44', 0.9), 16.4, FY + 0.95, z); b.rotation.z = 0.12; st.add(b); }
  const scrM = new THREE.MeshBasicMaterial({ color: '#1f6fd0' }); const scrN = new THREE.MeshBasicMaterial({ color: '#2fb35a' });
  for (const z of [-0.85, -0.42, 0.42, 0.85]) { const s = mesh(new THREE.PlaneGeometry(0.22, 0.2), Math.abs(z) > 0.6 ? scrM : scrN, { cast: false }); s.position.set(17.74, FY + 1.02, z); s.rotation.y = -Math.PI / 2; st.add(s); }
  const ecam = mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ color: '#0d3a1f' }), { cast: false }); ecam.position.set(17.74, FY + 0.78, 0); ecam.rotation.y = -Math.PI / 2; st.add(ecam);
  mergeChildren(st);
  // cabin lights (shadow-less)
  for (const x of [12, 6, 0, -6]) { const l = new THREE.PointLight('#fff3e0', 9, 9, 1.4); l.position.set(x, CY + 1.3, 0); g.add(l); }
  { const l = new THREE.PointLight('#dfe8ff', 3, 4, 1.5); l.position.set(17, CY + 0.9, 0); g.add(l); }
  // pilots
  const pilot = createCharacter({ ...LOOKS.pilot }, 501), copilot = createCharacter({ ...LOOKS.coPilot }, 502);
  for (const [P, z] of [[pilot, -0.55], [copilot, 0.55]]) { g.add(P.root); P.root.position.set(16.95, FY + 0.12, z); P.root.rotation.y = Math.PI / 2; }
  // passengers seated
  const looks = [LOOKS.passengerM, LOOKS.passengerF, LOOKS.businessTraveller, LOOKS.youngPassenger, LOOKS.loungePassenger, LOOKS.passengerM, LOOKS.passengerF];
  const pax = []; let rr = seed;
  const rand = () => { rr = (rr * 16807) % 2147483647; return rr / 2147483647; };
  const taken = new Set([`${umerRow}A`, `${umerRow}B`, `${umerRow}C`]);
  for (let i = 0; i < passengers; i++) {
    const row = 3 + Math.floor(rand() * 16); const ks = 'ABCDEF'; const k = ks[Math.floor(rand() * 6)]; const id = row + k; if (taken.has(id)) continue; taken.add(id);
    const n = createCharacter({ ...looks[i % looks.length], cameraBag: false, backpack: null }, seed + i); g.add(n.root);
    n.root.position.set(seatX(row) - 0.12, FY + 0.12, SEATZ[k]); n.root.rotation.y = Math.PI / 2; pax.push(n);
  }
  return { g, FY, seats, trayPivot, pilot, copilot, pax, sit(C, row, k) { C.root.position.set(seatX(row) - 0.12, FY + 0.12, SEATZ[k]); C.root.rotation.y = Math.PI / 2; } };
}
export function cabinPeople(cab, t) {
  for (const n of [...cab.pax, cab.pilot, cab.copilot]) { n.setNeutral(); poseSit(n, 1); n.J.chest.rotation.x = 0.01 * Math.sin(t + n.root.id); }
}

// Vlog camera window ke saath laga hua (Umer haath se window par tikata hai): lens bahar
export function windowCam(ac, cab, vcam, row, lookLocal) {
  ac.group.updateMatrixWorld(true);
  if (vcam.parent !== ac.body) ac.body.add(vcam);
  vcam.scale.setScalar(1); vcam.position.set(seatX(row) + 0.14, ac.CY + 0.28, -1.6);
  vcam.lookAt(lookLocal.clone().applyMatrix4(ac.body.matrixWorld)); vcam.updateMatrixWorld(true);
}
