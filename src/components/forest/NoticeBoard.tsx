'use client';

/**
 * 산길 초입 알림판
 * 너무 튀지 않도록 숲과 같은 나무 색/질감을 쓴다.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { signTexture } from '@/lib/textures';
import { terrainHeight } from '@/lib/world';

const X = -2.8;
const Z = 66.3;

export function NoticeBoard() {
  const texture = useMemo(
    () =>
      signTexture(['소식', '입구 알림판'], {
        width: 512,
        height: 300,
        background: '#53412c',
        color: '#efe0c2',
        border: '#75603e',
        font: '600 150px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
      }),
    [],
  );
  const y = terrainHeight(X, Z);

  return (
    <group position={[X, y, Z]} rotation-y={0.08}>
      {/* 기둥 */}
      {[-0.62, 0.62].map((side) => (
        <mesh key={side} position={[side, 0.95, -0.07]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 1.9, 6]} />
          <meshStandardMaterial color="#4a3524" roughness={1} />
        </mesh>
      ))}
      {/* 판 */}
      <mesh position={[0, 1.42, 0]} castShadow>
        <boxGeometry args={[1.55, 1.05, 0.09]} />
        <meshStandardMaterial color="#51402c" roughness={1} />
      </mesh>
      {/* 상판 */}
      <mesh position={[0, 1.99, -0.01]} castShadow>
        <boxGeometry args={[1.72, 0.09, 0.22]} />
        <meshStandardMaterial color="#46351f" roughness={1} />
      </mesh>
      {/* 글자면 */}
      <mesh position={[0, 1.42, 0.051]}>
        <planeGeometry args={[1.32, 0.78]} />
        <meshStandardMaterial map={texture} roughness={0.95} />
      </mesh>
      {/* 유리판에 붙인 쪽지들 */}
      <mesh position={[-0.28, 1.08, 0.055]} rotation-z={0.06}>
        <planeGeometry args={[0.3, 0.22]} />
        <meshStandardMaterial color="#e6d9c2" roughness={0.9} />
      </mesh>
      <mesh position={[0.3, 1.22, 0.056]} rotation-z={-0.04}>
        <planeGeometry args={[0.24, 0.18]} />
        <meshStandardMaterial color="#efe4c9" roughness={0.9} />
      </mesh>
    </group>
  );
}
