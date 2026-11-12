'use client';

/**
 * 숲속 오두막
 * ─────────────────────────────────────────────
 * 1층: 벽난로 · 흔들의자 · 무릎담요 테이블 · 주방
 * 2층: 침실 · 큰 창문
 * 좌표는 src/lib/world.ts 의 오두막 로컬 좌표(*_LOCAL, 원점 = 오두막 중심)를 따른다.
 * 맨 바깥 그룹을 월드의 오두막 중심(CABIN_WORLD.x, CABIN_WORLD.z)에 놓으므로
 * 이 파일 안의 위치 숫자는 모두 오두막 기준이다.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CABIN as CABIN_WORLD,
  CABIN_LOCAL as CABIN,
  FURNITURE_LOCAL as FURNITURE,
  PORCH_STEPS,
  porchStepTop,
  STAIRS_LOCAL as STAIRS,
  STAIR_HOLE_LOCAL as STAIR_HOLE,
  WINDOW_LOCAL as WINDOW,
} from '@/lib/world';
import { logTexture, plankTexture, stoneTexture, plaidTexture, glowTexture } from '@/lib/textures';
import { useGame } from '@/store/game';
import { Fire } from './Fire';

const HALF_W = CABIN.halfW;
const HALF_D = CABIN.halfD;
const FRONT = CABIN.frontZ;
const BACK = CABIN.backZ;
const F1 = CABIN.floor1;
const F2 = CABIN.floor2;
const TOP = CABIN.wallTop;
const RIDGE = CABIN.ridge;
const WALL_T = 0.2;

function useWood() {
  return useMemo(() => {
    const texture = logTexture();
    const inner = logTexture().clone();
    inner.needsUpdate = true;
    inner.repeat.set(2.4, 1.4);
    const planks = plankTexture();
    return { texture, inner, planks };
  }, []);
}

function LogWall({
  position,
  args,
  map,
  color = '#8a6544',
}: {
  position: [number, number, number];
  args: [number, number, number];
  map: THREE.Texture;
  color?: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial map={map} color={color} roughness={1} metalness={0} />
    </mesh>
  );
}

function RoofPanel({ side }: { side: 1 | -1 }) {
  const slope = Math.atan2(RIDGE - 6.5, 5.95);
  const length = Math.hypot(5.95, RIDGE - 6.5);
  return (
    <mesh
      position={[side * (5.95 / 2), (RIDGE + 6.5) / 2, (FRONT + BACK) / 2]}
      rotation={[0, 0, side * slope]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[length + 0.5, 0.22, HALF_D * 2 + 2.6]} />
      <meshStandardMaterial color="#4c3b2d" roughness={1} />
    </mesh>
  );
}

function Gable({ z, side }: { z: number; side: 1 | -1 }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-HALF_W - 0.1, 0);
    shape.lineTo(HALF_W + 0.1, 0);
    shape.lineTo(0, RIDGE - 6.5);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);
  return (
    <mesh geometry={geometry} position={[0, TOP, z]} rotation-y={side > 0 ? 0 : Math.PI}>
      <meshStandardMaterial color="#6d4f36" roughness={1} side={THREE.DoubleSide} />
    </mesh>
  );
}

function FrontWall({ map }: { map: THREE.Texture }) {
  const door = CABIN.doorHalf;
  const lowTop = F2;
  const upperBottom = WINDOW.bottom;
  const upperTop = WINDOW.top;
  return (
    <group>
      {/* 1층: 문 양옆 */}
      <LogWall position={[-(HALF_W + door) / 2, (F1 + lowTop) / 2, FRONT]} args={[HALF_W - door, lowTop - F1, WALL_T]} map={map} />
      <LogWall position={[(HALF_W + door) / 2, (F1 + lowTop) / 2, FRONT]} args={[HALF_W - door, lowTop - F1, WALL_T]} map={map} />
      {/* 문 위 인방 */}
      <LogWall position={[0, (CABIN.doorTop + lowTop) / 2, FRONT]} args={[door * 2, lowTop - CABIN.doorTop, WALL_T]} map={map} />
      {/* 2층: 창문 좌우 */}
      <LogWall position={[-(HALF_W + WINDOW.halfW) / 2, (F2 + TOP) / 2, FRONT]} args={[HALF_W - WINDOW.halfW, TOP - F2, WALL_T]} map={map} />
      <LogWall position={[(HALF_W + WINDOW.halfW) / 2, (F2 + TOP) / 2, FRONT]} args={[HALF_W - WINDOW.halfW, TOP - F2, WALL_T]} map={map} />
      {/* 창문 아래/위 */}
      <LogWall position={[0, (F2 + upperBottom) / 2, FRONT]} args={[WINDOW.halfW * 2, upperBottom - F2, WALL_T]} map={map} />
      <LogWall position={[0, (upperTop + TOP) / 2, FRONT]} args={[WINDOW.halfW * 2, TOP - upperTop, WALL_T]} map={map} />
    </group>
  );
}

function DoorFrame() {
  const plank = useMemo(() => plankTexture(), []);
  return (
    <group position={[0, F1, FRONT]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (CABIN.doorHalf + 0.11), 1.06, 0.02]} castShadow>
          <boxGeometry args={[0.16, 2.12, 0.26]} />
          <meshStandardMaterial color="#4a3524" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, CABIN.doorTop + 0.08, 0.02]} castShadow>
        <boxGeometry args={[CABIN.doorHalf * 2 + 0.5, 0.18, 0.3]} />
        <meshStandardMaterial color="#4a3524" roughness={1} />
      </mesh>
      {/* 열린 문짝 */}
      <group position={[-CABIN.doorHalf, 0, 0.06]} rotation-y={-1.9}>
        <mesh position={[CABIN.doorHalf, 1.06, 0]} castShadow>
          <boxGeometry args={[CABIN.doorHalf * 2, 2.08, 0.07]} />
          <meshStandardMaterial map={plank} color="#5c412c" roughness={0.9} />
        </mesh>
        <mesh position={[CABIN.doorHalf * 1.72, 0.92, 0.06]}>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshStandardMaterial color="#c9a45c" metalness={0.7} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

