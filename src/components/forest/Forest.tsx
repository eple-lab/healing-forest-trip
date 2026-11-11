'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  BUSHES,
  CABIN,
  ROCKS,
  TREES,
  TUFTS,
  loopSpot,
  terrainHeight,
  type Tree,
} from '@/lib/world';

type LayerItem = { matrix: THREE.Matrix4; color?: THREE.Color };

function treeLayer(
  kind: Tree['kind'],
  localY: number,
  options: { scaleY?: number; color?: (tree: Tree) => THREE.Color } = {},
): LayerItem[] {
  const result: LayerItem[] = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (const tree of TREES) {
    if (tree.kind !== kind) continue;
    position.set(tree.x, terrainHeight(tree.x, tree.z) + localY * tree.scale, tree.z);
    quaternion.setFromAxisAngle(up, tree.rot);
    scale.set(tree.scale, tree.scale * (options.scaleY ?? 1), tree.scale);
    matrix.compose(position, quaternion, scale);
    result.push({
      matrix: matrix.clone(),
      color: options.color?.(tree),
    });
  }
  return result;
}

function InstanceLayer({
  geometry,
  material,
  items,
  castShadow = true,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: LayerItem[];
  castShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < items.length; i++) {
      mesh.setMatrixAt(i, items[i].matrix);
      if (items[i].color) mesh.setColorAt(i, items[i].color!);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={false}
      frustumCulled={false}
    />
  );
}

function forestColor(tree: Tree, kind: 'pine' | 'oak', layer = 0) {
  const color = new THREE.Color();
  if (kind === 'pine') {
    color.setHSL(0.31 + tree.tint * 0.035, 0.3 + tree.tint * 0.14, 0.17 + tree.tint * 0.07 + layer * 0.012);
  } else {
    color.setHSL(0.24 + tree.tint * 0.06, 0.36 + tree.tint * 0.14, 0.24 + tree.tint * 0.1 + layer * 0.015);
  }
  return color;
}

function PineForest() {
  const trunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.2, 0.34, 2.9, 6), []);
  const cone1 = useMemo(() => new THREE.ConeGeometry(1.75, 2.5, 8), []);
  const cone2 = useMemo(() => new THREE.ConeGeometry(1.3, 2.1, 8), []);
  const cone3 = useMemo(() => new THREE.ConeGeometry(0.84, 1.7, 7), []);
  const bark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#4a3527', roughness: 1 }),
    [],
  );
  const leaves = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }),
    [],
  );

  const trunks = useMemo(() => treeLayer('pine', 1.45), []);
  const layer1 = useMemo(() => treeLayer('pine', 2.55, { color: (t) => forestColor(t, 'pine', 0) }), []);
  const layer2 = useMemo(() => treeLayer('pine', 3.45, { color: (t) => forestColor(t, 'pine', 1) }), []);
  const layer3 = useMemo(() => treeLayer('pine', 4.3, { color: (t) => forestColor(t, 'pine', 2) }), []);

  return (
    <group>
      <InstanceLayer geometry={trunkGeometry} material={bark} items={trunks} />
      <InstanceLayer geometry={cone1} material={leaves} items={layer1} />
      <InstanceLayer geometry={cone2} material={leaves} items={layer2} />
      <InstanceLayer geometry={cone3} material={leaves} items={layer3} />
    </group>
  );
}

function OakForest() {
  const trunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.26, 0.4, 3.2, 7), []);
  const blob = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const bark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#54402f', roughness: 1 }),
    [],
  );
  const leaves = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
    [],
  );

  const trunks = useMemo(() => treeLayer('oak', 1.6), []);
  const blob1 = useMemo(
    () => treeLayer('oak', 3.35, { scaleY: 0.92, color: (t) => forestColor(t, 'oak') }),
    [],
  );
  const blob2 = useMemo(
    () => treeLayer('oak', 3.0, { color: (t) => forestColor(t, 'oak', 1) }),
    [],
  );
  const blob3 = useMemo(
    () => treeLayer('oak', 4.05, { scaleY: 0.85, color: (t) => forestColor(t, 'oak', 2) }),
    [],
  );

  return (
    <group>
      <InstanceLayer geometry={trunkGeometry} material={bark} items={trunks} />
      <InstanceLayer geometry={blob} material={leaves} items={blob1} />
      <InstanceLayer geometry={blob} material={leaves} items={blob2} />
      <InstanceLayer geometry={blob} material={leaves} items={blob3} />
    </group>
  );
}

function Bushes() {
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(0.95, 1), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }),
    [],
  );
  const items = useMemo(() => {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    return BUSHES.map((bush) => {
      position.set(bush.x, terrainHeight(bush.x, bush.z) + 0.42 * bush.scale, bush.z);
      quaternion.setFromAxisAngle(up, bush.tint * Math.PI * 2);
      scale.set(bush.scale, bush.scale * 0.62, bush.scale);
      matrix.compose(position, quaternion, scale);
      const color = new THREE.Color().setHSL(
        0.26 + bush.tint * 0.06,
        0.34,
        0.2 + bush.tint * 0.09,
      );
      return { matrix: matrix.clone(), color };
    });
  }, []);
  return <InstanceLayer geometry={geometry} material={material} items={items} castShadow={false} />;
}

