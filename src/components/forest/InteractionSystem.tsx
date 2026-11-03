'use client';

/**
 * 상호작용 시스템
 * ─────────────────────────────────────────────
 * 가까이 가면 HUD 에 "E · 앉기" 같은 안내가 뜬다.
 * 그루터기·벤치·흔들의자·창가·침대에 앉고,
 * 장작·담요·커피·물·벽난로를 다룰 수 있다.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CABIN,
  CLEARING,
  CLEARING_BENCHES,
  FURNITURE,
  STUMPS,
  terrainHeight,
  yawToward,
} from '@/lib/world';
import type { Seat } from '@/types/game';
import { useGame } from '@/store/game';
import { playerState } from '@/lib/player-state';
import { audio } from '@/lib/audio';
import { getSocket } from '@/lib/socket';
import { interactionBus } from '@/lib/interaction-bus';
import { glowTexture } from '@/lib/textures';

/* ── 좌석 정의 ────────────────────────────── */

const stumpSeats: Seat[] = STUMPS.map((stump) => {
  const ground = terrainHeight(stump.x, stump.z);
  const fx = -Math.sin(stump.facing);
  const fz = -Math.cos(stump.facing);
  return {
    id: `seat-${stump.id}`,
    kind: 'stump',
    label: '그루터기에 앉기',
    eyeY: ground + stump.h + 1.16,
    feetY: ground + stump.h,
    x: stump.x,
    z: stump.z,
    yaw: stump.facing,
    standX: stump.x + fx * 0.95,
    standZ: stump.z + fz * 0.95,
  };
});

const benchSeats: Seat[] = CLEARING_BENCHES.map((bench, index) => {
  const ground = terrainHeight(bench.x, bench.z);
  const toCenter = yawToward(bench.x, bench.z, CLEARING.x, CLEARING.z);
  return {
    id: `seat-bench-${index}`,
    kind: 'chair',
    label: '통나무 벤치에 앉기',
    eyeY: ground + 1.18,
    feetY: ground,
    x: bench.x,
    z: bench.z - 0.15,
    yaw: toCenter,
    standX: bench.x + Math.cos(bench.angle) * 1.1,
    standZ: bench.z + Math.sin(bench.angle) * 1.1,
  };
});

const rockingSeat: Seat = {
  id: 'seat-rocking',
  kind: 'chair',
  label: '흔들의자에 앉기',
  eyeY: CABIN.floor1 + 1.17,
  feetY: CABIN.floor1,
  x: FURNITURE.rockingChair.x,
  z: FURNITURE.rockingChair.z,
  yaw: FURNITURE.rockingChair.facing,
  standX: FURNITURE.rockingChair.x + 0.85,
  standZ: FURNITURE.rockingChair.z,
};

const windowSeat: Seat = {
  id: 'seat-window',
  kind: 'window',
  label: '큰 창가에 앉기',
  eyeY: CABIN.floor2 + 1.12,
  feetY: CABIN.floor2,
  x: 0.15,
  z: -147.92,
  yaw: Math.PI,
  standX: 0.15,
  standZ: -149.2,
};

const bedSeat: Seat = {
  id: 'seat-bed',
  kind: 'bed',
  label: '침대에 눕기',
  eyeY: CABIN.floor2 + 0.66,
  feetY: CABIN.floor2,
  x: -2.6,
  z: -154.7,
  yaw: Math.PI,
  standX: -2.6,
  standZ: -152.9,
};

export const SEATS: Seat[] = [
  ...stumpSeats,
  ...benchSeats,
  rockingSeat,
  windowSeat,
  bedSeat,
];

/* ── 상호작용 지점 ─────────────────────────── */

type Target = {
  id: string;
  label: string;
  hint?: string;
  x: number;
  z: number;
  radius: number;
  action: () => void;
  seat?: Seat;
};

const SIGNS = [
  {
    id: 'sign-start',
    x: 2.8,
    z: 67,
    text: '숲속여행 · 산길 초입. 천천히 걸어가세요.',
  },
  {
    id: 'sign-clearing',
    x: 3.1,
    z: -45,
    text: '숲의 빈터. 불을 피우고 이야기를 나누는 곳.',
  },
  {
    id: 'sign-cabin',
    x: 3.2,
    z: -143.5,
    text: '오두막. 문을 열고 들어가 불을 지펴 보세요.',
  },
];

function standUp() {
  const store = useGame.getState();
  const seat = store.seat;
  if (!seat) return;
  store.stand();
  audio.creak();
  // 실제 위치는 Player 가 좌석 해제 시 재계산한다.
  playerState.seated = false;
}

function takeDrink(kind: 'coffee' | 'water') {
  const store = useGame.getState();
  store.takeDrink(kind);
  audio.sip();
  store.flashWarmth();
  window.setTimeout(() => {
    useGame.getState().finishDrink();
  }, 4200);
}