function BigWindow() {
  const glass = useRef<THREE.Mesh>(null);
  const width = WINDOW.halfW * 2;
  const height = WINDOW.top - WINDOW.bottom;
  const centerY = (WINDOW.bottom + WINDOW.top) / 2;

  return (
    <group position={[0, 0, WINDOW.z]}>
      {/* 창틀 */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (WINDOW.halfW + 0.07), centerY, 0]} castShadow>
          <boxGeometry args={[0.17, height + 0.34, 0.22]} />
          <meshStandardMaterial color="#4d3826" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, WINDOW.bottom - 0.07, 0]} castShadow>
        <boxGeometry args={[width + 0.36, 0.16, 0.3]} />
        <meshStandardMaterial color="#4d3826" roughness={1} />
      </mesh>
      <mesh position={[0, WINDOW.top + 0.07, 0]} castShadow>
        <boxGeometry args={[width + 0.36, 0.16, 0.2]} />
        <meshStandardMaterial color="#4d3826" roughness={1} />
      </mesh>
      {/* 창살 */}
      <mesh position={[0, centerY, 0.01]}>
        <boxGeometry args={[0.07, height, 0.12]} />
        <meshStandardMaterial color="#5a4230" roughness={1} />
      </mesh>
      <mesh position={[0, centerY, 0.01]}>
        <boxGeometry args={[width, 0.07, 0.12]} />
        <meshStandardMaterial color="#5a4230" roughness={1} />
      </mesh>
      {/* 유리 */}
      <mesh ref={glass} position={[0, centerY, 0.015]}>
        <planeGeometry args={[width, height]} />
        <meshPhysicalMaterial
          color="#cfe0e6"
          transparent
          opacity={0.16}
          roughness={0.05}
          metalness={0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* 창턱 (실내) */}
      <mesh position={[0, WINDOW.bottom - 0.14, -0.28]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.5, 0.09, 0.5]} />
        <meshStandardMaterial color="#6a4c33" roughness={1} />
      </mesh>
    </group>
  );
}

function Roof() {
  const stone = useMemo(() => stoneTexture(), []);
  return (
    <group>
      <RoofPanel side={1} />
      <RoofPanel side={-1} />
      <Gable z={FRONT + 0.06} side={1} />
      <Gable z={BACK - 0.06} side={-1} />
      {/* 마룻대 */}
      <mesh position={[0, RIDGE + 0.06, (FRONT + BACK) / 2]} castShadow>
        <boxGeometry args={[0.24, 0.24, HALF_D * 2 + 2.6]} />
        <meshStandardMaterial color="#3d2f23" roughness={1} />
      </mesh>
      {/* 굴뚝 */}
      {/* [BUG-07] 굴뚝이 벽난로와 z로 1.3m 어긋났다 → 벽난로 중심 z에 맞춘다. */}
      <group position={[-5.65, 0, FURNITURE.fireplace.z]}>
        <mesh position={[0, 4.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.35, 9.2, 1.35]} />
          <meshStandardMaterial map={stone} color="#8d8a80" roughness={1} />
        </mesh>
        <mesh position={[0, 9.3, 0]} castShadow>
          <boxGeometry args={[1.55, 0.22, 1.55]} />
          <meshStandardMaterial color="#6f6c64" roughness={1} />
        </mesh>
      </group>
    </group>
  );
}