function Rocks() {
  const geometry = useMemo(() => new THREE.DodecahedronGeometry(0.5, 0), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#77756c', roughness: 0.95, flatShading: true }),
    [],
  );
  const items = useMemo(() => {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    return ROCKS.map((rock) => {
      position.set(rock.x, terrainHeight(rock.x, rock.z) + 0.12 * rock.scale, rock.z);
      euler.set(rock.rot * 0.3, rock.rot, rock.rot * 0.2);
      quaternion.setFromEuler(euler);
      scale.set(rock.scale, rock.scale * 0.7, rock.scale);
      matrix.compose(position, quaternion, scale);
      return { matrix: matrix.clone() };
    });
  }, []);
  return <InstanceLayer geometry={geometry} material={material} items={items} castShadow={false} />;
}

function Tufts() {
  const geometry = useMemo(() => new THREE.ConeGeometry(0.16, 0.55, 4), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }),
    [],
  );
  const items = useMemo(() => {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    return TUFTS.map((tuft) => {
      position.set(tuft.x, terrainHeight(tuft.x, tuft.z) + 0.18 * tuft.scale, tuft.z);
      quaternion.setFromAxisAngle(up, tuft.rot);
      scale.set(tuft.scale * 0.8, tuft.scale, tuft.scale * 0.8);
      matrix.compose(position, quaternion, scale);
      const color = new THREE.Color().setHSL(0.23 + tuft.tint * 0.08, 0.4, 0.25 + tuft.tint * 0.12);
      return { matrix: matrix.clone(), color };
    });
  }, []);
  return <InstanceLayer geometry={geometry} material={material} items={items} castShadow={false} />;
}

function Mushrooms() {
  const groups = useMemo(() => {
    // 원형 길가: [길을 따라 간 비율, 길에서 비켜난 거리(+ 안쪽 / - 바깥쪽)]
    const trailSpots: [number, number][] = [
      [0.03, 3.3],
      [0.1, -3.6],
      [0.17, 4.2],
      [0.27, -4.1],
      [0.38, 4.6],
      [0.5, -7.2],
      [0.7, -3.2],
      [0.84, 3.4],
    ];
    const spots = [
      ...trailSpots.map(([t, side]) => {
        const p = loopSpot(t, side);
        return [p.x, p.z];
      }),
      // 오두막 양옆 (오두막 기준)
      [CABIN.x - 9.4, CABIN.z + 2],
      [CABIN.x + 8.4, CABIN.z + 6],
    ];
    return spots.map(([x, z], index) => ({
      x,
      z,
      y: terrainHeight(x, z),
      rot: index * 1.7,
    }));
  }, []);

  return (
    <group>
      {groups.map((spot, i) => (
        <group key={i} position={[spot.x, spot.y, spot.z]} rotation-y={spot.rot}>
          {[0, 1, 2].map((j) => {
            const ox = Math.cos(j * 2.1) * 0.22;
            const oz = Math.sin(j * 2.1) * 0.22;
            const scale = 0.6 + j * 0.18;
            return (
              <group key={j} position={[ox, 0, oz]} scale={scale}>
                <mesh position={[0, 0.09, 0]} castShadow>
                  <cylinderGeometry args={[0.035, 0.05, 0.18, 6]} />
                  <meshStandardMaterial color="#e8dfc8" roughness={1} />
                </mesh>
                <mesh position={[0, 0.2, 0]} castShadow>
                  <sphereGeometry args={[0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
                  <meshStandardMaterial color={j === 1 ? '#b8663f' : '#9c4a35'} roughness={0.9} />
                </mesh>
              </group>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function FallenLogs() {
  const logs = useMemo(
    () => [
      // 원형 길가 (t: 길을 따라 간 비율, side: + 안쪽 / - 바깥쪽)
      { ...loopSpot(0.11, -5.5), rot: 1.1, len: 3.2 },
      { ...loopSpot(0.35, 5.8), rot: 2.3, len: 2.6 },
      { ...loopSpot(0.58, -6.4), rot: 0.5, len: 3.6 },
      { ...loopSpot(0.86, 6.9), rot: 1.9, len: 2.8 },
    ],
    [],
  );
  return (
    <group>
      {logs.map((log, i) => (
        <group
          key={i}
          position={[log.x, terrainHeight(log.x, log.z) + 0.28, log.z]}
          rotation-y={log.rot}
        >
          <mesh rotation-z={Math.PI / 2} castShadow receiveShadow>
            <cylinderGeometry args={[0.26, 0.32, log.len, 8]} />
            <meshStandardMaterial color="#4b3a2a" roughness={1} />
          </mesh>
          <mesh position={[0, 0.26, 0.1]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.26, 10]} />
            <meshStandardMaterial color="#8a6c4a" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Forest() {
  return (
    <group>
      <PineForest />
      <OakForest />
      <Bushes />
      <Rocks />
      <Tufts />
      <Mushrooms />
      <FallenLogs />
    </group>
  );
}
