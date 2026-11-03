'use client';

/** 밤에만 나타나는 반딧불 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CLEARING, PATH_SAMPLES, mulberry32, terrainHeight } from '@/lib/world';
import { glowTexture } from '@/lib/textures';
import { useClock } from '@/store/game';
import { currentKoreaClock, sunState } from '@/lib/time';

type Fly = {
  x: number;
  z: number;
  baseY: number;
  phase: number;
  speed: number;
  radius: number;
  size: number;
};

export function Fireflies() {
  const points = useRef<THREE.Points>(null);
  const glow = useMemo(() => glowTexture(), []);
  const data = useMemo<Fly[]>(() => {
    const rnd = mulberry32(5150);
    const flies: Fly[] = [];
    // 빈터 주변
    for (let i = 0; i < 70; i++) {
      const angle = rnd() * Math.PI * 2;
      const radius = 3 + rnd() * (CLEARING.radius + 8);
      const x = CLEARING.x + Math.cos(angle) * radius;
      const z = CLEARING.z + Math.sin(angle) * radius;
      flies.push({
        x,
        z,
        baseY: terrainHeight(x, z) + 0.5 + rnd() * 2.2,
        phase: rnd() * Math.PI * 2,
        speed: 0.4 + rnd() * 1.1,
        radius: 0.3 + rnd() * 0.8,
        size: 0.5 + rnd() * 0.9,
      });
    }
    // 산길과 오두막 주변
    for (let i = 0; i < 50; i++) {
      const sample = PATH_SAMPLES[Math.floor(rnd() * PATH_SAMPLES.length)];
      const x = sample.x + (rnd() * 2 - 1) * 4;
      const z = sample.z + (rnd() * 2 - 1) * 4;
      flies.push({
        x,
        z,
        baseY: terrainHeight(x, z) + 0.5 + rnd() * 2.4,
        phase: rnd() * Math.PI * 2,
        speed: 0.3 + rnd() * 0.9,
        radius: 0.25 + rnd() * 0.7,
        size: 0.4 + rnd() * 0.8,
      });
    }
    return flies;
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(data.length * 3), 3),
    );
    return geo;
  }, [data.length]);

  const lastUpdate = useRef(0);

  useFrame((state) => {
    const night = sunState(currentKoreaClock(useClock.getState().now || Date.now())).night;
    const group = points.current;
    if (!group) return;
    const material = group.material as THREE.PointsMaterial;
    const visible = night > 0.18;
    group.visible = visible;
    if (!visible) return;
    material.opacity = Math.min(0.95, (night - 0.15) * 1.4);
    // 20fps 로 충분하다. frustumCulled=false 이므로 bounding sphere 도 계산하지 않는다.
    const t = state.clock.elapsedTime;
    if (t - lastUpdate.current < 0.05) return;
    lastUpdate.current = t;
    const attr = group.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < data.length; i++) {
      const fly = data[i];
      const flicker = 0.5 + 0.5 * Math.sin(t * fly.speed * 2.2 + fly.phase);
      attr.setX(i, fly.x + Math.sin(t * fly.speed + fly.phase) * fly.radius);
      attr.setY(
        i,
        fly.baseY +
          Math.sin(t * fly.speed * 0.8 + fly.phase * 1.7) * 0.45 +
          flicker * 0.08,
      );
      attr.setZ(i, fly.z + Math.cos(t * fly.speed * 0.9 + fly.phase) * fly.radius);
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        map={glow}
        color="#d8f59a"
        size={0.23}
        sizeAttenuation
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}