function Porch() {
  const planks = useMemo(() => plankTexture(), []);
  const glow = useMemo(() => glowTexture(), []);
  // [BUG-10] 데크가 앞벽보다 -z 쪽에 있다고 보고 쓴 부호(깊이 음수, 계단이 데크 아래 등)를 바로잡는다.
  // 데크는 앞벽(FRONT)에서 바깥쪽(OUT, 남쪽 +z)으로 porchZ 까지다.
  const OUT = Math.sign(CABIN.porchZ - FRONT);
  const depth = Math.abs(CABIN.porchZ - FRONT);
  const posts: [number, number][] = [
    [-3.15, CABIN.porchZ - OUT * 0.35],
    [3.15, CABIN.porchZ - OUT * 0.35],
  ];
  return (
    <group>
      {/* 데크 */}
      <mesh position={[0, F1 - 0.06, (FRONT + CABIN.porchZ) / 2]} receiveShadow>
        <boxGeometry args={[7.0, 0.13, depth + 0.1]} />
        <meshStandardMaterial map={planks} color="#7c5c3f" roughness={1} />
      </mesh>
      {/* 데크 받침 */}
      {[-3, 0, 3].map((x) => (
        <mesh key={x} position={[x, (F1 - 0.1) / 2, CABIN.porchZ - OUT * 0.3]} castShadow>
          <boxGeometry args={[0.16, F1 - 0.1, 0.16]} />
          <meshStandardMaterial color="#4c3727" roughness={1} />
        </mesh>
      ))}
      {/* 계단 (데크 바깥쪽, groundAt 의 PORCH_STEPS 와 같은 값) */}
      {Array.from({ length: PORCH_STEPS.count }, (_, i) => (
        <mesh
          key={i}
          position={[0, porchStepTop(i) - PORCH_STEPS.rise / 2, CABIN.porchZ + OUT * PORCH_STEPS.run * (i + 1)]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[PORCH_STEPS.width, PORCH_STEPS.rise, PORCH_STEPS.depth]} />
          <meshStandardMaterial color="#6e5138" roughness={1} />
        </mesh>
      ))}
      {/* 기둥과 처마 */}
      {posts.map(([x, z]) => (
        <group key={x} position={[x, 0, z]}>
          <mesh position={[0, 1.62, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.13, 3.3, 8]} />
            <meshStandardMaterial color="#4b3625" roughness={1} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.24, 0.28, 0.16, 8]} />
            <meshStandardMaterial color="#7d7a70" roughness={1} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 3.3, CABIN.porchZ - OUT * 0.1]} rotation-x={-OUT * 0.12} castShadow>
        <boxGeometry args={[7.2, 0.14, depth + 0.7]} />
        <meshStandardMaterial color="#4a392b" roughness={1} />
      </mesh>
      {/* 매달린 등 */}
      <group position={[0, 2.72, CABIN.porchZ - OUT * 0.55]}>
        <mesh position={[0, 0.24, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.48, 5]} />
          <meshStandardMaterial color="#3a2c1f" roughness={1} />
        </mesh>
        <mesh position={[0, -0.08, 0]}>
          <boxGeometry args={[0.24, 0.3, 0.24]} />
          <meshStandardMaterial color="#2f261c" roughness={0.8} metalness={0.2} />
        </mesh>
        <mesh position={[0, -0.08, 0]}>
          <boxGeometry args={[0.17, 0.22, 0.17]} />
          <meshStandardMaterial
            color="#ffd39a"
            emissive="#ffb066"
            emissiveIntensity={1.8}
            transparent
            opacity={0.9}
          />
        </mesh>
        <sprite position={[0, -0.08, 0]} scale={[2.1, 2.1, 1]}>
          <spriteMaterial
            map={glow}
            color="#ffb877"
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
        <pointLight color="#ffbd7d" intensity={2.2} distance={8} decay={2} />
      </group>
      {/* 장작더미 (밖) */}
      <Woodpile />
      {/* 도끼질용 그루터기 */}
      <group position={[7.6, 0, 3.6]}>
        <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.34, 0.42, 0.48, 11]} />
          <meshStandardMaterial color="#5b422d" roughness={1} flatShading />
        </mesh>
        <mesh position={[0.22, 0.34, 0]} rotation-z={0.5} castShadow>
          <boxGeometry args={[0.05, 0.6, 0.16]} />
          <meshStandardMaterial color="#6b6b6b" metalness={0.5} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function Woodpile() {
  const logs = useMemo(() => {
    const out: { x: number; y: number; z: number; rot: number; len: number; r: number }[] = [];
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let row = 0; row < 4; row++) {
      const count = 5 - Math.floor(row / 2);
      for (let i = 0; i < count; i++) {
        out.push({
          x: FURNITURE.woodpile.x - 0.55 + row * 0.1 + i * 0.02,
          y: 0.18 + row * 0.28,
          z: FURNITURE.woodpile.z - 0.65 + i * 0.32 + row * 0.06,
          rot: Math.PI / 2 + (rnd() - 0.5) * 0.16,
          len: 1.3 + rnd() * 0.22,
          r: 0.12 + rnd() * 0.035,
        });
      }
    }
    return out;
  }, []);
  return (
    <group>
      <mesh position={[FURNITURE.woodpile.x, 0.05, FURNITURE.woodpile.z]} receiveShadow>
        <boxGeometry args={[1.7, 0.1, 1.8]} />
        <meshStandardMaterial color="#4a3a2a" roughness={1} />
      </mesh>
      {logs.map((log, i) => (
        <mesh
          key={i}
          position={[log.x, log.y, log.z]}
          rotation={[0, 0, log.rot]}
          castShadow
        >
          <cylinderGeometry args={[log.r, log.r, log.len, 7]} />
          <meshStandardMaterial color={i % 3 === 0 ? '#5c422c' : '#6b4d33'} roughness={1} />
        </mesh>
      ))}
      {/* 덮개 */}
      <mesh position={[FURNITURE.woodpile.x + 0.15, 1.32, FURNITURE.woodpile.z]} rotation-z={0.14} castShadow>
        <boxGeometry args={[1.85, 0.06, 2.0]} />
        <meshStandardMaterial color="#4a3b2c" roughness={1} />
      </mesh>
    </group>
  );
}

function InteriorWalls() {
  const map = useWood().inner;
  return (
    <group>
      {/* 좌우 벽 */}
      <LogWall position={[-HALF_W - 0.02, (F1 + TOP) / 2, (FRONT + BACK) / 2]} args={[WALL_T, TOP - F1, HALF_D * 2]} map={map} color="#7d5c3f" />
      <LogWall position={[HALF_W + 0.02, (F1 + TOP) / 2, (FRONT + BACK) / 2]} args={[WALL_T, TOP - F1, HALF_D * 2]} map={map} color="#7d5c3f" />
      {/* 뒷벽 */}
      <LogWall position={[0, (F1 + TOP) / 2, BACK - 0.02]} args={[HALF_D * 2, TOP - F1, WALL_T]} map={map} color="#75553a" />
      {/* 1층 바닥 */}
      <mesh position={[0, F1 - 0.05, (FRONT + BACK) / 2]} receiveShadow>
        <boxGeometry args={[HALF_W * 2, 0.1, HALF_D * 2]} />
        <meshStandardMaterial map={plankTexture()} color="#8a6746" roughness={0.9} />
      </mesh>
      {/* 2층 바닥 (계단 구멍 제외) */}
      <UpperFloor />
      {/* 계단 */}
      <Stairs />
      {/* 2층 난간 */}
      <UpperRail />
      {/* 들보 */}
      <mesh position={[0, F2 - 0.16, (FRONT + BACK) / 2]} castShadow>
        <boxGeometry args={[HALF_W * 2, 0.22, 0.24]} />
        <meshStandardMaterial color="#4f3a27" roughness={1} />
      </mesh>
    </group>
  );
}

