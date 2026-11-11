'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { STUMPS, loopSpot, terrainHeight } from '@/lib/world';
import { stumpTexture } from '@/lib/textures';

export function Stumps() {
  const rings = useMemo(() => stumpTexture(), []);
  return (
    <group>
      {STUMPS.map((stump) => {
        const y = terrainHeight(stump.x, stump.z);
        return (
          <group key={stump.id} position={[stump.x, y, stump.z]} rotation-y={stump.facing}>
            <mesh position={[0, stump.h / 2, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.38, 0.47, stump.h, 14]} />
              <meshStandardMaterial color="#5a422f" roughness={1} flatShading />
            </mesh>
            <mesh position={[0, stump.h + 0.006, 0]} rotation-x={-Math.PI / 2} receiveShadow>
              <circleGeometry args={[0.37, 20]} />
              <meshStandardMaterial map={rings} roughness={0.92} />
            </mesh>
            {/* 이끼 */}
            <mesh position={[0.22, stump.h * 0.55, 0.3]} scale={[1, 0.7, 1]}>
              <sphereGeometry args={[0.15, 7, 5]} />
              <meshStandardMaterial color="#4f6536" roughness={1} flatShading />
            </mesh>
            <mesh position={[-0.26, stump.h * 0.32, 0.26]} scale={[0.7, 0.5, 0.7]}>
              <sphereGeometry args={[0.13, 6, 4]} />
              <meshStandardMaterial color="#58703c" roughness={1} flatShading />
            </mesh>
            {/* 뿌리 */}
            <mesh position={[0.3, 0.03, 0.1]} rotation-z={0.4} castShadow>
              <cylinderGeometry args={[0.045, 0.075, 0.5, 5]} />
              <meshStandardMaterial color="#4b3525" roughness={1} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** 길가 장식용 그루터기 (상호작용 없음) */
export function DecorativeStumps() {
  const spots = useMemo(
    () => [
      // 원형 길가 (loopSpot(길을 따라 간 비율, + 안쪽 / - 바깥쪽 거리))
      { ...loopSpot(0.04, -4.8), h: 0.35, rot: 1.2 },
      { ...loopSpot(0.25, 4.9), h: 0.28, rot: 2.2 },
      { ...loopSpot(0.49, -5.2), h: 0.42, rot: 0.6 },
      { ...loopSpot(0.68, 4.4), h: 0.3, rot: 2.8 },
      { ...loopSpot(0.95, -3.2), h: 0.38, rot: 1.8 },
    ],
    [],
  );
  return (
    <group>
      {spots.map((spot, i) => (
        <mesh
          key={i}
          position={[spot.x, terrainHeight(spot.x, spot.z) + spot.h / 2, spot.z]}
          rotation-y={spot.rot}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.3, 0.38, spot.h, 11]} />
          <meshStandardMaterial color="#54402d" roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function TrailSigns() {
  const startSign = useMemo(
    () =>
      signTextureSafe(['숲속여행', '산길 초입'], {
        width: 512,
        height: 280,
        background: '#5a422c',
        color: '#f2e3c8',
        border: '#7d5f3f',
      }),
    [],
  );
  const clearingSign = useMemo(
    () =>
      signTextureSafe(['숲의 빈터', '쉬어가는 곳'], {
        width: 512,
        height: 280,
        background: '#54402b',
        color: '#efe0c4',
        border: '#7a5c3c',
      }),
    [],
  );
  const cabinSign = useMemo(
    () =>
      signTextureSafe(['오두막', '불을 피우고 쉬어가세요'], {
        width: 560,
        height: 280,
        background: '#4f3a27',
        color: '#f3e6cd',
        border: '#755737',
      }),
    [],
  );

  return (
    <group>
      <Sign
        x={2.8}
        z={67}
        rotation={0.08}
        texture={startSign}
        width={1.9}
        height={1.04}
      />
      <Sign
        x={3.1}
        z={-45}
        rotation={-0.15}
        texture={clearingSign}
        width={1.9}
        height={1.04}
      />
      <Sign
        x={3.2}
        z={-143.5}
        rotation={-0.1}
        texture={cabinSign}
        width={2.2}
        height={1.1}
      />
    </group>
  );
}

import { signTexture } from '@/lib/textures';

function signTextureSafe(
  lines: string[],
  options: Parameters<typeof signTexture>[1],
) {
  return signTexture(lines, options);
}

function Sign({
  x,
  z,
  rotation,
  texture,
  width,
  height,
}: {
  x: number;
  z: number;
  rotation: number;
  texture: THREE.Texture;
  width: number;
  height: number;
}) {
  const y = terrainHeight(x, z);
  return (
    <group position={[x, y, z]} rotation-y={rotation}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width * 0.36), 0.95, -0.07]} castShadow>
          <cylinderGeometry args={[0.06, 0.08, 2.0, 6]} />
          <meshStandardMaterial color="#4a3524" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[width, height, 0.09]} />
        <meshStandardMaterial color="#5b432d" roughness={1} />
      </mesh>
      <mesh position={[0, 1.5, 0.051]}>
        <planeGeometry args={[width * 0.92, height * 0.86]} />
        <meshStandardMaterial map={texture} roughness={0.9} />
      </mesh>
    </group>
  );
}
