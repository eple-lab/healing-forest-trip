'use client';

/**
 * 다른 접속자들 (위치 보간 + 걷기/앉기/눕기 자세)
 * ── 성능 정책
 * - 지오메트리/머티리얼을 접속자와 무관하게 한 번만 만든다.
 * - 가까운 12명까지만 그리고 나머지는 건너뛴다.
 * - 25m 밖에 있는 사람은 그림자를 끕니다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '@/store/game';
import { playerState } from '@/lib/player-state';
import type { PublicPlayer } from '@/types/game';
import { plaidTexture } from '@/lib/textures';

const MAX_VISIBLE = 12;
const VISIBLE_DISTANCE = 72;
const NEAR_SHADOW_DISTANCE = 25;
const SELECT_INTERVAL = 0.4; // 초

const GEO = {
  leg: new THREE.CapsuleGeometry(0.105, 0.52, 4, 8),
  foot: new THREE.BoxGeometry(0.2, 0.14, 0.34),
  torso: new THREE.CapsuleGeometry(0.24, 0.5, 5, 10),
  pack: new THREE.BoxGeometry(0.38, 0.42, 0.2),
  packFlap: new THREE.BoxGeometry(0.24, 0.16, 0.06),
  arm: new THREE.CapsuleGeometry(0.075, 0.4, 4, 8),
  hand: new THREE.SphereGeometry(0.075, 8, 6),
  head: new THREE.SphereGeometry(0.19, 16, 12),
  hair: new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
  eye: new THREE.SphereGeometry(0.022, 6, 5),
  blanket: new THREE.BoxGeometry(0.52, 0.1, 0.46),
};

const pantsMat = new THREE.MeshStandardMaterial({ color: '#4e5f63', roughness: 0.95 });
const shoeMat = new THREE.MeshStandardMaterial({ color: '#3b3128', roughness: 1 });
const packMat = new THREE.MeshStandardMaterial({ color: '#7c5f3f', roughness: 1 });
const packFlapMat = new THREE.MeshStandardMaterial({ color: '#6a4e33', roughness: 1 });
const skinMat = new THREE.MeshStandardMaterial({ color: '#e2b48f', roughness: 0.85 });
const handMat = new THREE.MeshStandardMaterial({ color: '#e2b48f', roughness: 0.9 });
const hairMat = new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 1 });
const eyeMat = new THREE.MeshStandardMaterial({ color: '#26201b', roughness: 0.6 });

/* 몸통/팔 색은 서버 팔레트(8색)로 제한되므로 그대로 공유한다. */
const clothMats = new Map<string, THREE.MeshStandardMaterial>();
function clothMaterial(color: string) {
  const cached = clothMats.get(color);
  if (cached) return cached;
  const created = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  clothMats.set(color, created);
  return created;
}

let plaidMat: THREE.MeshStandardMaterial | null = null;
function blanketMaterial() {
  if (!plaidMat) {
    plaidMat = new THREE.MeshStandardMaterial({ map: plaidTexture(), roughness: 1 });
  }
  return plaidMat;
}