function UpperFloor() {
  const planks = useMemo(() => plankTexture(), []);
  const y = F2 - 0.06;
  return (
    <group>
      {/* 왼쪽 큰 판 */}
      <mesh position={[(-HALF_W + STAIR_HOLE.x0) / 2, y, (FRONT + BACK) / 2]} receiveShadow>
        <boxGeometry args={[STAIR_HOLE.x0 + HALF_W, 0.12, HALF_D * 2]} />
        <meshStandardMaterial map={planks} color="#8f6b49" roughness={0.95} />
      </mesh>
      {/* 오른쪽 좁은 판 */}
      <mesh position={[(STAIR_HOLE.x1 + HALF_W) / 2, y, (FRONT + BACK) / 2]} receiveShadow>
        <boxGeometry args={[HALF_W - STAIR_HOLE.x1, 0.12, HALF_D * 2]} />
        <meshStandardMaterial map={planks} color="#8f6b49" roughness={0.95} />
      </mesh>
      {/* 구멍 뒤쪽 판 (계단 위쪽) */}
      <mesh position={[0, y, (STAIR_HOLE.z0 + BACK) / 2]} receiveShadow>
        <boxGeometry args={[STAIR_HOLE.x1 - STAIR_HOLE.x0, 0.12, Math.abs(STAIR_HOLE.z0 - BACK)]} />
        <meshStandardMaterial map={planks} color="#8f6b49" roughness={0.95} />
      </mesh>
      {/* 구멍 앞쪽 판 (문 위) */}
      <mesh position={[0, y, (FRONT + STAIR_HOLE.z1) / 2]} receiveShadow>
        <boxGeometry args={[STAIR_HOLE.x1 - STAIR_HOLE.x0, 0.12, Math.max(0, STAIR_HOLE.z1 - FRONT)]} />
        <meshStandardMaterial map={planks} color="#8f6b49" roughness={0.95} />
      </mesh>
    </group>
  );
}

function Stairs() {
  const planks = useMemo(() => plankTexture(), []);
  const steps = STAIRS.steps;
  const rise = (STAIRS.yTop - STAIRS.yBottom) / steps;
  const run = (STAIRS.zBottom - STAIRS.zTop) / steps;
  const width = STAIRS.x1 - STAIRS.x0;
  const centerX = (STAIRS.x0 + STAIRS.x1) / 2;

  return (
    <group>
      {Array.from({ length: steps }, (_, i) => {
        const z = STAIRS.zBottom - run * (i + 0.5);
        const y = STAIRS.yBottom + rise * (i + 0.5);
        return (
          <mesh key={i} position={[centerX, y, z]} castShadow receiveShadow>
            <boxGeometry args={[width, rise + 0.04, run + 0.02]} />
            <meshStandardMaterial map={planks} color="#7f5f40" roughness={0.95} />
          </mesh>
        );
      })}
      {/* 난간 기둥 */}
      {[0, 0.35, 0.7, 1].map((t) => {
        const z = STAIRS.zBottom - (STAIRS.zBottom - STAIRS.zTop) * t;
        const y = STAIRS.yBottom + (STAIRS.yTop - STAIRS.yBottom) * t;
        return (
          <mesh key={t} position={[STAIRS.x0 + 0.03, y + 0.5, z]} castShadow>
            <cylinderGeometry args={[0.045, 0.055, 1.0, 6]} />
            <meshStandardMaterial color="#4c3727" roughness={1} />
          </mesh>
        );
      })}
      {/* 손잡이 */}
      <mesh
        position={[
          STAIRS.x0 + 0.03,
          (STAIRS.yBottom + STAIRS.yTop) / 2 + 0.98,
          (STAIRS.zBottom + STAIRS.zTop) / 2,
        ]}
        rotation-x={Math.atan2(STAIRS.yTop - STAIRS.yBottom, STAIRS.zBottom - STAIRS.zTop)}
        castShadow
      >
        <cylinderGeometry args={[0.05, 0.05, Math.hypot(STAIRS.zBottom - STAIRS.zTop, STAIRS.yTop - STAIRS.yBottom), 6]} />
        <meshStandardMaterial color="#5b422c" roughness={0.9} />
      </mesh>
    </group>
  );
}

function UpperRail() {
  return (
    <group>
      {/* 계단 구멍 왼쪽 난간 */}
      {[0, 0.5, 1].map((t) => {
        const z = STAIR_HOLE.z0 + (STAIR_HOLE.z1 - STAIR_HOLE.z0) * t;
        return (
          <mesh key={t} position={[STAIR_HOLE.x0 + 0.03, F2 + 0.48, z]} castShadow>
            <cylinderGeometry args={[0.045, 0.055, 0.96, 6]} />
            <meshStandardMaterial color="#4e3928" roughness={1} />
          </mesh>
        );
      })}
      <mesh position={[STAIR_HOLE.x0 + 0.03, F2 + 0.94, (STAIR_HOLE.z0 + STAIR_HOLE.z1) / 2]} castShadow>
        <boxGeometry args={[0.09, 0.09, STAIR_HOLE.z1 - STAIR_HOLE.z0]} />
        <meshStandardMaterial color="#5b432e" roughness={1} />
      </mesh>
    </group>
  );
}

