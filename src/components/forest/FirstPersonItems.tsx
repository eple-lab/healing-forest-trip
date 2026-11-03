'use client';

/** 1인칭 손에 든 물건 (장작 · 머그 · 무릎담요) */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '@/store/game';
import { plaidTexture, woodTexture } from '@/lib/textures';

function Mug({ coffee, lift }: { coffee: boolean; lift: number }) {
  return (
    <group
      position={[0.27 - lift * 0.1, -0.26 + lift * 0.22, -0.52 + lift * 0.06]}
      rotation={[0, -0.5, lift * -0.25]}
    >
      <mesh>
        <cylinderGeometry args={[0.062, 0.052, 0.115, 16, 1, true]} />
        <meshStandardMaterial
          color="#efe3cc"
          roughness={0.55}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>
      <mesh position={[0, -0.056, 0]} rotation-x={Math.PI / 2}>
        <circleGeometry args={[0.052, 16]} />
        <meshStandardMaterial color="#e3d6be" roughness={0.6} depthTest={false} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.058, 16]} />
        <meshStandardMaterial
          color={coffee ? '#5a3621' : '#bcd9e2'}
          roughness={0.25}
          metalness={0.05}
          depthTest={false}
        />
      </mesh>
      <mesh position={[0.076, 0, 0]} rotation-z={Math.PI / 2}>
        <torusGeometry args={[0.036, 0.011, 6, 14]} />
        <meshStandardMaterial color="#efe3cc" roughness={0.55} depthTest={false} />
      </mesh>
      {/* 김 */}
      {coffee && (
        <sprite position={[0, 0.14, 0]} scale={[0.16, 0.2, 1]}>
          <spriteMaterial
            color="#fff2dd"
            transparent
            opacity={0.16}
            depthTest={false}
            depthWrite={false}
          />
        </sprite>
      )}
    </group>
  );
}

function HeldLog() {
  const bark = useMemo(() => woodTexture('#5b4129'), []);
  return (
    <group position={[0.3, -0.36, -0.6]} rotation={[0.25, 0.3, 0.9]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.075, 0.085, 0.6, 9]} />
        <meshStandardMaterial map={bark} color="#6b4c31" roughness={1} depthTest={false} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.075, 12]} />
        <meshStandardMaterial color="#c3a476" roughness={0.9} depthTest={false} />
      </mesh>
      <mesh position={[0, -0.3, 0]} rotation-x={Math.PI / 2}>
        <circleGeometry args={[0.085, 12]} />
        <meshStandardMaterial color="#b39164" roughness={0.9} depthTest={false} />
      </mesh>
    </group>
  );
}

function LapBlanket() {
  const plaid = useMemo(() => plaidTexture(), []);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.rotation.x = -0.34 + Math.sin(t * 0.7) * 0.008;
    mesh.current.position.y = -0.5 + Math.sin(t * 0.9) * 0.004;
  });
  return (
    <mesh ref={mesh} position={[0, -0.5, -0.82]} rotation-x={-0.34}>
      <planeGeometry args={[0.95, 0.5, 12, 6]} />
      <meshStandardMaterial
        map={plaid}
        roughness={0.95}
        side={THREE.DoubleSide}
        depthTest={false}
      />
    </mesh>
  );
}

export function FirstPersonItems() {
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const drink = useGame((s) => s.drink);
  const holdingLog = useGame((s) => s.holdingLog);
  const blanketOn = useGame((s) => s.blanketOn);
  const seat = useGame((s) => s.seat);
  const drinkSince = useRef(0);
  const lift = useRef(0);
  const sway = useRef(0);

  useEffect(() => {
    drinkSince.current = performance.now();
  }, [drink]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    const elapsed = (performance.now() - drinkSince.current) / 1000;
    const target = drink ? Math.min(1, Math.max(0, (elapsed - 0.25) / 0.5)) : 0;
    lift.current += (target - lift.current) * Math.min(1, delta * 6);
    sway.current = Math.sin(state.clock.elapsedTime * 1.6) * 0.006;
  });

  return (
    <group ref={group}>
      <group position={[0, 0, 0]} rotation={[0, 0, sway.current]}>
        {holdingLog && <HeldLog />}
        {drink && <Mug coffee={drink === 'coffee'} lift={lift.current} />}
        {blanketOn && (seat?.kind === 'chair' || seat?.kind === 'window' || !seat) && (
          <LapBlanket />
        )}
      </group>
    </group>
  );
}
