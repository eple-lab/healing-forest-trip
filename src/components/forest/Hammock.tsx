'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HAMMOCK, terrainHeight } from '@/lib/world';
import { useClock } from '@/store/game';
import { currentKoreaClock, sunState } from '@/lib/time';

/**
 * [FEAT-11] 모닥불 북쪽(-z) 해먹과 줄조명(가랜드).
 * 해먹에 누우면 하늘을 보고, 밤에는 발광 전구가 은은하게 빛난다(빛 pointLight 없음).
 */
const WOOD = '#5a422f';
const BULB = '#ffd58a';

type StringDef = {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  sag: number;
  count: number;
};

function stringPoint(s: StringDef, t: number) {
  return {
    x: s.x0 + (s.x1 - s.x0) * t,
    y: s.y0 + (s.y1 - s.y0) * t - s.sag * Math.sin(Math.PI * t),
    z: s.z0 + (s.z1 - s.z0) * t,
  };
}

function useNight() {
  return () => sunState(currentKoreaClock(useClock.getState().now || Date.now())).night;
}

function HammockCloth() {
  const ground = terrainHeight(HAMMOCK.center.x, HAMMOCK.center.z);
  const geometry = useMemo(() => {
    const segments = 20;
    const width = HAMMOCK.cloth.width;
    const lowest = ground + HAMMOCK.cloth.lowestY;
    const sag = HAMMOCK.cloth.sag;
    // 양 끝 높이 = 가장 낮은 곳 + 처짐. 가운데(t=0.5)에서 lowest.
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = HAMMOCK.posts[0].x + (HAMMOCK.posts[1].x - HAMMOCK.posts[0].x) * t;
      const z = HAMMOCK.posts[0].z + (HAMMOCK.posts[1].z - HAMMOCK.posts[0].z) * t;
      const y = lowest + sag * Math.pow(2 * t - 1, 2);
      // 폭은 z 방향(남북)으로 준다.
      positions.push(x, y, z - width / 2, x, y, z + width / 2);
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [ground]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#c9b28a" roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Garlands() {
  const night = useNight();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const bulbMaterial = useRef<THREE.MeshStandardMaterial>(null);

  const strings = HAMMOCK.strings as StringDef[];

  const bulbs = useMemo(() => {
    const out: { x: number; y: number; z: number }[] = [];
    for (const s of strings) {
      for (let i = 0; i < s.count; i++) {
        const t = (i + 0.5) / s.count;
        out.push(stringPoint(s, t));
      }
    }
    return out;
  }, [strings]);

  const wires = useMemo(
    () =>
      strings.map((s) => {
        const steps = 24;
        const pts = Array.from({ length: steps + 1 }, (_, i) => {
          const p = stringPoint(s, i / steps);
          return new THREE.Vector3(p.x, p.y, p.z);
        });
        return new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: '#3a2c1f' }),
        );
      }),
    [strings],
  );

  useEffect(
    () => () => {
      for (const line of wires) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    },
    [wires],
  );

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    bulbs.forEach((bulb, index) => {
      dummy.position.set(bulb.x, bulb.y, bulb.z);
      dummy.updateMatrix();
      mesh.current?.setMatrixAt(index, dummy.matrix);
    });
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  }, [bulbs]);

  useFrame(() => {
    if (bulbMaterial.current) bulbMaterial.current.emissiveIntensity = 0.5 + night() * 1.5;
  });

  return (
    <group>
      {wires.map((line, index) => (
        <primitive key={index} object={line} />
      ))}
      <instancedMesh ref={mesh} args={[undefined, undefined, bulbs.length]} frustumCulled={false}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial
          ref={bulbMaterial}
          color={BULB}
          emissive={BULB}
          emissiveIntensity={0.5}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

export function Hammock() {
  const posts = [...HAMMOCK.posts, HAMMOCK.garlandPost];

  return (
    <group>
      {posts.map((post, i) => {
        const ground = terrainHeight(post.x, post.z);
        return (
          <mesh key={i} position={[post.x, ground + post.h / 2, post.z]} castShadow receiveShadow>
            <cylinderGeometry args={[0.06, 0.06, post.h, 8]} />
            <meshStandardMaterial color={WOOD} roughness={1} />
          </mesh>
        );
      })}
      <HammockCloth />
      <Garlands />
    </group>
  );
}