function Fireplace() {
  const { x, z, w, d } = FURNITURE.fireplace;
  const stone = useMemo(() => stoneTexture(), []);
  const fire = useGame((s) => s.fire);
  const inner = useMemo(() => logTexture(), []);
  // [BUG-07] 몸체가 속이 찬 상자 하나라 아궁이·불이 그 안에 갇혔고, 절반 넘게 벽 속에 있었다 →
  // 뒷면을 벽 안쪽 면에 붙이고(world.ts), 뒷판·양쪽 기둥·위 가로대·바닥 받침으로 나눠 앞을 튼다.
  const bodyW = w + 0.12; // 벽에서 방 쪽으로의 깊이(x)
  const bodyD = d + 0.24; // 벽을 따라 잰 폭(z)
  const back = x - bodyW / 2;
  const front = x + bodyW / 2;
  const backT = 0.28;
  const innerBack = back + backT;
  const openD = 1.6;
  const hearthH = 0.15;
  const openTop = hearthH + 1.1;
  const pillarD = (bodyD - openD) / 2;
  return (
    <group>
      {/* 뒷판 */}
      <mesh position={[back + backT / 2, F1 + 1.0, z]} castShadow receiveShadow>
        <boxGeometry args={[backT, 2.0, bodyD]} />
        <meshStandardMaterial map={stone} color="#8b877c" roughness={1} />
      </mesh>
      {/* 양쪽 기둥 */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[(innerBack + front) / 2, F1 + 1.0, z + side * (openD / 2 + pillarD / 2)]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[front - innerBack, 2.0, pillarD]} />
          <meshStandardMaterial map={stone} color="#8b877c" roughness={1} />
        </mesh>
      ))}
      {/* 위 가로대 */}
      <mesh position={[(innerBack + front) / 2, F1 + (openTop + 2.0) / 2, z]} castShadow receiveShadow>
        <boxGeometry args={[front - innerBack, 2.0 - openTop, openD]} />
        <meshStandardMaterial map={stone} color="#8b877c" roughness={1} />
      </mesh>
      {/* 바닥 받침 (앞으로 조금 나온다) */}
      <mesh position={[(innerBack + front + 0.25) / 2, F1 + hearthH / 2, z]} receiveShadow>
        <boxGeometry args={[front + 0.25 - innerBack, hearthH, bodyD]} />
        <meshStandardMaterial map={stone} color="#7e7a70" roughness={1} />
      </mesh>
      {/* 아궁이 안쪽 그을음 */}
      <mesh position={[innerBack + 0.01, F1 + (hearthH + openTop) / 2, z]}>
        <boxGeometry args={[0.02, openTop - hearthH, openD]} />
        <meshStandardMaterial color="#241c16" roughness={1} />
      </mesh>
      {/* 불 (아궁이 안, 앞에서 보인다) */}
      <group position={[(innerBack + front) / 2 - 0.05, F1 + hearthH, z]}>
        <Fire position={[0, 0, 0]} intensity={fire.intensity} scale={0.72} lightDistance={9} />
      </group>
      {/* 굴뚝 받침 */}
      <mesh position={[x, F1 + 2.15, z]} castShadow>
        <boxGeometry args={[w + 0.3, 0.3, d + 0.4]} />
        <meshStandardMaterial map={stone} color="#7e7a70" roughness={1} />
      </mesh>
      {/* 선반 (가로대 앞면에 붙인다) */}
      <mesh position={[front + 0.12, F1 + 1.72, z]} castShadow>
        <boxGeometry args={[0.3, 0.1, d + 0.1]} />
        <meshStandardMaterial map={inner} color="#5c412c" roughness={0.9} />
      </mesh>
      {/* 선반 위 촛불 */}
      {[-0.7, 0.7].map((dz) => (
        <group key={dz} position={[front + 0.12, F1 + 1.77, z + dz]}>
          <mesh position={[0, 0.11, 0]}>
            <cylinderGeometry args={[0.035, 0.04, 0.22, 8]} />
            <meshStandardMaterial color="#e8dcc0" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.27, 0]}>
            <coneGeometry args={[0.025, 0.1, 6]} />
            <meshBasicMaterial color="#ffbe6a" toneMapped={false} />
          </mesh>
          <pointLight color="#ffb066" intensity={0.5} distance={2.4} decay={2} position={[0, 0.3, 0]} />
        </group>
      ))}
      {/* 장작 바구니 */}
      <group position={[front + 0.27, F1, z + 1.9]}>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.24, 0.44, 10, 1, true]} />
          <meshStandardMaterial color="#6b4f34" roughness={1} side={THREE.DoubleSide} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0.02 * i, 0.34 + i * 0.06, 0]} rotation-z={0.6 + i * 0.2} castShadow>
            <cylinderGeometry args={[0.06, 0.07, 0.42, 6]} />
            <meshStandardMaterial color="#4a3322" roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function RockingChair() {
  const { x, z, facing } = FURNITURE.rockingChair;
  const seatY = F1 + 0.46;
  return (
    <group position={[x, F1, z]} rotation-y={facing}>
      {/* 좌판 */}
      <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.09, 0.6]} />
        <meshStandardMaterial color="#7a5a3b" roughness={0.9} />
      </mesh>
      {/* 등받이 기둥 */}
      {[-0.25, 0.25].map((dx) => (
        <mesh key={dx} position={[dx, 0.86, 0.26]} rotation-x={-0.1} castShadow>
          <cylinderGeometry args={[0.035, 0.04, 0.82, 6]} />
          <meshStandardMaterial color="#5c4129" roughness={1} />
        </mesh>
      ))}
      {/* 등받이 판 */}
      {[0.72, 0.92, 1.1].map((y, i) => (
        <mesh key={y} position={[0, y, 0.3]} rotation-x={-0.1} castShadow>
          <boxGeometry args={[0.56 - i * 0.02, 0.1, 0.045]} />
          <meshStandardMaterial color="#6e5034" roughness={1} />
        </mesh>
      ))}
      {/* 팔걸이 */}
      {[-0.31, 0.31].map((dx) => (
        <mesh key={dx} position={[dx, 0.66, 0.03]} castShadow>
          <boxGeometry args={[0.07, 0.06, 0.56]} />
          <meshStandardMaterial color="#5c4129" roughness={1} />
        </mesh>
      ))}
      {/* 다리 */}
      {[
        [-0.25, -0.24],
        [0.25, -0.24],
        [-0.25, 0.24],
        [0.25, 0.24],
      ].map(([dx, dz], i) => (
        <mesh key={i} position={[dx, 0.22, dz]} castShadow>
          <cylinderGeometry args={[0.035, 0.045, 0.44, 6]} />
          <meshStandardMaterial color="#5c4129" roughness={1} />
        </mesh>
      ))}
      {/* 흔들의자 곡선 받침 */}
      {[-0.25, 0.25].map((dx) => (
        <mesh key={dx} position={[dx, 0.05, 0]} rotation-x={Math.PI / 2} castShadow>
          <torusGeometry args={[0.34, 0.035, 6, 18, Math.PI * 0.9]} />
          <meshStandardMaterial color="#4e3723" roughness={1} />
        </mesh>
      ))}
      {/* 쿠션 */}
      <mesh position={[0, 0.51, -0.02]} castShadow>
        <boxGeometry args={[0.54, 0.1, 0.5]} />
        <meshStandardMaterial color="#a5624b" roughness={0.95} />
      </mesh>
      {/* 곁에 놓인 무릎담요 테이블 */}
      <BlanketTable />
      {/* 발판 */}
      <mesh position={[0, 0.12, -0.55]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.12, 0.32]} />
        <meshStandardMaterial color="#6d4f34" roughness={1} />
      </mesh>
    </group>
  );
}

