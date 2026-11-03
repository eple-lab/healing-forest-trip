'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useClock } from '@/store/game';
import { currentKoreaClock, skyColors, sunState } from '@/lib/time';
import { glowTexture } from '@/lib/textures';
import { mulberry32 } from '@/lib/world';

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDir = normalize(world.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform vec3 uSunColor;
  uniform float uNight;

  void main() {
    vec3 dir = normalize(vDir);
    float t = pow(clamp(dir.y, 0.0, 1.0), 0.55);
    vec3 col = mix(uHorizon, uTop, t);
    col = mix(col * 0.82, col, smoothstep(-0.12, 0.06, dir.y));

    float sun = max(dot(dir, uSunDir), 0.0);
    col += uSunColor * pow(sun, 10.0) * 0.20 * (1.0 - uNight * 0.75);
    col += vec3(1.0, 0.88, 0.66) * pow(sun, 1400.0) * 1.4;

    float moon = max(dot(dir, uMoonDir), 0.0);
    col += vec3(0.74, 0.81, 1.0) * pow(moon, 1000.0) * uNight * 0.9 * smoothstep(-0.05, 0.08, uMoonDir.y);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeStars() {
  const rnd = mulberry32(2049);
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = rnd() * Math.PI * 2;
    const phi = Math.acos(0.02 + rnd() * 0.98);
    const radius = 430;
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[i * 3 + 1] = Math.cos(phi) * radius;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export function Sky() {
  const group = useRef<THREE.Group>(null);
  const sky = useRef<THREE.Mesh>(null);
  const sun = useRef<THREE.Mesh>(null);
  const moon = useRef<THREE.Mesh>(null);
  const sunGlow = useRef<THREE.Sprite>(null);
  const moonGlow = useRef<THREE.Sprite>(null);
  const stars = useRef<THREE.Points>(null);
  const { camera, scene } = useThree();

  const starGeometry = useMemo(makeStars, []);
  const glow = useMemo(() => glowTexture(), []);
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color('#2a4a7a') },
      uHorizon: { value: new THREE.Color('#c4dbe6') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uSunColor: { value: new THREE.Color('#ffd9a0') },
      uNight: { value: 0 },
    }),
    [],
  );
  const sunDir = useMemo(() => new THREE.Vector3(), []);
  const moonDir = useMemo(() => new THREE.Vector3(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const now = useClock.getState().now || Date.now();
    const state = sunState(currentKoreaClock(now));
    const colors = skyColors(state);

    uniforms.uTop.value.setRGB(colors.top[0], colors.top[1], colors.top[2], THREE.SRGBColorSpace);
    uniforms.uHorizon.value.setRGB(
      colors.horizon[0],
      colors.horizon[1],
      colors.horizon[2],
      THREE.SRGBColorSpace,
    );
    uniforms.uSunColor.value.setRGB(colors.sun[0], colors.sun[1], colors.sun[2], THREE.SRGBColorSpace);
    uniforms.uNight.value = state.night;

    sunDir.set(state.sun[0], state.sun[1], state.sun[2]);
    moonDir.set(state.moon[0], state.moon[1], state.moon[2]);
    uniforms.uSunDir.value.copy(sunDir);
    uniforms.uMoonDir.value.copy(moonDir);

    if (group.current) group.current.position.copy(camera.position);
    if (sun.current) {
      sun.current.position.copy(sunDir).multiplyScalar(360);
      sun.current.quaternion.copy(camera.quaternion);
      sun.current.visible = state.sunY > -0.04;
      (sun.current.material as THREE.MeshBasicMaterial).opacity = Math.min(
        1,
        Math.max(0, state.sunY * 6 + 0.4),
      );
    }
    if (sunGlow.current) {
      sunGlow.current.position.copy(sunDir).multiplyScalar(358);
      sunGlow.current.visible = state.sunY > -0.08;
      sunGlow.current.material.opacity = Math.min(0.85, Math.max(0, state.sunY * 3 + 0.15));
    }
    if (moon.current) {
      moon.current.position.copy(moonDir).multiplyScalar(360);
      moon.current.quaternion.copy(camera.quaternion);
      moon.current.visible = state.sunY < 0.04;
      (moon.current.material as THREE.MeshBasicMaterial).opacity = state.night * 0.95;
    }
    if (moonGlow.current) {
      moonGlow.current.position.copy(moonDir).multiplyScalar(358);
      moonGlow.current.visible = state.sunY < 0.08;
      moonGlow.current.material.opacity = state.night * 0.36;
    }
    if (stars.current) {
      stars.current.visible = state.night > 0.05;
      (stars.current.material as THREE.PointsMaterial).opacity = state.night * 0.9;
      stars.current.rotation.y += 0.00004;
    }

    const fog = scene.fog;
    if (fog && fog instanceof THREE.FogExp2) {
      color.setRGB(colors.fog[0], colors.fog[1], colors.fog[2], THREE.SRGBColorSpace);
      fog.color.lerp(color, 0.2);
      fog.density = 0.0055 + state.night * 0.002;
    }
    if (sky.current) {
      (sky.current.material as THREE.ShaderMaterial).uniforms = uniforms;
    }
  });

  return (
    <group ref={group} renderOrder={-10}>
      <mesh ref={sky} frustumCulled={false}>
        <sphereGeometry args={[480, 32, 20]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </mesh>

      <points ref={stars} geometry={starGeometry} frustumCulled={false}>
        <pointsMaterial
          color="#dfe9ff"
          size={1.7}
          sizeAttenuation={false}
          transparent
          opacity={0}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </points>

      <mesh ref={sun} frustumCulled={false}>
        <circleGeometry args={[6.2, 32]} />
        <meshBasicMaterial
          color="#fff1c9"
          transparent
          opacity={0}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </mesh>
      <sprite ref={sunGlow} scale={[95, 95, 1]}>
        <spriteMaterial
          map={glow}
          color="#ffc27a"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
          toneMapped={false}
        />
      </sprite>

      <mesh ref={moon} frustumCulled={false}>
        <circleGeometry args={[4.6, 28]} />
        <meshBasicMaterial
          color="#e9eefb"
          transparent
          opacity={0}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </mesh>
      <sprite ref={moonGlow} scale={[42, 42, 1]}>
        <spriteMaterial
          map={glow}
          color="#9fb6e8"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}
