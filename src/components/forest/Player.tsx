'use client';

/**
 * 1인칭 플레이어
 * ─────────────────────────────────────────────
 * - WASD/방향키 걷기, Shift 달리기
 * - 마우스(포인터락) 또는 터치로 시점 회전
 * - 지형·계단·2층 바닥·가구 충돌 처리
 * - 그루터기/의자/침대에 앉으면 카메라가 그 자리로 이동
 * - 이동 상태를 소켓으로 전송 (서버가 위치를 검증)
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BOX_COLLIDERS,
  START,
  TREE_COLLIDERS,
  WORLD_BOUNDS,
  clamp,
  groundAt,
  terrainHeight,
  zoneAt,
} from '@/lib/world';
import { useGame } from '@/store/game';
import type { Seat } from '@/types/game';
import { inputState, consumeLook } from '@/lib/input';
import { consumeTeleport } from '@/lib/dev-tools';
import { playerState } from '@/lib/player-state';
import { audio } from '@/lib/audio';
import { getSocket } from '@/lib/socket';

const EYE = 1.62;
const RADIUS = 0.3;
const GRAVITY = 22;
const WALK_SPEED = 4;
const RUN_SPEED = 12;
const STEP_UP = 0.62;
// [FEAT-05] 이동·중력 계산 조각 크기와 한 프레임에서 따라잡을 최대 시간(4fps까지 실제 속도 유지)
const PHYSICS_STEP = 1 / 60;
const MAX_FRAME = 0.25;
const PITCH_LIMIT = 1.32;

const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

export function Player() {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const pointerLocked = useRef(false);
  const pos = useRef({ x: START.x, y: terrainHeight(START.x, START.z), z: START.z });
  const velY = useRef(0);
  const yaw = useRef(START.yaw);
  const pitch = useRef(0);
  const bob = useRef(0);
  const stepAccum = useRef(0);
  const lastEmit = useRef(0);
  const lastSignature = useRef('');
  const currentSurface = useRef<'grass' | 'dirt' | 'wood' | 'stone'>('dirt');
  const seatId = useRef<string | null>(null);
  // [BUG-01] 일어날 때 마지막으로 앉았던 Seat의 standX/standZ로 옮기기 위해 저장해 둔다
  const lastSeat = useRef<Seat | null>(null);
  const lookSensitivity = useRef(0.0022);
  const breathe = useRef(0);
  const fovTarget = useRef(68);

  const isCoarse = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
  }, []);

  /* ── 입력 ─────────────────────────────────── */
  useEffect(() => {
    const canvas = gl.domElement;

    const onKeyDown = (event: KeyboardEvent) => {
      const state = useGame.getState();
      if (state.chatOpen || state.helpOpen || isTypingTarget(event.target)) return;
      if (MOVE_KEYS.has(event.code) || event.code === 'Space') event.preventDefault();
      keys.current.add(event.code);
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        inputState.sprint = true;
      }
      if (state.seat && MOVE_KEYS.has(event.code)) {
        state.stand();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.current.delete(event.code);
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        inputState.sprint = false;
      }
    };
    const onBlur = () => {
      keys.current.clear();
      inputState.sprint = false;
      inputState.touchMoveX = 0;
      inputState.touchMoveY = 0;
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!pointerLocked.current) return;
      if (useGame.getState().chatOpen) return;
      const dx = event.movementX || 0;
      const dy = event.movementY || 0;
      if (Math.abs(dx) > 240 || Math.abs(dy) > 240) return; // 가끔 튀는 값 무시
      yaw.current -= dx * lookSensitivity.current;
      pitch.current = clamp(pitch.current - dy * lookSensitivity.current, -PITCH_LIMIT, PITCH_LIMIT);
    };

    const onPointerLockChange = () => {
      pointerLocked.current = document.pointerLockElement === canvas;
    };

    const onClick = () => {
      const state = useGame.getState();
      if (isCoarse || state.chatOpen || state.helpOpen || state.resting) return;
      if (document.pointerLockElement !== canvas) {
        const request = canvas.requestPointerLock?.();
        if (request && typeof (request as Promise<void>).catch === 'function') {
          (request as Promise<void>).catch(() => {});
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    canvas.addEventListener('click', onClick);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      canvas.removeEventListener('click', onClick);
    };
  }, [gl, isCoarse]);

  /* ── 충돌 ─────────────────────────────────── */
  const blocked = (x: number, z: number, feetY: number) => {
    for (const box of BOX_COLLIDERS) {
      if (feetY + 1.55 < box.y0 || feetY + 0.15 > box.y1) continue;
      if (
        x > box.x0 - RADIUS &&
        x < box.x1 + RADIUS &&
        z > box.z0 - RADIUS &&
        z < box.z1 + RADIUS
      ) {
        return true;
      }
    }
    for (const tree of TREE_COLLIDERS) {
      const dx = x - tree.x;
      const dz = z - tree.z;
      const r = tree.r + RADIUS;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  };

  const tryMove = (dx: number, dz: number, feetY: number) => {
    const nextX = clamp(pos.current.x + dx, -WORLD_BOUNDS.x, WORLD_BOUNDS.x);
    if (!blocked(nextX, pos.current.z, feetY)) pos.current.x = nextX;
    const nextZ = clamp(pos.current.z + dz, WORLD_BOUNDS.zMin, WORLD_BOUNDS.zMax);
    if (!blocked(pos.current.x, nextZ, feetY)) pos.current.z = nextZ;
  };

  useFrame((state, rawDelta) => {
    // 카메라 흔들림·숨쉬기·시야각 같은 화면 효과용(이전과 같다). 이동과 중력은 아래에서 나눠 계산한다.
    const delta = Math.min(0.05, rawDelta);
    const store = useGame.getState();
    const frozen = store.chatOpen || store.helpOpen || store.resting || store.noticeOpen;

    // [FEAT-15] 개발 모드 순간이동(배포본에서는 consumeTeleport 가 늘 null)
    const teleport = consumeTeleport();
    if (teleport) {
      if (store.seat) store.stand();
      seatId.current = null;
      lastSeat.current = null;
      pos.current.x = teleport.x;
      pos.current.z = teleport.z;
      pos.current.y = groundAt(teleport.x, teleport.z, terrainHeight(teleport.x, teleport.z)).y;
      velY.current = 0;
      yaw.current = teleport.yaw;
      pitch.current = 0;
    }

    const seat = teleport ? null : store.seat;

    /* 앉은 상태 */
    if (seat) {
      // [BUG-01] 일어날 때 참고할 수 있도록 현재 Seat을 저장해 둔다
      lastSeat.current = seat;
      if (seatId.current !== seat.id) {
        seatId.current = seat.id;
        yaw.current = seat.yaw;
        pitch.current = seat.kind === 'bed' ? 0.18 : -0.06;
        pos.current.x = seat.x;
        pos.current.z = seat.z;
        pos.current.y = seat.feetY;
        velY.current = 0;
        audio.creak();
      }
      playerState.seated = true;
      playerState.x = seat.x;
      playerState.z = seat.z;
      playerState.y = seat.feetY;
      playerState.yaw = yaw.current;

      // 시점 (터치 포함)
      const look = consumeLook();
      if (look.x || look.y) {
        yaw.current -= look.x * 0.0032;
        pitch.current = clamp(pitch.current - look.y * 0.0032, -PITCH_LIMIT, PITCH_LIMIT);
      }

      breathe.current += delta * 1.1;
      const breathY = Math.sin(breathe.current) * 0.006;
      camera.position.set(seat.x, seat.eyeY + breathY, seat.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw.current;
      camera.rotation.x = pitch.current;
      camera.rotation.z = seat.kind === 'bed' ? Math.sin(breathe.current * 0.5) * 0.01 : 0;
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov += (62 - camera.fov) * Math.min(1, delta * 4);
        camera.updateProjectionMatrix();
      }
      if (!frozen) emitMove(seat.x, seat.feetY, seat.z, yaw.current, false);
      return;
    }

    if (seatId.current) {
      // 일어나기
      seatId.current = null;
      // [BUG-01] 의자 좌표에 그대로 서면 의자 자신의 충돌 상자 안이라 막힌다 →
      // standX/standZ로 옮기고, 그래도 막히면 의자 중심에서 8방향으로 빈자리를 찾는다
      const last = lastSeat.current;
      if (last) {
        let tx = last.standX;
        let tz = last.standZ;
        let g = groundAt(tx, tz, last.feetY + 0.4);
        if (blocked(tx, tz, g.y)) {
          let found = false;
          for (let r = 0.3; r <= 2.0 && !found; r += 0.3) {
            for (let k = 0; k < 8; k++) {
              const a = (k * Math.PI) / 4;
              const cx = last.x + Math.cos(a) * r;
              const cz = last.z + Math.sin(a) * r;
              const cg = groundAt(cx, cz, last.feetY + 0.4);
              if (!blocked(cx, cz, cg.y)) {
                tx = cx;
                tz = cz;
                g = cg;
                found = true;
                break;
              }
            }
          }
        }
        pos.current.x = tx;
        pos.current.z = tz;
        pos.current.y = g.y;
      } else {
        const g = groundAt(pos.current.x, pos.current.z, pos.current.y + 0.4);
        pos.current.y = Math.max(g.y, pos.current.y);
      }
      velY.current = 0;
    }

    /* 시점 */
    const look = consumeLook();
    if (look.x || look.y) {
      yaw.current -= look.x * 0.0032;
      pitch.current = clamp(pitch.current - look.y * 0.0032, -PITCH_LIMIT, PITCH_LIMIT);
    }

    /* 이동 입력 */
    let forward = 0;
    let strafe = 0;
    if (!frozen) {
      if (keys.current.has('KeyW') || keys.current.has('ArrowUp')) forward += 1;
      if (keys.current.has('KeyS') || keys.current.has('ArrowDown')) forward -= 1;
      if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) strafe += 1;
      if (keys.current.has('KeyA') || keys.current.has('ArrowLeft')) strafe -= 1;
      forward += inputState.touchMoveY;
      strafe += inputState.touchMoveX;
    }

    const magnitude = Math.hypot(forward, strafe);
    const running =
      !frozen &&
      (keys.current.has('ShiftLeft') || keys.current.has('ShiftRight') || inputState.sprint);

    const moving = magnitude > 0.05;
    let speed = 0;
    let dirX = 0;
    let dirZ = 0;
    if (moving) {
      const norm = Math.min(1, magnitude);
      speed = (running ? RUN_SPEED : WALK_SPEED) * norm;
      const fwdX = -Math.sin(yaw.current);
      const fwdZ = -Math.cos(yaw.current);
      const rightX = Math.cos(yaw.current);
      const rightZ = -Math.sin(yaw.current);
      dirX = (fwdX * forward + rightX * strafe) / (magnitude || 1);
      dirZ = (fwdZ * forward + rightZ * strafe) / (magnitude || 1);
      bob.current += delta * (running ? 11.5 : 7.4) * norm;
    }

    // [FEAT-05] 한 프레임을 0.05초로 잘라 20fps 미만에서 이동이 슬로모션이 됐다 →
    // 실제 흐른 시간(최대 MAX_FRAME)을 PHYSICS_STEP 이하 조각으로 나눠 이동·걸음·중력을 계산한다.
    // 한 조각의 이동 거리는 60fps 때와 같아(달리기 0.2m) 벽·가구를 뚫을 위험은 늘지 않는다.
    let remaining = Math.min(MAX_FRAME, rawDelta);
    let ground: ReturnType<typeof groundAt>;
    do {
      const dt = Math.min(PHYSICS_STEP, remaining);
      remaining -= dt;

      if (moving) {
        tryMove(dirX * speed * dt, dirZ * speed * dt, pos.current.y);
        stepAccum.current += speed * dt;
        if (stepAccum.current > (running ? 2.0 : 1.72)) {
          stepAccum.current = 0;
          // [FEAT-01] 걸음마다 함께 울리던 높은 rustle("탁탁")을 빼고 발소리만 낸다.
          audio.footprint(currentSurface.current, running);
        }
      }

      /* 중력과 지면 */
      ground = groundAt(pos.current.x, pos.current.z, pos.current.y);
      if (ground.y > pos.current.y && ground.y - pos.current.y <= STEP_UP) {
        // 계단/턱 오르기
        pos.current.y = ground.y;
        velY.current = 0;
      } else if (ground.y < pos.current.y - 0.04) {
        velY.current -= GRAVITY * dt;
        pos.current.y += velY.current * dt;
        if (pos.current.y <= ground.y) {
          pos.current.y = ground.y;
          velY.current = 0;
        }
      } else {
        pos.current.y = ground.y;
        velY.current = 0;
      }
      currentSurface.current = ground.surface;
    } while (remaining > 1e-6);

    /* 카메라 */
    const bobAmount = magnitude > 0.05 ? (running ? 0.045 : 0.03) : 0;
    const bobY = Math.sin(bob.current) * bobAmount;
    const bobX = Math.cos(bob.current * 0.5) * bobAmount * 0.6;
    breathe.current += delta * 1.4;
    const idleBreath = magnitude > 0.05 ? 0 : Math.sin(breathe.current) * 0.008;
    camera.position.set(
      pos.current.x + bobX,
      pos.current.y + EYE + bobY + idleBreath,
      pos.current.z,
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;
    camera.rotation.z = 0;

    if (camera instanceof THREE.PerspectiveCamera) {
      fovTarget.current = running && magnitude > 0.05 ? 73 : 68;
      camera.fov += (fovTarget.current - camera.fov) * Math.min(1, delta * 5);
      camera.updateProjectionMatrix();
    }

    /* 공유 상태 */
    playerState.x = pos.current.x;
    playerState.y = pos.current.y;
    playerState.z = pos.current.z;
    playerState.yaw = yaw.current;
    playerState.pitch = pitch.current;
    playerState.moving = magnitude > 0.05;
    playerState.running = running && magnitude > 0.05;
    playerState.surface = ground.surface;
    playerState.seated = false;

    audio.setListener(pos.current.x, pos.current.z);

    /* zone */
    const zone = zoneAt(pos.current.x, pos.current.z);
    if (zone !== store.zone) store.setZone(zone);

    if (!frozen) {
      emitMove(
        pos.current.x,
        pos.current.y,
        pos.current.z,
        yaw.current,
        running && magnitude > 0.05,
      );
    }
    void state;
  });

  function emitMove(x: number, y: number, z: number, rot: number, walkPose: boolean) {
    const now = performance.now();
    if (now - lastEmit.current < 90) return;
    const store = useGame.getState();
    const pose = store.seat ? store.pose : walkPose ? 'walk' : 'idle';
    const signature = `${x.toFixed(2)}:${y.toFixed(2)}:${z.toFixed(2)}:${rot.toFixed(2)}:${pose}:${store.blanketOn}`;
    if (signature === lastSignature.current && now - lastEmit.current < 1200) return;
    lastSignature.current = signature;
    lastEmit.current = now;
    getSocket().emit('move', {
      x,
      y,
      z,
      rot,
      pose,
      blanket: store.blanketOn,
    });
  }

  return null;
}