function BlanketTable() {
  const { x, z, w, d } = FURNITURE.blanketTable;
  const plaid = useMemo(() => plaidTexture(), []);
  const relativeX = x - FURNITURE.rockingChair.x;
  const relativeZ = z - FURNITURE.rockingChair.z;
  // 회전 좌표계로 변환 (의자 로컬)
  const cos = Math.cos(-FURNITURE.rockingChair.facing);
  const sin = Math.sin(-FURNITURE.rockingChair.facing);
  const lx = relativeX * cos - relativeZ * sin;
  const lz = relativeX * sin + relativeZ * cos;

  return (
    <group position={[lx, 0, lz]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.07, d]} />
        <meshStandardMaterial color="#6f5137" roughness={0.9} />
      </mesh>
      {[
        [-w / 2 + 0.06, -d / 2 + 0.06],
        [w / 2 - 0.06, -d / 2 + 0.06],
        [-w / 2 + 0.06, d / 2 - 0.06],
        [w / 2 - 0.06, d / 2 - 0.06],
      ].map(([dx, dz], i) => (
        <mesh key={i} position={[dx, 0.25, dz]} castShadow>
          <cylinderGeometry args={[0.028, 0.03, 0.46, 6]} />
          <meshStandardMaterial color="#5a3f29" roughness={1} />
        </mesh>
      ))}
      {/* 무릎담요 (접힌 채) */}
      <mesh position={[0, 0.58, 0]} rotation-y={0.18} castShadow>
        <boxGeometry args={[0.44, 0.12, 0.36]} />
        <meshStandardMaterial map={plaid} roughness={1} />
      </mesh>
      <mesh position={[0, 0.66, 0]} rotation-y={0.18} castShadow>
        <boxGeometry args={[0.4, 0.05, 0.32]} />
        <meshStandardMaterial map={plaid} color="#c08a6e" roughness={1} />
      </mesh>
      {/* 머그 */}
      <group position={[0.24, 0.56, -0.14]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.06, 0.05, 0.11, 12, 1, true]} />
          <meshStandardMaterial color="#e6d9c2" roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.05, 0]} rotation-x={Math.PI / 2}>
          <circleGeometry args={[0.05, 12]} />
          <meshStandardMaterial color="#e6d9c2" roughness={0.7} />
        </mesh>
        <mesh position={[0.065, 0, 0]} rotation-z={Math.PI / 2}>
          <torusGeometry args={[0.035, 0.012, 6, 12]} />
          <meshStandardMaterial color="#e6d9c2" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

