// A320-family narrow-body (Airblue livery reference se): length 37.6 m, span 34.1 m, tail 11.8 m.
// Local frame: nose +X, up +Y, starboard (right wing) +Z.  Origin = main-gear contact point (ground).
import * as THREE from 'three';
import { mat, mesh, box, canvasTex, TAU } from './util.js';

const BLUE = '#1c3f94', NAVY = '#14306f';

function fuselageTexture() {
  // canvas X = angle around fuselage (u), canvas Y = distance from nose (v), 0 = nose
  const W = 1024, Hh = 4096, LEN = 37.6;
  return canvasTex(W, Hh, (g) => {
    g.fillStyle = '#f7f8fa'; g.fillRect(0, 0, W, Hh);
    const vy = (m) => (m / LEN) * Hh; // metres from nose → px
    const ux = (deg) => ((deg + 90) / 360) * W; // phi: -90 bottom, 0 starboard, 90 top, 180 port
    // belly light grey
    g.fillStyle = '#e3e6ea'; g.fillRect(0, 0, ux(-60), Hh); g.fillRect(ux(240), 0, W - ux(240), Hh);
    // cabin windows both sides (phi ≈ 12° starboard, 168° port)
    g.fillStyle = '#20262e';
    for (const deg of [10, 170]) for (let m = 7.2; m < 30.5; m += 0.53) { if (Math.abs(m - 13.5) < 0.6 || Math.abs(m - 14.2) < 0.3) continue; g.beginPath(); g.ellipse(ux(deg), vy(m), 7, 9, 0, 0, TAU); g.fill(); }
    // doors outline
    g.strokeStyle = '#b8bec6'; g.lineWidth = 3;
    for (const deg of [4, 176]) for (const m of [5.6, 32.5]) g.strokeRect(ux(deg) - 26, vy(m) - 26, 52, 56);
    // cockpit windows (black band on nose top-sides)
    g.fillStyle = '#121518';
    for (const deg of [32, 148]) { g.beginPath(); g.moveTo(ux(deg) - 30, vy(1.9)); g.lineTo(ux(deg) + 20, vy(1.5)); g.lineTo(ux(deg) + 34, vy(2.75)); g.lineTo(ux(deg) - 30, vy(2.75)); g.closePath(); g.fill(); }
    g.fillRect(ux(60), vy(1.55), ux(120) - ux(60), vy(0.5));
    // livery: blue "air" + "blue" wordmark sides — vertical along fuselage
    const word = (deg, flip) => {
      g.save(); g.translate(ux(deg), vy(19.5));
      g.rotate(flip ? -Math.PI / 2 : Math.PI / 2); if (flip) g.scale(-1, 1); else g.scale(-1, 1);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 300px DejaVu Sans'; g.fillStyle = '#9fb3d8'; g.fillText('air', -520, 0);
      g.fillStyle = BLUE; g.font = 'bold 340px DejaVu Sans'; g.fillText('blue', 260, 0);
      g.restore();
    };
    word(-8, false); word(188, true);
    // Pakistan flag small near cockpit both sides
    for (const deg of [20, 160]) { g.fillStyle = '#01411c'; g.fillRect(ux(deg) - 18, vy(3.6), 36, 50); g.fillStyle = '#fff'; g.fillRect(ux(deg) - 18, vy(3.6), 36, 12); }
  }, { aniso: 16 });
}

function lathe(points, segs, material, phiStart = -Math.PI / 2) {
  const geo = new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), segs, phiStart, TAU);
  return mesh(geo, material);
}

function wingGeo(rootChord, tipChord, span, sweep, thick, dihedralDeg) {
  // wing planform in local XZ, extruded thickness in Y
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(-rootChord, 0); s.lineTo(-sweep - tipChord, span); s.lineTo(-sweep, span); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.4, bevelSegments: 2 });
  g.rotateX(Math.PI / 2); // shape Y → −Z … we'll mirror per side
  g.translate(0, thick / 2, 0);
  return g;
}

