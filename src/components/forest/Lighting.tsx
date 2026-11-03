'use client';

/** 한국 시간에 맞춘 태양/달/환경광 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useClock } from '@/store/game';
import { currentKoreaClock, skyColors, sunState } from '@/lib/time';
import { playerState } from '@/lib/player-state';

export function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const moon = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const color = useRef(new THREE.Color());
  const moonColor = useRef(new THREE.Color('#9fb6e8'));
  const lastUpdate = useRef(0);

  useFrame((state) => {
    const now = useClock.getState().now || Date.now();
    if (now - lastUpdate.current < 500) return;
    lastUpdate.current = now;
    const clock = currentKoreaClock(now);
    const sunStateValue = sunState(clock);
    const colors = skyColors(sunStateValue);

    if (sun.current) {
      const dir = sunStateValue.sun;
      sun.current.position.set(
        playerState.x + dir[0] * 70,
        Math.max(4, dir[1] * 80),
        playerState.z + dir[2] * 70,
      );
      sun.current.target.position.set(playerState.x, 0, playerState.z);
      sun.current.target.updateMatrixWorld();
      sun.current.intensity = 0.15 + sunStateValue.day * 2.35;
      color.current.setRGB(colors.sun[0], colors.sun[1], colors.sun[2], THREE.SRGBColorSpace);
      sun.current.color.copy(color.current);
      sun.current.visible = sunStateValue.sunY > -0.08;
    }
    if (moon.current) {
      const dir = sunStateValue.moon;
      moon.current.position.set(
        playerState.x + dir[0] * 70,
        Math.max(6, dir[1] * 80),
        playerState.z + dir[2] * 70,
      );
      moon.current.target.position.set(playerState.x, 0, playerState.z);
      moon.current.target.updateMatrixWorld();
      moon.current.intensity = sunStateValue.night * 0.55;
      moon.current.color.copy(moonColor.current);
      moon.current.visible = sunStateValue.night > 0.05;
    }
    if (hemi.current) {
      hemi.current.intensity = 0.3 + sunStateValue.day * 1.15;
      hemi.current.color.setRGB(
        colors.hemiSky[0],
        colors.hemiSky[1],
        colors.hemiSky[2],
        THREE.SRGBColorSpace,
      );
      hemi.current.groundColor.setRGB(
        colors.hemiGround[0],
        colors.hemiGround[1],
        colors.hemiGround[2],
        THREE.SRGBColorSpace,
      );
    }
    if (ambient.current) {
      ambient.current.intensity = 0.18 + (1 - sunStateValue.night) * 0.22;
    }
    const fog = state.scene.fog;
    if (fog instanceof THREE.FogExp2) {
      fog.density = 0.0048 + sunStateValue.night * 0.0022;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#a8c4dc', '#3a3c26', 1.1]} />
      <ambientLight ref={ambient} intensity={0.3} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={2}
        position={[30, 60, 20]}
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
        shadow-camera-left={-38}
        shadow-camera-right={38}
        shadow-camera-top={38}
        shadow-camera-bottom={-38}
        shadow-camera-near={1}
        shadow-camera-far={180}
        shadow-bias={-0.0008}
        shadow-normalBias={0.035}
      />
      <directionalLight ref={moon} intensity={0} position={[-30, 50, -20]} color="#9fb6e8" />
    </>
  );
}
