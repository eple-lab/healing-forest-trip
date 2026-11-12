'use client';

import { useMemo } from 'react';
import { CAMPFIRE, mulberry32, terrainHeight } from '@/lib/world';
import { stumpTexture } from '@/lib/textures';
import { Fire } from './Fire';

/**
 * [FEAT-10] 오두막 동쪽(+x, 앞마당에서 볼 때 오른쪽) 모닥불.
 * 앉는 밑동 5개와 차 탁자(넓은 밑동)를 함께 둔다.
 * 탁자 위의 찻주전자·머그 2개·뱅쇼 냄비는 장식이라 상호작용이 없다.
 */
const WOOD = '#5a422f';
const WOOD_DARK = '#4b3525';
const SEAT_H = 0.46;

function StoneRing() {
  const stones = useMemo(() => {
    const rnd = mulberry32(310);
    // [FEAT-10] 빈터 화덕(반지름 1.55, 돌 15개)보다 작게: 반지름 0.9, 돌 11개.
    return Array.from({ length: 11 }, (_, i) => {
      const a = (i / 11) * Math.PI * 2;
      return {
        x: CAMPFIRE.fire.x + Math.cos(a) * CAMPFIRE.fire.r,
        z: CAMPFIRE.fire.z + Math.sin(a) * CAMPFIRE.fire.r,
        rot: rnd() * Math.PI,
        scale: 0.16 + rnd() * 0.1,
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
          <meshStandardMaterial
            color={i % 3 === 0 ? '#777267' : '#66645c'}
            roughness={1}
            flatShading
          />
        </mesh>
      ))}
    </group>
  );
}

export function Campfire() {
  const rings = useMemo(() => stumpTexture(), []);
  const fireY = terrainHeight(CAMPFIRE.fire.x, CAMPFIRE.fire.z);
  const tableY = terrainHeight(CAMPFIRE.table.x, CAMPFIRE.table.z);

  return (
    <group>
      <StoneRing />

      {/* [FEAT-10] 불은 기존 Fire 컴포넌트 하나만 쓴다(늘어나는 빛도 Fire 의 pointLight 하나). */}
      <Fire
        position={[CAMPFIRE.fire.x, fireY + 0.06, CAMPFIRE.fire.z]}
        intensity={0.55}
        scale={0.9}
        lightDistance={10}
      />

      {/* 앉는 밑동 5개(높이 0.46, 반지름 0.28). 앉으면 모닥불을 바라본다. */}
      {CAMPFIRE.seats.map((seat) => {
        const y = terrainHeight(seat.x, seat.z);
        // 식탁 의자와 같은 방식으로 모닥불 쪽을 바라보게 돌린다.
        const facing = Math.atan2(CAMPFIRE.fire.x - seat.x, CAMPFIRE.fire.z - seat.z);
        return (
          <group key={seat.id} position={[seat.x, y, seat.z]} rotation-y={facing}>
            <mesh position={[0, SEAT_H / 2, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.28, 0.28, SEAT_H, 12]} />
              <meshStandardMaterial color={WOOD_DARK} roughness={1} flatShading />
            </mesh>
            <mesh position={[0, SEAT_H + 0.004, 0]} rotation-x={-Math.PI / 2} receiveShadow>
              <circleGeometry args={[0.27, 16]} />
              <meshStandardMaterial map={rings} roughness={0.92} />
            </mesh>
          </group>
        );
      })}

      {/* 넓은 밑동(탁자): 반지름 0.55, 높이 0.55 */}
      <group position={[CAMPFIRE.table.x, tableY, CAMPFIRE.table.z]}>
        <mesh position={[0, CAMPFIRE.table.h / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry
            args={[CAMPFIRE.table.r * 0.94, CAMPFIRE.table.r, CAMPFIRE.table.h, 18]}
          />
          <meshStandardMaterial color={WOOD} roughness={1} flatShading />
        </mesh>
        <mesh
          position={[0, CAMPFIRE.table.h + 0.004, 0]}
          rotation-x={-Math.PI / 2}
          receiveShadow
        >
          <circleGeometry args={[CAMPFIRE.table.r * 0.96, 20]} />
          <meshStandardMaterial map={rings} roughness={0.92} />
        </mesh>

        {/* 찻주전자 */}
        <group position={[0, CAMPFIRE.table.h, -0.14]}>
          <mesh position={[0, 0.1, 0]} scale={[1, 0.82, 1]} castShadow receiveShadow>
            <sphereGeometry args={[0.11, 14, 10]} />
            <meshStandardMaterial color="#c9bda8" roughness={0.6} metalness={0.15} />
          </mesh>
          <mesh position={[0, 0.19, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.055, 0.03, 12]} />
            <meshStandardMaterial color="#a99b85" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.215, 0]} castShadow>
            <sphereGeometry args={[0.018, 8, 6]} />
            <meshStandardMaterial color="#8d8069" roughness={0.7} />
          </mesh>
          {/* 주둥이: 몸통 오른쪽(+x)으로 비스듬히 */}
          <mesh position={[0.13, 0.13, 0]} rotation-z={-0.9} castShadow>
            <cylinderGeometry args={[0.018, 0.032, 0.15, 8]} />
            <meshStandardMaterial color="#c9bda8" roughness={0.6} metalness={0.15} />
          </mesh>
          {/* 손잡이: 몸통 왼쪽(-x) 반원 */}
          <mesh position={[-0.12, 0.11, 0]} rotation-z={Math.PI / 2} castShadow>
            <torusGeometry args={[0.055, 0.012, 6, 12, Math.PI]} />
            <meshStandardMaterial color="#8d8069" roughness={0.7} />
          </mesh>
        </group>

        {/* 머그 2개 */}
        {[
          [-0.22, 0.14],
          [0.03, 0.25],
        ].map(([x, z], i) => (
          <group key={`mug-${i}`} position={[x, CAMPFIRE.table.h, z]}>
            <mesh position={[0, 0.055, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.055, 0.05, 0.11, 12]} />
              <meshStandardMaterial color={i === 0 ? '#d8cbb6' : '#b9c3b0'} roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.108, 0]} rotation-x={-Math.PI / 2}>
              <circleGeometry args={[0.046, 12]} />
              <meshStandardMaterial color="#5a4632" roughness={1} />
            </mesh>
          </group>
        ))}

        {/* 작은 뱅쇼 냄비: 빨간 포도주색 액체 원판 */}
        <group position={[0.27, CAMPFIRE.table.h, -0.1]}>
          <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.1, 0.09, 0.1, 14]} />
            <meshStandardMaterial color="#7a4a36" roughness={0.75} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.101, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.086, 14]} />
            <meshStandardMaterial color="#6d1f2c" roughness={0.35} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