function buildTargets(): Target[] {
  const store = useGame.getState();
  const targets: Target[] = [];

  /* 앉아 있을 때 */
  if (store.seat) {
    targets.push({
      id: 'stand-up',
      label: '일어나기',
      hint: '몸을 일으켜 다시 걷습니다',
      x: store.seat.x,
      z: store.seat.z,
      radius: 2.4,
      action: standUp,
    });
    if (
      (store.seat.kind === 'chair' || store.seat.kind === 'window') &&
      store.hasBlanket &&
      !store.blanketOn
    ) {
      targets.push({
        id: 'cover-blanket',
        label: '무릎담요 덮기',
        hint: '옆에 둔 담요를 끌어온다',
        x: store.seat.x,
        z: store.seat.z,
        radius: 2.4,
        action: () => {
          useGame.getState().coverBlanket();
          audio.rustle();
        },
      });
    }
    if (
      (store.seat.kind === 'chair' || store.seat.kind === 'window') &&
      store.blanketOn
    ) {
      targets.push({
        id: 'uncover-blanket',
        label: '담요 걷기',
        x: store.seat.x,
        z: store.seat.z,
        radius: 2.4,
        action: () => {
          useGame.getState().uncoverBlanket();
          audio.rustle();
        },
      });
    }
    if (store.seat.kind === 'bed') {
      targets.push({
        id: 'rest',
        label: store.resting ? '일어나기' : '눈을 붙이기',
        hint: store.resting ? '조용히 쉬는 중' : '잠시 세상 소리를 멀리한다',
        x: store.seat.x,
        z: store.seat.z,
        radius: 2.4,
        action: () => {
          const state = useGame.getState();
          if (state.resting) {
            state.setResting(false);
          } else {
            state.setResting(true);
            audio.creak();
          }
        },
      });
    }
    return targets;
  }

  /* 좌석 */
  for (const seat of SEATS) {
    targets.push({
      id: seat.id,
      label: seat.label,
      hint: 'E 키로 앉습니다',
      x: seat.x,
      z: seat.z,
      radius: seat.kind === 'stump' ? 1.75 : 2.0,
      seat,
      action: () => {
        useGame.getState().sit(seat);
        audio.creak();
      },
    });
  }

  /* 벽난로 */
  targets.push({
    id: 'fireplace',
    label: store.holdingLog ? '장작을 벽난로에 넣기' : '벽난로를 들여다보기',
    hint: store.holdingLog ? '불이 크게 타오릅니다' : '장작더미에서 장작을 주워 오세요',
    x: FURNITURE.fireplace.x + 0.9,
    z: FURNITURE.fireplace.z,
    radius: 2.1,
    action: () => {
      const state = useGame.getState();
      if (!state.holdingLog) {
        state.showToast('장작더미에서 장작을 한 개 주워 오세요.', 'info');
        return;
      }
      getSocket().emit('fire:add');
      state.useLog();
      state.addFire({ logs: 1, intensity: 0.22 });
      state.flashWarmth();
      state.showToast('장작이 타오른다. 불꽃이 춤을 춘다.', 'warm');
      audio.logDrop();
    },
  });

  /* 장작더미 (밖) */
  targets.push({
    id: 'woodpile',
    label: store.holdingLog ? '장작을 내려놓기' : '장작 한 개 줍기',
    hint: store.holdingLog ? '이미 장작을 들고 있다' : '벽난로에 넣을 장작',
    x: FURNITURE.woodpile.x,
    z: FURNITURE.woodpile.z,
    radius: 2.2,
    action: () => {
      const state = useGame.getState();
      if (state.holdingLog) {
        state.useLog();
        state.showToast('장작을 제자리에 내려놓았다.', 'info');
      } else {
        state.takeLog();
        audio.rustle();
      }
    },
  });

  /* 무릎담요 테이블 */
  targets.push({
    id: 'blanket-table',
    label: store.hasBlanket ? '담요를 접어두기' : '무릎담요 집기',
    hint: store.hasBlanket ? undefined : '흔들의자에 앉아 덮을 수 있다',
    x: FURNITURE.blanketTable.x,
    z: FURNITURE.blanketTable.z,
    radius: 1.6,
    action: () => {
      const state = useGame.getState();
      if (state.hasBlanket) {
        state.dropBlanket();
      } else {
        state.pickBlanket();
        audio.rustle();
      }
    },
  });

  /* 주방 */
  targets.push({
    id: 'fridge',
    label: '시원한 물 꺼내기',
    hint: '냉장고 안의 물병',
    x: FURNITURE.fridge.x,
    z: FURNITURE.fridge.z,
    radius: 1.75,
    action: () => takeDrink('water'),
  });
  targets.push({
    id: 'coffee',
    label: '따뜻한 커피 따르기',
    hint: '보글보글 끓는 커피포트',
    x: FURNITURE.coffee.x,
    z: FURNITURE.coffee.z,
    radius: 1.6,
    action: () => takeDrink('coffee'),
  });
  targets.push({
    id: 'sink',
    label: '물 한 잔 받기',
    hint: '차가운 샘물',
    x: FURNITURE.sink.x,
    z: FURNITURE.sink.z,
    radius: 1.5,
    action: () => takeDrink('water'),
  });

  /* 빈터 화덕 */
  targets.push({
    id: 'clearing-fire',
    label: '화덕 곁에서 손을 녹이기',
    x: CLEARING.x,
    z: CLEARING.z,
    radius: 2.6,
    action: () => {
      const state = useGame.getState();
      state.flashWarmth();
      state.showToast('따뜻한 기운이 손끝까지 번진다.', 'warm');
    },
  });

  /* 표지판 */
  for (const sign of SIGNS) {
    targets.push({
      id: sign.id,
      label: '표지판 읽기',
      x: sign.x,
      z: sign.z,
      radius: 2.4,
      action: () => {
        useGame.getState().showToast(sign.text, 'info');
      },
    });
  }

  return targets;
}

