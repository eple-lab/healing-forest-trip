'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  CLEARING,
  CLEARING_BENCHES,
  CLEARING_PROPS,
  terrainHeight,
  mulberry32,
} from '@/lib/world';
import { glowTexture, mossTexture } from '@/lib/textures';
import { Fire } from './Fire';
import { useClock } from '@/store/game';
import { currentKoreaClock, sunState } from '@/lib/time';

function GroundDisc({ radius, color, yOffset = 0.02, opacity = 1 }: { radius: number; color: string; yOffset?: number; opacity?: number }) {
  const geometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(radius, 80);
    geo.rotateX(-Math.PI / 2);
    geo.translate(CLEARING.x, 0, CLEARING.z);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z) + yOffset);
    }
    geo.computeVertexNormals();
    return geo;
  }, [radius, yOffset]);

  const moss = useMemo(() => {
    const texture = mossTexture();
    texture.repeat.set(5, 5);
    return texture;
  }, []);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        map={moss}
        color={color}
        roughness={1}
        transparent={opacity < 1}
        opacity={opacity}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

function StoneRing() {
  const stones = useMemo(() => {
    const rnd = mulberry32(123);
    return Array.from({ length: 15 }, (_, i) => {
      const a = (i / 15) * Math.PI * 2;
      return {
        x: CLEARING_PROPS.firePit.x + Math.cos(a) * 1.55,
        z: CLEARING_PROPS.firePit.z + Math.sin(a) * 1.55,
        rot: rnd() * Math.PI,
        scale: 0.26 + rnd() * 0.15,
      };
    });
  }, []);
  return (
    <group>
      {stones.map((stone, i) => (
        <mesh
          key={i}
          position={[stone.x, terrainHeight(stone.x, stone.z) + stone.scale * 0.4, stone.z]}
          rotation={[0.3 * (i % 3), stone.rot, 0.2]}
          scale={[stone.scale, stone.scale * 0.72, stone.scale]}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={i % 3 === 0 ? '#777267' : '#66645c'} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Bench({ x, z, angle }: { x: number; z: number; angle: number }) {
  const y = terrainHeight(x, z);
  return (
    <group position={[x, y, z]} rotation-y={-angle - Math.PI / 2}>
      <mesh position={[0, 0.46, 0]} rotation-z={Math.PI / 2} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.22, 2.7, 9]} />
        <meshStandardMaterial color="#5b432e" roughness={1} />
      </mesh>
      <mesh position={[0, 0.63, 0]} rotation-z={Math.PI / 2} scale={[1, 0.35, 1]}>
        <cylinderGeometry args={[0.23, 0.23, 2.4, 8]} />
        <meshStandardMaterial color="#52673a" roughness={1} />
      </mesh>
      {[-0.95, 0.95].map((offset) => (
        <mesh key={offset} position={[offset, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.17, 0.45, 7]} />
          <meshStandardMaterial color="#4a3525" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

const POST_ANGLES = [0.35, 1.4, 2.6, 3.8, 5.0];

function Lanterns() {
  const glow = useMemo(() => glowTexture(), []);
  const rnd = useMemo(() => mulberry32(31), []);
  const posts = useMemo(
    () =>
      POST_ANGLES.map((a) => {
        const radius = 13.2;
        const x = CLEARING.x + Math.cos(a) * radius;
        const z = CLEARING.z + Math.sin(a) * radius;
        return { x, z, y: terrainHeight(x, z) };
      }),
    [],
  );

  const wire = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < posts.length; i++) {
      const a = posts[i];
      const b = posts[(i + 1) % posts.length];
      const steps = 14;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const sag = Math.sin(t * Math.PI) * 0.55;
        points.push(
          new THREE.Vector3(
            a.x + (b.x - a.x) * t,
            a.y + 2.75 - sag,
            a.z + (b.z - a.z) * t,
          ),
        );
      }
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: '#6a5540',
      transparent: true,
      opacity: 0.7,
    });
    return new THREE.Line(geometry, material);
  }, [posts]);

  const bulbs = useMemo(() => {
    const positions: number[] = [];
    for (let i = 0; i < posts.length; i++) {
      const a = posts[i];
      const b = posts[(i + 1) % posts.length];
      for (let s = 2; s < 12; s += 2) {
        const t = s / 14;
        const sag = Math.sin(t * Math.PI) * 0.55;
        positions.push(
          a.x + (b.x - a.x) * t,
          a.y + 2.66 - sag,
          a.z + (b.z - a.z) * t,
        );
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, [posts]);

  return (
    <group>
      <primitive object={wire} />
      <points geometry={bulbs} frustumCulled={false}>
        <pointsMaterial
          map={glow}
          color="#ffcf94"
          size={0.3}
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          sizeAttenuation
        />
      </points>

      {posts.map((post, i) => (
        <group key={i} position={[post.x, post.y, post.z]}>
          <mesh position={[0, 1.45, 0]} castShadow>
            <cylinderGeometry args={[0.075, 0.11, 2.9, 7]} />
            <meshStandardMaterial color="#4b3726" roughness={1} />
          </mesh>
          <mesh position={[0, 2.62, 0]}>
            <sphereGeometry args={[0.2, 10, 8]} />
            <meshStandardMaterial
              color="#ffce8a"
              emissive="#ff9f4a"
              emissiveIntensity={1.5}
              roughness={0.6}
            />
          </mesh>
          <sprite position={[0, 2.62, 0]} scale={[2.4, 2.4, 1]}>
            <spriteMaterial
              map={glow}
              color="#ffb466"
              transparent
              opacity={0.55}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
          {i % 4 === 0 && (
            <pointLight
              color="#ffb066"
              intensity={2.2}
              distance={9}
              decay={2}
              position={[0, 2.55, 0]}
            />
          )}
          <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2} receiveShadow>
            <circleGeometry args={[0.45, 10]} />
            <meshStandardMaterial color="#3d3a2f" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ClearingFire() {
  const ground = terrainHeight(CLEARING_PROPS.firePit.x, CLEARING_PROPS.firePit.z);
  return (
    <Fire
      position={[CLEARING_PROPS.firePit.x, ground + 0.12, CLEARING_PROPS.firePit.z]}
      intensity={0.62}
      scale={1.25}
      lightDistance={16}
    />
  );
}

export function Clearing() {
  return (
    <group>
      <GroundDisc radius={CLEARING.radius} color="#8e9c68" yOffset={0.018} opacity={0.95} />
      <GroundDisc radius={4.6} color="#9a8a68" yOffset={0.03} />
      <StoneRing />
      <ClearingFire />
      {CLEARING_BENCHES.map((bench, i) => (
        <Bench key={i} x={bench.x} z={bench.z} angle={bench.angle} />
      ))}
      <Lanterns />
      <ClearingGrass />
      <ClearingButterflies />
    </group>
  );
}

function ClearingGrass() {
  const items = useMemo(() => {
    const rnd = mulberry32(781);
    return Array.from({ length: 170 }, () => {
      const a = rnd() * Math.PI * 2;
      const r = 5 + rnd() * (CLEARING.radius - 6);
      const x = CLEARING.x + Math.cos(a) * r;
      const z = CLEARING.z + Math.sin(a) * r;
      return { x, z, s: 0.5 + rnd() * 0.8, rot: rnd() * Math.PI, tint: rnd() };
    });
  }, []);
  return (
    <group>
      {items.map((item, i) => (
        <mesh
          key={i}
          position={[item.x, terrainHeight(item.x, item.z) + 0.16 * item.s, item.z]}
          rotation-y={item.rot}
          scale={[item.s, item.s, item.s]}
        >
          <coneGeometry args={[0.13, 0.5, 4]} />
          <meshStandardMaterial
            color={item.tint > 0.7 ? '#8d8a55' : '#6d7d44'}
            roughness={1}
            flatShading
          />
        </mesh>
      ))}
    </group>
  );
}

function ClearingButterflies() {
  const group = useRef<THREE.Group>(null);
  const wings = useRef<(THREE.Mesh | null)[]>([]);
  const rnd = useMemo(() => mulberry32(414), []);
  const flies = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        radius: 3 + rnd() * 7,
        speed: 0.12 + rnd() * 0.16,
        phase: rnd() * Math.PI * 2,
        height: 0.8 + rnd() * 1.5,
        color: i % 2 === 0 ? '#f4ecd8' : '#e8c078',
      })),
    [rnd],
  );

  useFrame((state) => {
    if (!group.current) return;
    const night = sunState(currentKoreaClock(useClock.getState().now || Date.now())).night;
    group.current.visible = night < 0.6;
    if (!group.current.visible) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((child, index) => {
      const fly = flies[index];
      if (!fly) return;
      const angle = t * fly.speed + fly.phase;
      child.position.set(
        CLEARING.x + Math.cos(angle) * fly.radius,
        terrainHeight(CLEARING.x, CLEARING.z) + fly.height + Math.sin(t * 2.1 + fly.phase) * 0.22,
        CLEARING.z + Math.sin(angle) * fly.radius,
      );
      child.rotation.y = -angle;
      const wing = wings.current[index];
      if (wing) wing.rotation.z = Math.sin(t * 14 + fly.phase) * 0.7;
    });
  });

  return (
    <group ref={group}>
      {flies.map((fly, i) => (
        <group key={i}>
          <mesh ref={(el) => { wings.current[i] = el; }} position={[0, 0, 0]}>
            <planeGeometry args={[0.22, 0.16]} />
            <meshBasicMaterial color={fly.color} side={THREE.DoubleSide} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, 0, 0]} rotation-x={Math.PI / 2}>
            <planeGeometry args={[0.04, 0.12]} />
            <meshBasicMaterial color="#4a3a28" side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
