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
import { inputState, consumeLook } from '@/lib/input';
import { playerState } from '@/lib/player-state';
import { audio } from '@/lib/audio';
import { getSocket } from '@/lib/socket';

const EYE = 1.62;
const RADIUS = 0.3;
const GRAVITY = 22;
const WALK_SPEED = 2.35;
const RUN_SPEED = 4.25;
const STEP_UP = 0.62;
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
    const delta = Math.min(0.05, rawDelta);
    const store = useGame.getState();
    const frozen = store.chatOpen || store.helpOpen || store.resting;
    const seat = store.seat;

    /* 앉은 상태 */
    if (seat) {
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
      const g = groundAt(pos.current.x, pos.current.z, pos.current.y + 0.4);
      pos.current.y = Math.max(g.y, pos.current.y);
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

    if (magnitude > 0.05) {
      const norm = Math.min(1, magnitude);
      const speed = (running ? RUN_SPEED : WALK_SPEED) * norm;
      const fwdX = -Math.sin(yaw.current);
      const fwdZ = -Math.cos(yaw.current);
      const rightX = Math.cos(yaw.current);
      const rightZ = -Math.sin(yaw.current);
      const dirX = (fwdX * forward + rightX * strafe) / (magnitude || 1);
      const dirZ = (fwdZ * forward + rightZ * strafe) / (magnitude || 1);
      tryMove(dirX * speed * delta, dirZ * speed * delta, pos.current.y);

      bob.current += delta * (running ? 11.5 : 7.4) * norm;
      stepAccum.current += speed * delta;
      if (stepAccum.current > (running ? 2.0 : 1.72)) {
        stepAccum.current = 0;
        audio.footprint(currentSurface.current, running);
        audio.rustle();
      }
    }

    /* 중력과 지면 */
    const ground = groundAt(pos.current.x, pos.current.z, pos.current.y);
    if (ground.y > pos.current.y && ground.y - pos.current.y <= STEP_UP) {
      // 계단/턱 오르기
      pos.current.y = ground.y;
      velY.current = 0;
    } else if (ground.y < pos.current.y - 0.04) {
      velY.current -= GRAVITY * delta;
      pos.current.y += velY.current * delta;
      if (pos.current.y <= ground.y) {
        pos.current.y = ground.y;
        velY.current = 0;
      }
    } else {
      pos.current.y = ground.y;
      velY.current = 0;
    }
    currentSurface.current = ground.surface;

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
