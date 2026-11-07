import * as THREE from 'three';
import { mat, mesh, box, rbox, canvasTex } from './util.js';

// Compact black vlog camera (lens +Z ki taraf). Origin = body center.
export function createVlogCam() {
  const g = new THREE.Group(); g.name = 'vlogCam';
  const body = rbox(0.105, 0.06, 0.042, 0.008, mat('#141414', 0.45, 0.2)); g.add(body);
  const grip = rbox(0.022, 0.056, 0.05, 0.008, mat('#0b0b0b', 0.9)); grip.position.set(0.042, 0, 0.006); g.add(grip);
  const lensBarrel = mesh(new THREE.CylinderGeometry(0.019, 0.022, 0.03, 24), mat('#1d1d1d', 0.4, 0.4)); lensBarrel.rotation.x = Math.PI / 2; lensBarrel.position.set(-0.012, 0, 0.034); g.add(lensBarrel);
  const glass = mesh(new THREE.CircleGeometry(0.0145, 24), new THREE.MeshPhysicalMaterial({ color: '#0a1830', roughness: 0.05, metalness: 0.2, clearcoat: 1 })); glass.position.set(-0.012, 0, 0.0496); g.add(glass);
  const ring = mesh(new THREE.TorusGeometry(0.0175, 0.0025, 8, 24), mat('#5a5a5a', 0.3, 0.9)); ring.position.set(-0.012, 0, 0.049); g.add(ring);
  const screen = box(0.07, 0.045, 0.004, mat('#05070a', 0.15, 0.1), -0.008, 0, -0.023); g.add(screen);
  const mic = rbox(0.03, 0.014, 0.024, 0.005, mat('#2a2a2a', 0.95)); mic.position.set(-0.01, 0.038, 0.004); g.add(mic);
  const rec = mesh(new THREE.SphereGeometry(0.0025, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a2a' })); rec.position.set(0.03, 0.022, 0.0215); g.add(rec);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Rolling suitcase — origin ground par (wheels BOTTOM), handle TOP. Handle top height = handleH.
export function createSuitcase(color = '#2f4f6f') {
  const g = new THREE.Group(); g.name = 'suitcase';
  const W = 0.38, H = 0.56, D = 0.24, wheel = 0.05;
  const shell = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const body = rbox(W, H, D, 0.04, shell); body.position.y = wheel + H / 2; g.add(body);
  for (let i = -1; i <= 1; i += 2) { const rib = rbox(0.02, H * 0.92, D + 0.008, 0.008, shell); rib.position.set(i * 0.1, wheel + H / 2, 0); g.add(rib); }
  const zip = box(W + 0.004, 0.012, 0.012, mat('#111', 0.8), 0, wheel + H / 2, 0); zip.scale.z = 1; zip.rotation.y = 0; g.add(zip);
  const zipS = box(0.006, H - 0.04, D + 0.01, mat('#111', 0.8), W / 2, wheel + H / 2, 0); g.add(zipS);
  const wm = mat('#111', 0.7);
  for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) for (const z of [-D / 2 + 0.035, D / 2 - 0.035]) {
    const w = mesh(new THREE.CylinderGeometry(wheel / 2, wheel / 2, 0.02, 12), wm); w.rotation.z = Math.PI / 2; w.position.set(x, wheel / 2, z); g.add(w);
  }
  // telescopic handle (back side −Z)
  const handle = new THREE.Group(); handle.position.set(0, wheel + H, -D / 2 + 0.03); g.add(handle);
  const am = mat('#9aa0a6', 0.3, 0.9);
  for (const x of [-0.08, 0.08]) { const r = box(0.014, 0.3, 0.014, am, x, -0.15, 0); handle.add(r); }
  const grip = rbox(0.2, 0.03, 0.03, 0.012, mat('#1a1a1a', 0.8)); grip.position.y = 0.01; handle.add(grip);
  const topH = rbox(0.12, 0.025, 0.03, 0.01, mat('#1a1a1a', 0.8)); topH.position.set(0, wheel + H + 0.012, 0.03); g.add(topH);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const S = { group: g, handle, ext: 1, wheel, H, D, W,
    setExtend(e) { this.ext = e; handle.position.y = wheel + H + e * 0.24; },
    gripLocal() { return new THREE.Vector3(0, handle.position.y + 0.01, handle.position.z); }
  };
  S.setExtend(1);
  return S;
}

export function createBoardingPass() {
  const t = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#f7f9fc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0b3d91'; g.fillRect(0, 0, w, 30);
    g.fillStyle = '#fff'; g.font = 'bold 18px DejaVu Sans'; g.fillText('BOARDING PASS', 10, 22);
    g.fillStyle = '#0b3d91'; g.font = 'bold 30px DejaVu Sans'; g.fillText('KHI', 14, 75); g.fillText('ISB', 160, 75);
    g.fillStyle = '#333'; g.font = '13px DejaVu Sans'; g.fillText('Karachi', 14, 95); g.fillText('Islamabad', 160, 95);
    g.fillText('→', 115, 70);
    g.fillStyle = '#999'; g.fillRect(205, 30, 2, 98);
  });
  // do-tarfa: dono sides se text seedha parha jata hai (mirror nahi)
  const m = new THREE.Group();
  const mt = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  const a = mesh(new THREE.PlaneGeometry(0.2, 0.08), mt); m.add(a);
  const b = mesh(new THREE.PlaneGeometry(0.2, 0.08), mt); b.rotation.y = Math.PI; m.add(b);
  return m;
}
