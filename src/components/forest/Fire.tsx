'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glowTexture } from '@/lib/textures';
import { mulberry32 } from '@/lib/world';

type FireProps = {
  position: [number, number, number];
  intensity: number;
  scale?: number;
  lightDistance?: number;
};

const FLAME_LAYOUT = [
  { x: 0, z: 0, size: 1.0, speed: 1.7 },
  { x: 0.13, z: 0.06, size: 0.7, speed: 2.3 },
  { x: -0.12, z: 0.08, size: 0.66, speed: 2.9 },
  { x: 0.04, z: -0.12, size: 0.55, speed: 3.4 },
  { x: -0.05, z: -0.04, size: 0.85, speed: 1.9 },
];

export function Fire({ position, intensity, scale = 1, lightDistance = 12 }: FireProps) {
  const flames = useRef<(THREE.Mesh | null)[]>([]);
  const light = useRef<THREE.PointLight>(null);
  const embers = useRef<THREE.Points>(null);
  const glow = useMemo(() => glowTexture(), []);
  const emberData = useMemo(() => {
    const rnd = mulberry32(88);
    return Array.from({ length: 34 }, () => ({
      x: (rnd() - 0.5) * 0.55,
      y: rnd() * 0.7,
      z: (rnd() - 0.5) * 0.55,
      speed: 0.25 + rnd() * 0.55,
      phase: rnd() * Math.PI * 2,
    }));
  }, []);
  const emberGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(emberData.length * 3), 3),
    );
    return geometry;
  }, [emberData.length]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const clamped = Math.max(0, Math.min(1, intensity));
    for (let i = 0; i < FLAME_LAYOUT.length; i++) {
      const mesh = flames.current[i];
      if (!mesh) continue;
      const layout = FLAME_LAYOUT[i];
      const flicker = 0.82 + Math.sin(t * layout.speed + i * 2.1) * 0.14 + Math.sin(t * 7.3 + i) * 0.05;
      const height = (0.65 + clamped * 1.15) * layout.size * flicker * scale;
      mesh.scale.set(scale * layout.size * 0.62, height, scale * layout.size * 0.62);
      mesh.position.x = (layout.x + Math.sin(t * 1.4 + i) * 0.025) * scale;
      mesh.position.z = (layout.z + Math.cos(t * 1.2 + i * 1.7) * 0.025) * scale;
      mesh.rotation.y = t * 0.6 + i;
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = clamped * (0.5 + flicker * 0.4);
      mesh.visible = clamped > 0.015;
    }
    if (light.current) {
      const flicker = 0.8 + Math.sin(t * 9.7) * 0.1 + Math.sin(t * 3.1) * 0.08;
      light.current.intensity = (2.2 + clamped * 8) * flicker * scale;
      light.current.visible = clamped > 0.01;
    }
    const points = embers.current;
    if (points) {
      const attr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < emberData.length; i++) {
        const data = emberData[i];
        const life = (t * data.speed + data.phase) % 1;
        attr.setX(i, (data.x + Math.sin(t * 1.3 + data.phase) * 0.08) * scale);
        attr.setY(i, (data.y + life * 1.5) * scale);
        attr.setZ(i, (data.z + Math.cos(t * 1.1 + data.phase) * 0.08) * scale);
      }
      attr.needsUpdate = true;
      (points.material as THREE.PointsMaterial).opacity = clamped * 0.9;
      points.visible = clamped > 0.02;
    }
  });

  return (
    <group position={position}>
      {/* 장작 */}
      <group>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            position={[0, 0.16, 0]}
            rotation={[0, (i / 3) * Math.PI * 2, Math.PI / 2.5]}
            castShadow
          >
            <cylinderGeometry args={[0.06, 0.08, 0.8, 6]} />
            <meshStandardMaterial color="#3f2a1c" roughness={1} />
          </mesh>
        ))}
        <mesh position={[0, 0.08, 0]} rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[0.42, 16]} />
          <meshStandardMaterial color="#2c2119" roughness={1} />
        </mesh>
      </group>

      {FLAME_LAYOUT.map((layout, i) => (
        <mesh
          key={i}
          ref={(el) => {
            flames.current[i] = el;
          }}
          position={[layout.x * scale, 0.25 * scale, layout.z * scale]}
        >
          <coneGeometry args={[0.22, 0.9, 7]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? '#ffb054' : '#ff7a2f'}
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}

      <points ref={embers} geometry={emberGeometry} frustumCulled={false}>
        <pointsMaterial
          map={glow}
          color="#ffae5c"
          size={0.13}
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
          toneMapped={false}
        />
      </points>

      <pointLight
        ref={light}
        color="#ff9a4d"
        intensity={4}
        distance={lightDistance}
        decay={2.1}
        position={[0, 0.7, 0]}
      />
    </group>
  );
}
