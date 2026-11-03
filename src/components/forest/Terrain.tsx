'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { PATH_SAMPLES, terrainHeight } from '@/lib/world';
import { trailTexture } from '@/lib/textures';

const dummy = new THREE.Object3D();

export function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(220, 390, 96, 156);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -60);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    const moss = new THREE.Color('#5b7040');
    const grass = new THREE.Color('#71854a');
    const dark = new THREE.Color('#41522e');
    const soil = new THREE.Color('#6b5c42');

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = terrainHeight(x, z);
      pos.setY(i, y);

      const noise =
        0.5 +
        0.28 * Math.sin(x * 0.21 + z * 0.13) +
        0.22 * Math.cos(x * 0.09 - z * 0.17);
      const c = moss.clone().lerp(grass, Math.min(1, Math.max(0, noise)));
      const shade = Math.min(1, Math.max(0, (y + 1.4) / 3.2));
      c.lerp(dark, (1 - shade) * 0.45);

      const distancePath = distanceToTrail(x, z);
      if (distancePath < 4.2) {
        c.lerp(soil, 0.28 * (1 - distancePath / 4.2));
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}

let trailCache: { x: number; z: number }[] | null = null;
function trailPoints() {
  if (!trailCache) trailCache = PATH_SAMPLES.map((s) => ({ x: s.x, z: s.z }));
  return trailCache;
}
function distanceToTrail(x: number, z: number) {
  const points = trailPoints();
  let best = Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const dx = points[i].x - x;
    const dz = points[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function Trail() {
  const { geometry, texture } = useMemo(() => {
    const samples = PATH_SAMPLES;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let distance = 0;

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const prev = samples[Math.max(0, i - 1)];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      const len = Math.hypot(tx, tz) || 1;
      tx /= len;
      tz /= len;
      const nx = -tz;
      const nz = tx;

      if (i > 0) {
        distance += Math.hypot(s.x - prev.x, s.z - prev.z);
      }
      const width =
        1.42 +
        Math.sin(i * 0.41) * 0.16 +
        Math.sin(i * 0.13 + 2) * 0.12;

      const lx = s.x + nx * width;
      const lz = s.z + nz * width;
      const rx = s.x - nx * width;
      const rz = s.z - nz * width;

      positions.push(lx, terrainHeight(lx, lz) + 0.035, lz);
      positions.push(rx, terrainHeight(rx, rz) + 0.035, rz);
      uvs.push(0, distance / 3.2);
      uvs.push(1, distance / 3.2);

      if (i > 0) {
        const a = (i - 1) * 2;
        const b = a + 1;
        const c = i * 2;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const tex = trailTexture();
    tex.repeat.set(1, 1);
    dummy.position.set(0, 0, 0);
    dummy.updateMatrix();
    return { geometry: geo, texture: tex };
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        map={texture}
        roughness={1}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}
