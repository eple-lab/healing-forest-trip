'use client';

import { useMemo } from 'react';
import { PICNIC, terrainHeight } from '@/lib/world';
import { stumpTexture } from '@/lib/textures';

// [FEAT-12] 오두막 서쪽 8인용 통나무 식탁과 그루터기 의자. 재질은 Cabin/Stumps 와 비슷하게 단색 위주로 처리.
const WOOD = '#5a422f';
const WOOD_DARK = '#4b3525';

export function Picnic() {
  const rings = useMemo(() => stumpTexture(), []);
  const tableY = terrainHeight(PICNIC.table.x, PICNIC.table.z);

  return (
    <group>
      {/* 식탁 */}
      <group position={[PICNIC.table.x, tableY, PICNIC.table.z]}>
        {/* 상판 - 반으로 가른 통나무 느낌, 위는 평평하게 */}
        <mesh position={[0, PICNIC.table.h + 0.02, 0]} castShadow receiveShadow>
          <boxGeometry args={[PICNIC.table.w, 0.04, PICNIC.table.d]} />
          <meshStandardMaterial color={WOOD} roughness={1} />
        </mesh>
        {/* 상판 가장자리/옆면 느낌의 통나무 단면 */}
        <mesh position={[0, PICNIC.table.h - 0.03, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.55, 0.6, 0.06, 14]} />
          <meshStandardMaterial color={WOOD} roughness={1} />
        </mesh>
        {/* 다리 4개 */}
        {[
          [-0.45, -1.4],
          [0.45, -1.4],
          [-0.45, 1.4],
          [0.45, 1.4],
        ].map((p, i) => (
          <mesh key={`leg-${i}`} position={[p[0], PICNIC.table.h / 2, p[1]]} castShadow receiveShadow>
            <cylinderGeometry args={[0.08, 0.1, PICNIC.table.h, 10]} />
            <meshStandardMaterial color={WOOD_DARK} roughness={1} />
          </mesh>
        ))}
      </group>

      {/* 그루터기 의자 8개 */}
      {PICNIC.seats.map((seat) => {
        const y = terrainHeight(seat.x, seat.z);
        // 식탁을 바라보도록 회전
        const dx = PICNIC.table.x - seat.x;
        const dz = PICNIC.table.z - seat.z;
        const facing = Math.atan2(dx, dz);
        return (
          <group key={seat.id} position={[seat.x, y, seat.z]} rotation-y={facing}>
            <mesh position={[0, 0.23, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.26, 0.3, 0.46, 12]} />
              <meshStandardMaterial color={WOOD_DARK} roughness={1} flatShading />
            </mesh>
            <mesh position={[0, 0.46 + 0.004, 0]} rotation-x={-Math.PI / 2} receiveShadow>
              <circleGeometry args={[0.25, 16]} />
              <meshStandardMaterial map={rings} roughness={0.92} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
