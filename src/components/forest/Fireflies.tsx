'use client';

/** 밤에만 나타나는 반딧불 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CABIN, CLEARING, PATH_SAMPLES, mulberry32, terrainHeight } from '@/lib/world';
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
    // [FEAT-13] 오두막 둘레(반지름 6~25m)에 반딧불이 60마리를 더한다.
    // 난수는 기존 두 묶음 뒤에 이어 쓰므로 빈터·산길 반딧불이 자리는 그대로다.
    for (let i = 0; i < 60; i++) {
      let x = CABIN.x;
      let z = CABIN.z;
      // [FEAT-13] 오두막 상자 안(로컬 |x|, |z| < 5.5)에 뽑히면 다시 뽑는다.
      for (let attempt = 0; attempt < 16; attempt++) {
        const angle = rnd() * Math.PI * 2;
        const radius = 6 + rnd() * 19;
        x = CABIN.x + Math.cos(angle) * radius;
        z = CABIN.z + Math.sin(angle) * radius;
        if (Math.abs(x - CABIN.x) >= 5.5 || Math.abs(z - CABIN.z) >= 5.5) break;
      }
      flies.push({
        x,
        z,
        baseY: terrainHeight(x, z) + 0.4 + rnd() * 2.2,
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
    // [BUG-03] 탭을 돌아오면 R3F setFrameloop이 clock.elapsedTime을 0으로 되돌려
    // t가 이전 lastUpdate보다 작아지고, 그 차이만큼 갱신이 멈췄다 → 시계가 되돌아간 경우 기준점을 당긴다.
    if (t < lastUpdate.current) lastUpdate.current = t - 0.05;
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