export function createAircraft() {
  const A = new THREE.Group(); A.name = 'aircraft';
  const body = new THREE.Group(); A.add(body); // pitch/roll is applied on body around main gear
  const white = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.15, clearcoat: 0.6, map: fuselageTexture() });
  white.map.flipY = false;
  const plain = new THREE.MeshPhysicalMaterial({ color: '#f2f4f6', roughness: 0.35, metalness: 0.2, clearcoat: 0.4 });
  const grey = mat('#b9bec4', 0.45, 0.4);
  const blue = new THREE.MeshPhysicalMaterial({ color: BLUE, roughness: 0.3, metalness: 0.3, clearcoat: 0.8 });
  const R = 1.98, LEN = 37.6, CY = 3.45; // fuselage centre height above ground (gear down)
  // fuselage profile: [radius, distance-from-nose]
  const pts = [];
  const N = 90;
  for (let i = 0; i <= N; i++) {
    const d = (i / N) * LEN; let r;
    if (d < 5.2) { const t = d / 5.2; r = R * Math.sqrt(1 - Math.pow(1 - t, 2.2)); }
    else if (d < 27.5) r = R;
    else { const t = (d - 27.5) / (LEN - 27.5); r = R * (1 - Math.pow(t, 1.3) * 0.88); }
    pts.push([Math.max(0.0001, r), d]);
  }
  const fus = lathe(pts, 64, white); fus.geometry.rotateZ(Math.PI / 2); // lathe Y(nose→tail) → −X
  fus.geometry.translate(0, 0, 0);
  const fusHolder = new THREE.Group(); fusHolder.position.set(LEN * 0.5 + 0.5, CY, 0); body.add(fusHolder); fusHolder.add(fus);
  // nose at x = +19.3, tail at x ≈ −18.3; tail cone sweep up
  fus.scale.set(1, 1, 1);
  // tail upsweep: slightly raise rear by a wedge
  
  // wings (both sides): root at fuselage x≈+2, chord 6, tip chord 1.6, span 16.5, sweep 7
  const wm = new THREE.MeshPhysicalMaterial({ color: '#e9ecef', roughness: 0.4, metalness: 0.25 });
  const wg = wingGeo(6.2, 1.6, 15.8, 7.2, 0.35, 5);
  for (const s of [1, -1]) {
    const w = mesh(wg, wm); w.position.set(2.6, CY - 1.2, s * 0.6); w.scale.z = s; w.rotation.x = s * -0.09; body.add(w);
    // sharklet / winglet (blue)
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(-1.6, 0); sh.lineTo(-1.3, 2.4); sh.lineTo(-0.7, 2.4); sh.closePath();
    const wl = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false }), blue);
    wl.position.set(2.6 - 7.2, CY - 1.2 + 15.8 * 0.09 + 0.2, s * (0.6 + 15.8)); wl.rotation.x = -s * 0.25; body.add(wl);
    // engines (CFM/IAE nacelle, blue)
    const eng = new THREE.Group(); eng.position.set(3.6, CY - 1.95, s * 5.75); body.add(eng);
    const nac = lathe([[0.9, 0], [1.05, 0.3], [1.08, 1.4], [1.0, 3.2], [0.72, 4.2], [0.45, 4.8]], 32, blue, 0); nac.geometry.rotateZ(Math.PI / 2); nac.position.x = 2.2; eng.add(nac);
    const lip = mesh(new THREE.TorusGeometry(0.93, 0.12, 10, 32), mat('#cfd3d8', 0.25, 0.9)); lip.rotation.y = Math.PI / 2; lip.position.x = 2.2; eng.add(lip);
    const fan = mesh(new THREE.CircleGeometry(0.9, 32), mat('#1a1c1f', 0.4, 0.7)); fan.rotation.y = Math.PI / 2; fan.position.x = 1.95; eng.add(fan);
    const spinner = mesh(new THREE.ConeGeometry(0.25, 0.6, 16), mat('#2a2d31', 0.3, 0.8)); spinner.rotation.z = -Math.PI / 2; spinner.position.x = 2.2; eng.add(spinner);
    const pylon = box(3.2, 1.0, 0.3, wm, 0.4, 0.95, 0); eng.add(pylon);
    const noz = mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.9, 20), mat('#6c7076', 0.4, 0.8)); noz.rotation.z = Math.PI / 2; noz.position.x = -2.9; eng.add(noz);
    A.userData['fan' + s] = fan;
    // horizontal stabiliser
    const hs = mesh(wingGeo(3.4, 1.3, 6.1, 3.0, 0.22, 4), wm); hs.position.set(-13.6, CY + 1.0, s * 0.3); hs.scale.z = s; hs.rotation.x = s * -0.08; body.add(hs);
  }
  // vertical stabiliser (blue tail with crescent pattern + white "airblue")
  const tailTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = BLUE; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2e5ac0'; g.lineWidth = 6; for (let i = 0; i < 26; i++) { const x = (i * 97) % w, y = (i * 173) % h; g.beginPath(); g.arc(x, y, 18, 0.4, Math.PI * 1.4); g.stroke(); }
  });
  const vs = new THREE.Shape(); vs.moveTo(0, 0); vs.lineTo(-6.0, 0); vs.lineTo(-8.6, 6.4); vs.lineTo(-6.6, 6.6); vs.closePath();
  const vg = new THREE.ExtrudeGeometry(vs, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
  vg.computeBoundingBox(); const bb = vg.boundingBox; const uv = vg.attributes.uv; const p = vg.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  const vsm = mesh(vg, new THREE.MeshPhysicalMaterial({ map: tailTex, roughness: 0.35, clearcoat: 0.7 })); vsm.position.set(-9.8, CY + 1.4, -0.17); body.add(vsm);
  // landing gear (nose + 2 main), retractable
  const gear = new THREE.Group(); body.add(gear);
  const strutM = mat('#c8ccd0', 0.3, 0.8); const tyreM = mat('#151515', 0.9);
  const mainWheels = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(0, 0, s * 3.8); gear.add(g);
    g.add(box(0.25, 2.2, 0.25, strutM, 0, 1.9, 0));
    for (const dz of [-0.35, 0.35]) { const w = mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.38, 20), tyreM); w.rotation.x = Math.PI / 2; w.position.set(0, 0.58, dz); g.add(w); mainWheels.push(w); }
  }
  const ng = new THREE.Group(); ng.position.set(12.7, 0, 0); gear.add(ng);
  ng.add(box(0.18, 2.3, 0.18, strutM, 0, 1.9, 0));
  for (const dz of [-0.2, 0.2]) { const w = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 16), tyreM); w.rotation.x = Math.PI / 2; w.position.set(0, 0.38, dz); ng.add(w); mainWheels.push(w); }
  // belly fairing + doors
  const belly = mesh(new THREE.SphereGeometry(1, 24, 12), plain); belly.scale.set(6.5, 1.0, 2.1); belly.position.set(1.0, CY - 1.55, 0); body.add(belly);
  // nav / beacon lights
  const red = new THREE.MeshBasicMaterial({ color: '#ff2a1a' }), green = new THREE.MeshBasicMaterial({ color: '#21ff5a' });
  const nl = mesh(new THREE.SphereGeometry(0.12, 8, 6), red); nl.position.set(2.6 - 7.2 - 0.8, CY - 1.2 + 1.5, -(0.6 + 15.8)); body.add(nl);
  const nr = mesh(new THREE.SphereGeometry(0.12, 8, 6), green); nr.position.set(2.6 - 7.2 - 0.8, CY - 1.2 + 1.5, (0.6 + 15.8)); body.add(nr);
  const beacon = mesh(new THREE.SphereGeometry(0.16, 8, 6), red); beacon.position.set(2, CY + R + 0.05, 0); body.add(beacon);
  A.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const AC = {
    group: A, body, gear, CY,
    pitch(rad) { body.rotation.z = rad; }, // nose-up positive (rotation about Z with nose +X)
    roll(rad) { body.rotation.x = rad; },
    rollWheels(d) { for (const w of mainWheels) w.rotation.y = 0; for (const w of mainWheels) w.rotation.z = 0; mainWheels.forEach(w => { w.rotation.set(Math.PI / 2, -d / 0.58, 0); }); },
    gearDown(f) { gear.scale.y = Math.max(0.02, f); gear.visible = f > 0.03; },
    spin(t) { for (const k of ['fan1', 'fan-1']) if (A.userData[k]) A.userData[k].rotation.x = t * 40; beacon.visible = (t % 1.2) < 0.15; }
  };
  return AC;
}
