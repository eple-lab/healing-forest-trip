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
  // [FEAT-03] 두 줄 글자가 줄 간격(125px)보다 큰 150px라 겹치고, 폭에 맞춰 눌렸다.
  // → 제목 띠 전용 한 줄 텍스처로 바꾸고 font를 넘기지 않아 자동 크기로 그린다.
  const titleTexture = useMemo(
    () =>
      signTexture(['소식 · 입구 알림판'], {
        width: 512,
        height: 96,
        background: '#3f2f1d',
        color: '#efe0c2',
        border: '#75603e',
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
      {/* [FEAT-03] 제목 띠: 판 위쪽 0.27 높이에 짙은 나무색 바탕으로 글자를 따로 담는다. */}
      <mesh position={[0, 1.81, 0.051]}>
        <planeGeometry args={[1.44, 0.27]} />
        <meshStandardMaterial map={titleTexture} roughness={0.95} />
      </mesh>
      {/* [FEAT-03] 종이 영역: 제목 띠 아래 남은 판을 연한 나무색으로 채워 제목과 색을 나눈다. */}
      <mesh position={[0, 1.285, 0.05]}>
        <planeGeometry args={[1.44, 0.76]} />
        <meshStandardMaterial color="#8a6f4c" roughness={1} />
      </mesh>
      {/* 유리판에 붙인 쪽지들 */}
      {/* [FEAT-03] 쪽지가 제목 띠를 가리지 않도록 종이 영역 안쪽으로 내리고 사이를 띄운다. */}
      <mesh position={[-0.28, 1.04, 0.055]} rotation-z={0.06}>
        <planeGeometry args={[0.3, 0.22]} />
        <meshStandardMaterial color="#e6d9c2" roughness={0.9} />
      </mesh>
      <mesh position={[0.3, 1.28, 0.056]} rotation-z={-0.04}>
        <planeGeometry args={[0.24, 0.18]} />
        <meshStandardMaterial color="#efe4c9" roughness={0.9} />
      </mesh>
    </group>
  );
}