function Kitchen() {
  const { x0, x1, z0, z1, h } = FURNITURE.kitchen;
  const planks = useMemo(() => plankTexture(), []);
  const inner = useMemo(() => logTexture(), []);
  const counterY = F1 + h;
  const width = x1 - x0;
  const centerX = (x0 + x1) / 2;
  const depth = z1 - z0;

  return (
    <group>
      {/* 하부장 */}
      <mesh position={[centerX, F1 + h / 2, (z0 + z1) / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, h, depth]} />
        <meshStandardMaterial map={inner} color="#6b4d34" roughness={1} />
      </mesh>
      {/* 상판 */}
      <mesh position={[centerX, counterY + 0.03, (z0 + z1) / 2]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.1, 0.08, depth + 0.12]} />
        <meshStandardMaterial map={planks} color="#9a7550" roughness={0.7} />
      </mesh>
      {/* 문 손잡이 */}
      {[-2.2, -1.0, 0.2, 1.4].map((dx) => (
        <mesh key={dx} position={[dx, F1 + 0.62, z1 + 0.015]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.018, 0.018, 0.16, 6]} />
          <meshStandardMaterial color="#b39763" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* 상부 선반 */}
      <mesh position={[centerX + 0.4, F1 + 1.92, z0 + 0.12]} castShadow>
        <boxGeometry args={[width - 1.4, 0.08, 0.34]} />
        <meshStandardMaterial map={planks} color="#7a5a3c" roughness={1} />
      </mesh>
      {[
        { x: -1.9, h: 0.24, c: '#9c6a4a' },
        { x: -1.2, h: 0.3, c: '#7e8b62' },
        { x: -0.5, h: 0.2, c: '#b08a5c' },
        { x: 0.2, h: 0.28, c: '#8a6a52' },
      ].map((jar, i) => (
        <mesh key={i} position={[jar.x, F1 + 2.0 + jar.h / 2, z0 + 0.12]} castShadow>
          <cylinderGeometry args={[0.09, 0.1, jar.h, 10]} />
          <meshStandardMaterial color={jar.c} roughness={0.8} />
        </mesh>
      ))}
      {/* 싱크대 */}
      <group position={[FURNITURE.sink.x, counterY + 0.08, FURNITURE.sink.z]}>
        <mesh position={[0, -0.04, 0]} receiveShadow>
          <boxGeometry args={[0.74, 0.1, 0.5]} />
          <meshStandardMaterial color="#8f9a98" metalness={0.55} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.01, 0]}>
          <boxGeometry args={[0.58, 0.06, 0.36]} />
          <meshStandardMaterial color="#5c6664" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.2, 0.22]}>
          <cylinderGeometry args={[0.022, 0.026, 0.26, 8]} />
          <meshStandardMaterial color="#b6a06a" metalness={0.8} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.32, 0.13]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
          <meshStandardMaterial color="#b6a06a" metalness={0.8} roughness={0.28} />
        </mesh>
      </group>
      {/* 커피포트 */}
      <group position={[FURNITURE.coffee.x, counterY + 0.08, FURNITURE.coffee.z]}>
        <mesh position={[0, 0.13, 0]} castShadow>
          <cylinderGeometry args={[0.13, 0.16, 0.26, 14]} />
          <meshStandardMaterial color="#8d5b45" metalness={0.35} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.28, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.13, 0.06, 14]} />
          <meshStandardMaterial color="#3d3a36" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0.17, 0.16, 0]} rotation-z={-0.4}>
          <torusGeometry args={[0.08, 0.016, 6, 12, Math.PI]} />
          <meshStandardMaterial color="#3d3a36" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.36, 0.05]} rotation-x={0.3}>
          <cylinderGeometry args={[0.012, 0.018, 0.16, 6]} />
          <meshStandardMaterial color="#3d3a36" metalness={0.5} roughness={0.5} />
        </mesh>
      </group>
      {/* 냉장고 */}
      <group position={[FURNITURE.fridge.x, F1, FURNITURE.fridge.z]}>
        <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
          <boxGeometry args={[FURNITURE.fridge.w, 1.8, FURNITURE.fridge.d]} />
          <meshStandardMaterial color="#b9b3a4" roughness={0.55} metalness={0.15} />
        </mesh>
        <mesh position={[0, 0.93, FURNITURE.fridge.d / 2 + 0.01]}>
          <boxGeometry args={[FURNITURE.fridge.w - 0.08, 0.015, 0.02]} />
          <meshStandardMaterial color="#7c776c" roughness={0.6} />
        </mesh>
        <mesh position={[-0.36, 1.26, FURNITURE.fridge.d / 2 + 0.06]}>
          <cylinderGeometry args={[0.022, 0.022, 0.42, 8]} />
          <meshStandardMaterial color="#8a8578" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0.36, 1.26, FURNITURE.fridge.d / 2 + 0.06]}>
          <cylinderGeometry args={[0.022, 0.022, 0.42, 8]} />
          <meshStandardMaterial color="#8a8578" metalness={0.7} roughness={0.35} />
        </mesh>
        {/* 자석 메모 */}
        <mesh position={[0.1, 1.45, FURNITURE.fridge.d / 2 + 0.012]}>
          <planeGeometry args={[0.2, 0.26]} />
          <meshStandardMaterial color="#efe6cf" roughness={0.9} />
        </mesh>
      </group>
      {/* 찬장 */}
      <mesh position={[2.32, F1 + 1.15, BACK + 0.32]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 2.3, 0.58]} />
        <meshStandardMaterial map={inner} color="#5f452f" roughness={1} />
      </mesh>
    </group>
  );
}

function Bedroom() {
  const { x, z, w, d } = FURNITURE.bed;
  const plaid = useMemo(() => plaidTexture(), []);
  const planks = useMemo(() => plankTexture(), []);
  return (
    <group>
      {/* 침대 */}
      <group position={[x, F2, z]}>
        <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.26, d]} />
          <meshStandardMaterial map={planks} color="#5f452f" roughness={1} />
        </mesh>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <boxGeometry args={[w - 0.12, 0.28, d - 0.14]} />
          <meshStandardMaterial color="#e6ddc9" roughness={0.95} />
        </mesh>
        {/* 담요 */}
        <mesh position={[0, 0.6, 0.12]} castShadow>
          <boxGeometry args={[w - 0.06, 0.14, d - 0.7]} />
          <meshStandardMaterial map={plaid} roughness={0.95} />
        </mesh>
        {/* 베개 */}
        {[-0.42, 0.42].map((dx) => (
          <mesh key={dx} position={[dx, 0.66, -d / 2 + 0.36]} rotation-x={-0.12} castShadow>
            <boxGeometry args={[0.68, 0.16, 0.34]} />
            <meshStandardMaterial color="#f2ead9" roughness={0.9} />
          </mesh>
        ))}
        {/* 머리판 */}
        <mesh position={[0, 0.72, d / 2 - 0.03]} castShadow>
          <boxGeometry args={[w + 0.06, 1.0, 0.1]} />
          <meshStandardMaterial map={planks} color="#6d4f36" roughness={1} />
        </mesh>
        {/* 다리 */}
        {[
          [-w / 2 + 0.08, -d / 2 + 0.08],
          [w / 2 - 0.08, -d / 2 + 0.08],
          [-w / 2 + 0.08, d / 2 - 0.08],
          [w / 2 - 0.08, d / 2 - 0.08],
        ].map(([dx, dz], i) => (
          <mesh key={i} position={[dx, -0.1, dz]}>
            <boxGeometry args={[0.12, 0.4, 0.12]} />
            <meshStandardMaterial color="#4e3928" roughness={1} />
          </mesh>
        ))}
      </group>
      {/* 협탁 + 램프 */}
      <group position={[x + w / 2 + 0.55, F2, z + d / 2 - 0.3]}>
        <mesh position={[0, 0.26, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.5, 0.52, 0.5]} />
          <meshStandardMaterial map={planks} color="#6a4d34" roughness={1} />
        </mesh>
        <mesh position={[0, 0.68, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.06, 0.3, 8]} />
          <meshStandardMaterial color="#5b4630" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.14, 0.2, 0.24, 12, 1, true]} />
          <meshStandardMaterial color="#f0d5a8" emissive="#ffb066" emissiveIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>
        <pointLight color="#ffc98f" intensity={1.2} distance={5} decay={2} position={[0, 0.9, 0]} />
      </group>
      {/* 러그 */}
      <mesh position={[FURNITURE.rug.x, F2 + 0.01, FURNITURE.rug.z]} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[1.55, 28]} />
        <meshStandardMaterial color="#7c5f4b" roughness={1} />
      </mesh>
      {/* 낮은 책장 */}
      <group position={[4.1, F2, 4.1 + 0.4]}>
        <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.1, 0.8, 0.36]} />
          <meshStandardMaterial map={planks} color="#63482f" roughness={1} />
        </mesh>
        {[0.18, 0.42, 0.66].map((y, i) => (
          <mesh key={i} position={[-0.3 + i * 0.05, y, 0.2]}>
            <boxGeometry args={[0.1, 0.2, 0.1]} />
            <meshStandardMaterial color={['#8a5a44', '#6f7d58', '#b08a5c'][i]} roughness={0.9} />
          </mesh>
        ))}
      </group>
      {/* 창가 좌석 */}
      <WindowSeat />
    </group>
  );
}