/* ── 3D 표시 ──────────────────────────────── */

function InteractionGlow({ target }: { target: { x: number; z: number; seat?: Seat } }) {
  const ring = useRef<THREE.Mesh>(null);
  const sprite = useRef<THREE.Sprite>(null);
  const glow = useMemo(() => glowTexture(), []);
  const baseY = target.seat
    ? target.seat.kind === 'stump'
      ? target.seat.feetY + 0.02
      : target.seat.feetY + 0.05
    : terrainHeight(target.x, target.z) + 0.06;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring.current) {
      const pulse = 1 + Math.sin(t * 2.6) * 0.12;
      ring.current.scale.setScalar(pulse);
      ring.current.rotation.z = t * 0.5;
    }
    if (sprite.current) {
      sprite.current.position.y = 0.55 + Math.sin(t * 1.8) * 0.05;
      const material = sprite.current.material as THREE.SpriteMaterial;
      material.opacity = 0.5 + Math.sin(t * 2.6) * 0.16;
    }
  });

  return (
    <group position={[target.x, baseY, target.z]}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.01}>
        <ringGeometry args={[0.46, 0.56, 32]} />
        <meshBasicMaterial
          color="#ffe6b8"
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <sprite ref={sprite} scale={[0.5, 0.5, 1]} position={[0, 0.55, 0]}>
        <spriteMaterial
          map={glow}
          color="#ffe2a8"
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/* ── 메인 ────────────────────────────────── */

export function InteractionSystem() {
  const targetsRef = useRef<Target[]>([]);
  const currentRef = useRef<Target | null>(null);
  const sinceCheck = useRef(0);
  const interaction = useGame((s) => s.interaction);

  const runCurrent = () => {
    const target = currentRef.current;
    if (!target) return;
    target.action();
    sinceCheck.current = 999; // 즉시 갱신
  };

  useEffect(() => {
    interactionBus.current = runCurrent;
    return () => {
      interactionBus.current = null;
    };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' && event.code !== 'Enter') return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      const store = useGame.getState();
      if (store.chatOpen || store.helpOpen) return;
      if (store.seat) {
        event.preventDefault();
        if (store.seat.kind === 'bed' && event.code === 'Enter') return;
        const rest = store.resting;
        if (rest) {
          store.setResting(false);
          return;
        }
      }
      const hasInteraction = Boolean(currentRef.current);
      if (hasInteraction) {
        event.preventDefault();
        runCurrent();
      } else if (store.seat) {
        event.preventDefault();
        standUp();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useFrame((_, delta) => {
    sinceCheck.current += delta;
    if (sinceCheck.current < 0.09) return;
    sinceCheck.current = 0;

    const store = useGame.getState();
    targetsRef.current = buildTargets();

    let best: Target | null = null;
    let bestDistance = Infinity;
    for (const target of targetsRef.current) {
      const distance = Math.hypot(playerState.x - target.x, playerState.z - target.z);
      if (distance > target.radius) continue;
      // 화면 방향도 고려: 너무 등지고 있으면 제외 (앉은 상태 제외)
      if (!store.seat) {
        const toX = target.x - playerState.x;
        const toZ = target.z - playerState.z;
        const forwardX = -Math.sin(playerState.yaw);
        const forwardZ = -Math.cos(playerState.yaw);
        const dot =
          distance < 0.001 ? 1 : (toX * forwardX + toZ * forwardZ) / distance;
        if (dot < -0.25) continue;
      }
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
    currentRef.current = best;

    store.setInteraction(
      best
        ? {
            id: best.id,
            label: best.label,
            hint: best.hint,
            enabled: true,
            x: best.x,
            z: best.z,
            distance: bestDistance,
          }
        : null,
    );
  });

  const target = interaction
    ? targetsRef.current.find((item) => item.id === interaction.id)
    : null;

  return target ? <InteractionGlow target={target} /> : null;
}