function nameTexture(name: string, color: string, guest: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = '600 52px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = name.slice(0, 14);
  const width = Math.min(480, ctx.measureText(text).width + 68);
  const x = (512 - width) / 2;
  ctx.fillStyle = 'rgba(22, 28, 22, 0.62)';
  ctx.beginPath();
  const r = 26;
  ctx.moveTo(x + r, 18);
  ctx.lineTo(x + width - r, 18);
  ctx.quadraticCurveTo(x + width, 18, x + width, 18 + r);
  ctx.lineTo(x + width, 110 - r);
  ctx.quadraticCurveTo(x + width, 110, x + width - r, 110);
  ctx.lineTo(x + r, 110);
  ctx.quadraticCurveTo(x, 110, x, 110 - r);
  ctx.lineTo(x, 18 + r);
  ctx.quadraticCurveTo(x, 18, x + r, 18);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#f5efe2';
  ctx.fillText(text, 256, 66);
  if (guest) {
    ctx.fillStyle = '#c9b98f';
    ctx.font = '400 26px "Malgun Gothic", sans-serif';
    ctx.fillText('나그네', 256, 102);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function RemotePlayer({ player, near }: { player: PublicPlayer; near: boolean }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const phase = useRef(Math.random() * Math.PI * 2);
  const target = useRef({ x: player.x, y: player.y, z: player.z, rot: player.rot });
  const current = useRef({ rot: player.rot });
  const cloth = useMemo(() => clothMaterial(player.color), [player.color]);
  const label = useMemo(
    () => nameTexture(player.name, player.color, player.guest),
    [player.name, player.color, player.guest],
  );

  useEffect(() => {
    target.current.x = player.x;
    target.current.y = player.y;
    target.current.z = player.z;
    target.current.rot = player.rot;
  }, [player.x, player.y, player.z, player.rot]);

  useEffect(() => {
    return () => {
      label?.dispose();
    };
  }, [label]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(0.06, rawDelta);
    const g = root.current;
    if (!g) return;
    const k = 1 - Math.exp(-delta * 11);
    const dx = target.current.x - g.position.x;
    const dz = target.current.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    g.position.x += dx * k;
    g.position.y += (target.current.y - g.position.y) * (1 - Math.exp(-delta * 14));
    g.position.z += dz * k;

    // 최단 회전 보간
    let diff = target.current.rot - current.current.rot;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    current.current.rot += diff * (1 - Math.exp(-delta * 12));
    g.rotation.y = current.current.rot;

    const walking = player.pose === 'walk' && dist > 0.015;
    const speed = Math.min(1, dist / Math.max(0.0001, delta) / 3.2);
    if (walking) phase.current += delta * (6.5 + speed * 4);

    if (body.current) {
      const lie = player.pose === 'lie';
      const sit = player.pose === 'sit';
      body.current.rotation.x += ((lie ? -Math.PI / 2 : sit ? -0.08 : 0) - body.current.rotation.x) * Math.min(1, delta * 8);
      body.current.position.y += ((lie ? 0.62 : sit ? -0.42 : 0) - body.current.position.y) * Math.min(1, delta * 8);
    }

    const swing = walking ? Math.sin(phase.current) * 0.55 : 0;
    const armSwing = walking ? Math.sin(phase.current) * 0.42 : 0;
    if (leftLeg.current) leftLeg.current.rotation.x += (swing - leftLeg.current.rotation.x) * Math.min(1, delta * 12);
    if (rightLeg.current) rightLeg.current.rotation.x += (-swing - rightLeg.current.rotation.x) * Math.min(1, delta * 12);
    if (leftArm.current) leftArm.current.rotation.x += (-armSwing - leftArm.current.rotation.x) * Math.min(1, delta * 12);
    if (rightArm.current) rightArm.current.rotation.x += (armSwing - rightArm.current.rotation.x) * Math.min(1, delta * 12);

    const sit = player.pose === 'sit';
    if (leftLeg.current) leftLeg.current.rotation.x += ((sit ? 1.32 : 0) - (sit ? leftLeg.current.rotation.x : 0)) * Math.min(1, delta * 8);
    if (rightLeg.current) rightLeg.current.rotation.x += ((sit ? 1.32 : 0) - (sit ? rightLeg.current.rotation.x : 0)) * Math.min(1, delta * 8);
  });

  const seated = player.pose === 'sit';
  const lying = player.pose === 'lie';
  const blanket = blanketMaterial();

  return (
    <group ref={root} position={[player.x, player.y, player.z]} rotation-y={player.rot}>
      <group ref={body}>
        {/* 다리 */}
        <group ref={leftLeg} position={[-0.16, 0.78, 0]}>
          <mesh position={[0, -0.36, 0]} geometry={GEO.leg} material={pantsMat} castShadow={near} />
          <mesh position={[0, -0.72, 0.06]} geometry={GEO.foot} material={shoeMat} castShadow={near} />
        </group>
        <group ref={rightLeg} position={[0.16, 0.78, 0]}>
          <mesh position={[0, -0.36, 0]} geometry={GEO.leg} material={pantsMat} castShadow={near} />
          <mesh position={[0, -0.72, 0.06]} geometry={GEO.foot} material={shoeMat} castShadow={near} />
        </group>

        {/* 몸통 */}
        <mesh position={[0, 1.16, 0]} geometry={GEO.torso} material={cloth} castShadow={near} />
        {/* 배낭 */}
        <mesh position={[0, 1.2, 0.24]} geometry={GEO.pack} material={packMat} castShadow={near} />
        <mesh position={[0, 1.22, 0.35]} geometry={GEO.packFlap} material={packFlapMat} castShadow={near} />

        {/* 팔 */}
        <group ref={leftArm} position={[-0.32, 1.36, 0]}>
          <mesh position={[0, -0.24, 0]} geometry={GEO.arm} material={cloth} castShadow={near} />
          <mesh position={[0, -0.48, 0]} geometry={GEO.hand} material={handMat} castShadow={near} />
        </group>
        <group ref={rightArm} position={[0.32, 1.36, 0]}>
          <mesh position={[0, -0.24, 0]} geometry={GEO.arm} material={cloth} castShadow={near} />
          <mesh position={[0, -0.48, 0]} geometry={GEO.hand} material={handMat} castShadow={near} />
        </group>

        {/* 머리 */}
        <group position={[0, 1.68, 0]}>
          <mesh geometry={GEO.head} material={skinMat} castShadow={near} />
          <mesh position={[0, 0.06, 0.03]} geometry={GEO.hair} material={hairMat} castShadow={near} />
          <mesh position={[-0.07, 0.02, -0.17]} geometry={GEO.eye} material={eyeMat} />
          <mesh position={[0.07, 0.02, -0.17]} geometry={GEO.eye} material={eyeMat} />
        </group>

        {/* 무릎담요 */}
        {player.blanket && (
          <mesh position={[0, seated || lying ? 1.06 : 0.86, -0.06]} geometry={GEO.blanket} material={blanket} castShadow={near} />
        )}
      </group>

      {/* 이름표 */}
      {label && (
        <sprite position={[0, 2.24, 0]} scale={[1.6, 0.4, 1]}>
          <spriteMaterial
            map={label}
            transparent
            depthWrite={false}
            depthTest
            sizeAttenuation
            toneMapped={false}
          />
        </sprite>
      )}
    </group>
  );
}

type VisibleEntry = { id: string; near: boolean };

function sameVisible(prev: VisibleEntry[], next: VisibleEntry[]) {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id || prev[i].near !== next[i].near) return false;
  }
  return true;
}

export function RemotePlayers() {
  const players = useGame((s) => s.players);
  const [visible, setVisible] = useState<VisibleEntry[]>([]);
  const lastSelect = useRef(Number.NEGATIVE_INFINITY);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastSelect.current < SELECT_INTERVAL) return;
    lastSelect.current = state.clock.elapsedTime;

    const px = playerState.x;
    const pz = playerState.z;
    const scored: { id: string; d2: number }[] = [];
    for (const p of players) {
      const dx = p.x - px;
      const dz = p.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 > VISIBLE_DISTANCE * VISIBLE_DISTANCE) continue;
      scored.push({ id: p.id, d2 });
    }
    scored.sort((a, b) => a.d2 - b.d2);
    const next = scored.slice(0, MAX_VISIBLE).map((s) => ({
      id: s.id,
      near: s.d2 <= NEAR_SHADOW_DISTANCE * NEAR_SHADOW_DISTANCE,
    }));
    setVisible((prev) => (sameVisible(prev, next) ? prev : next));
  });

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  return (
    <group>
      {visible.map(({ id, near }) => {
        const player = byId.get(id);
        return player ? <RemotePlayer key={id} player={player} near={near} /> : null;
      })}
    </group>
  );
}