function WindowSeat() {
  const { x, z, w, d } = FURNITURE.windowSeat;
  const plaid = useMemo(() => plaidTexture(), []);
  const planks = useMemo(() => plankTexture(), []);
  return (
    <group position={[x, F2, z]}>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.4, d]} />
        <meshStandardMaterial map={planks} color="#6a4d34" roughness={1} />
      </mesh>
      <mesh position={[0, 0.44, 0]} castShadow>
        <boxGeometry args={[w - 0.1, 0.12, d - 0.08]} />
        <meshStandardMaterial color="#cbb18e" roughness={0.95} />
      </mesh>
      {[-0.7, 0.7].map((dx) => (
        <mesh key={dx} position={[dx, 0.58, 0.06]} rotation-y={dx * 0.1} castShadow>
          <boxGeometry args={[0.34, 0.16, 0.32]} />
          <meshStandardMaterial map={plaid} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function CabinLights() {
  const fire = useGame((s) => s.fire);
  return (
    <group>
      {/* 실내 기본 불빛 */}
      <pointLight position={[0, F2 - 0.4, 1]} color="#ffc58a" intensity={2.2} distance={14} decay={2} />
      <pointLight position={[2.4, F1 + 2.1, -2]} color="#ffd7a6" intensity={1.5} distance={11} decay={2} />
      {/* 벽난로 화광 */}
      <pointLight
        position={[FURNITURE.fireplace.x + 1.0, F1 + 0.8, FURNITURE.fireplace.z]}
        color="#ff9a4d"
        intensity={1.5 + fire.intensity * 4}
        distance={11}
        decay={2}
      />
      {/* 큰 창으로 들어오는 달빛 느낌 (은은한 푸른빛) */}
      <pointLight position={[0, F2 + 1.8, 3]} color="#9fb6e8" intensity={0.5} distance={9} decay={2} />
    </group>
  );
}

function ChimneySmoke() {
  const group = useRef<THREE.Group>(null);
  const glow = useMemo(() => glowTexture(), []);
  const puffs = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        offset: i / 9,
        speed: 0.055 + (i % 3) * 0.012,
        drift: (i % 2 === 0 ? 1 : -1) * (0.25 + (i % 3) * 0.12),
        size: 0.7 + (i % 4) * 0.22,
      })),
    [],
  );

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const puff = puffs[i];
      const life = (t * puff.speed + puff.offset) % 1;
      child.position.set(
        Math.sin(t * 0.35 + i) * 0.3 + puff.drift * life * 2.6,
        9.4 + life * 4.2,
        life * 1.4 + Math.cos(t * 0.4 + i) * 0.2,
      );
      const scale = puff.size * (0.5 + life * 2.4);
      child.scale.setScalar(scale);
      const material = (child as THREE.Sprite).material as THREE.SpriteMaterial;
      material.opacity = Math.sin(life * Math.PI) * 0.2;
    });
  });

  return (
    <group ref={group} position={[-5.65, 0, -1.7]}>
      {puffs.map((puff, i) => (
        <sprite key={i}>
          <spriteMaterial
            map={glow}
            color="#cfc8bd"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.NormalBlending}
          />
        </sprite>
      ))}
    </group>
  );
}

export function Cabin() {
  const { texture } = useWood();
  return (
    <group position={[CABIN_WORLD.x, 0, CABIN_WORLD.z]}>
      <FrontWall map={texture} />
      <InteriorWalls />
      <DoorFrame />
      <Roof />
      <Porch />
      <BigWindow />
      <Fireplace />
      <RockingChair />
      <Kitchen />
      <Bedroom />
      <CabinLights />
      <ChimneySmoke />
      {/* 창가 화분 */}
      <group position={[-3.6, F1 + 0.34, FRONT - 0.5]}>
        <mesh position={[0, 0.16, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.12, 0.3, 10]} />
          <meshStandardMaterial color="#8a5c42" roughness={1} />
        </mesh>
        <mesh position={[0, 0.4, 0]} castShadow>
          <icosahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial color="#5f7a44" roughness={1} flatShading />
        </mesh>
      </group>
    </group>
  );
}
