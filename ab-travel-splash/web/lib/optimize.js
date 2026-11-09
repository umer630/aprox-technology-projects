// Render speed-up: static (na hilne wali) geometry ko material + 120 m grid cell ke hisaab se merge karo.
// Hazaron draw calls → chand sau. Jo cheezein ctx mein hain (characters, gaariyan, darwaze…) unhein nahi chheda jata,
// siwaye un ke jin par userData.static = true ho.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function collectDynamic(v, out, depth = 0, seen = new Set()) {
  if (!v || typeof v !== 'object' || seen.has(v) || depth > 4) return; seen.add(v);
  if (v.isObject3D) { if (!v.userData.static) out.add(v); return; }
  if (Array.isArray(v)) { for (const x of v) collectDynamic(x, out, depth + 1, seen); return; }
  if (v.isMaterial || v.isTexture || v.isBufferGeometry) return;
  for (const k of Object.keys(v)) collectDynamic(v[k], out, depth + 1, seen);
}

function sliceGroup(geo, start, count) {
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name];
    g.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize, a.normalized));
  }
  return g;
}

export function freezeStatic(scene, ctx, cell = 120) {
  const dyn = new Set(); collectDynamic(ctx, dyn);
  scene.updateMatrixWorld(true);
  const isDyn = (o) => { for (let p = o; p; p = p.parent) if (dyn.has(p)) return true; return false; };
  const buckets = new Map(); const remove = [];
  scene.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || isDyn(o)) return;
    if (o.material && o.material.isShaderMaterial) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) geo.deleteAttribute(n);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.applyMatrix4(o.matrixWorld);
    const wp = new THREE.Vector3(); o.getWorldPosition(wp);
    const cellKey = Math.floor(wp.x / cell) + ',' + Math.floor(wp.z / cell);
    const parts = Array.isArray(o.material)
      ? (geo.groups.length ? geo.groups : [{ start: 0, count: geo.attributes.position.count, materialIndex: 0 }]).map(gr => [sliceGroup(geo, gr.start, gr.count), o.material[gr.materialIndex]])
      : [[geo, o.material]];
    for (const [g, m] of parts) {
      if (!m) continue;
      const key = m.uuid + '|' + Object.keys(g.attributes).sort().join(',') + '|' + o.castShadow + o.receiveShadow + '|' + cellKey;
      if (!buckets.has(key)) buckets.set(key, { m, list: [], cast: o.castShadow, recv: o.receiveShadow });
      g.groups = []; buckets.get(key).list.push(g);
    }
    remove.push(o);
  });
  for (const o of remove) o.parent && o.parent.remove(o);
  let n = 0;
  for (const { m, list, cast, recv } of buckets.values()) {
    const merged = mergeGeometries(list, false); if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m); mesh.castShadow = cast; mesh.receiveShadow = recv; mesh.matrixAutoUpdate = false; scene.add(mesh); n++;
  }
  return { removed: remove.length, merged: n };
}

// Ek group ke andar rigid meshes ko (group ke local space mein) material ke hisaab se merge karo.
// keep: jin objects (aur un ke bachon) ko alag rehna hai — wheels, darwaze, hood, waghera.
export function mergeChildren(group, keep = []) {
  const keepSet = new Set(keep);
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(); const remove = [];
  group.traverse(o => {
    if (o === group || !o.isMesh || o.isInstancedMesh) return;
    for (let p = o; p && p !== group; p = p.parent) if (keepSet.has(p)) return;
    if (Array.isArray(o.material)) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); geo.groups = [];
    const key = o.material.uuid + '|' + o.castShadow;
    if (!buckets.has(key)) buckets.set(key, { m: o.material, list: [], cast: o.castShadow });
    buckets.get(key).list.push(geo); remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const { m, list, cast } of buckets.values()) { const g = mergeGeometries(list, false); if (!g) continue; const me = new THREE.Mesh(g, m); me.castShadow = cast; me.receiveShadow = true; group.add(me); }
  return group;
}

// Sirf direct bachon (meshes) ko merge karo — character joints ke liye (har joint rigid hai)
export function mergeDirect(group, skip = new Set()) {
  const kids = group.children.filter(o => o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material) && !skip.has(o) && o.position && true);
  if (kids.length < 2) return;
  const buckets = new Map();
  for (const o of kids) {
    o.updateMatrix();
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.applyMatrix4(o.matrix); geo.groups = [];
    const key = o.material.uuid + '|' + o.castShadow;
    if (!buckets.has(key)) buckets.set(key, { m: o.material, list: [], cast: o.castShadow });
    buckets.get(key).list.push(geo); group.remove(o);
  }
  for (const { m, list, cast } of buckets.values()) { const g = mergeGeometries(list, false); if (!g) continue; const me = new THREE.Mesh(g, m); me.castShadow = cast; me.receiveShadow = true; group.add(me); }
}
