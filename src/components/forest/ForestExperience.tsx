'use client';

import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { START } from '@/lib/world';
import { useGame } from '@/store/game';
import { Sky } from './Sky';
import { Terrain, Trail } from './Terrain';
import { Forest } from './Forest';
import { Stumps, TrailSigns, DecorativeStumps } from './Stumps';
import { Clearing } from './Clearing';
import { Cabin } from './Cabin';
import { Fireflies } from './Fireflies';
import { Lighting } from './Lighting';
import { Player } from './Player';
import { RemotePlayers } from './RemotePlayers';
import { InteractionSystem } from './InteractionSystem';
import { AudioSystem } from './AudioSystem';
import { FirstPersonItems } from './FirstPersonItems';
import { MultiplayerBridge } from './MultiplayerBridge';
import { HUD } from '@/components/ui/HUD';
import { ChatPanel } from '@/components/ui/ChatPanel';
import { HelpPanel } from '@/components/ui/HelpPanel';
import { MobileControls } from '@/components/ui/MobileControls';
import { RestOverlay } from '@/components/ui/RestOverlay';
import { Toast } from '@/components/ui/Toast';
import { StartOverlay } from '@/components/ui/StartOverlay';

export type ForestUser = {
  id: string;
  name: string;
  image: string | null;
  isGuest: boolean;
};

function Scene() {
  return (
    <>
      <fogExp2 attach="fog" args={['#9fb7b0', 0.0055]} />
      <Lighting />
      <Sky />
      <Terrain />
      <Trail />
      <Forest />
      <Stumps />
      <DecorativeStumps />
      <TrailSigns />
      <Clearing />
      <Cabin />
      <Fireflies />
      <Player />
      <RemotePlayers />
      <InteractionSystem />
      <AudioSystem />
      <FirstPersonItems />
    </>
  );
}

export function ForestExperience({ user }: { user: ForestUser }) {
  const setUser = useGame((s) => s.setUser);
  const visitCount = useGame((s) => s.visitCount);
  // 숨겨진 탭은 렌더를 멈춰 배터리/GPU 를 아낀다. (Chrome 은 rAF 도 제한한다.)
  const [frameloop, setFrameloop] = useState<'always' | 'never'>('always');
  // 그래픽 장치가 재시작/소실되면 흰 화면 대신 복구 안내를 보여준다.
  const [webglLost, setWebglLost] = useState(false);

  useEffect(() => {
    setUser(user);
  }, [setUser, user]);

  useEffect(() => {
    const onVisibility = () => setFrameloop(document.hidden ? 'never' : 'always');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <div className="forest-app">
      <MultiplayerBridge />
      <Canvas
        shadows
        dpr={[1, 1.5]}
        frameloop={frameloop}
        camera={{ position: [START.x, 1.7, START.z], fov: 68, near: 0.08, far: 720 }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          stencil: false,
          alpha: false,
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault(); // 브라우저가 컨텍스트 복구를 시도하도록 둔다.
            setFrameloop('never');
            setWebglLost(true);
          });
          gl.domElement.addEventListener('webglcontextrestored', () => {
            setWebglLost(false);
            setFrameloop(document.hidden ? 'never' : 'always');
          });
        }}
        className="forest-canvas"
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>

      <HUD />
      <ChatPanel />
      <HelpPanel />
      <MobileControls />
      <Toast />
      <RestOverlay />
      <StartOverlay
        name={user.name}
        isGuest={user.isGuest}
        visitCount={visitCount}
      />
      {webglLost && (
        <div className="webgl-lost" role="alert">
          <h2>그래픽 장치가 재시작되었습니다</h2>
          <p>
            브라우저가 WebGL 화면을 복구하는 중입니다. 잠시 기다리거나 새로고침해 주세요.
          </p>
          <button type="button" className="btn-primary compact" onClick={() => window.location.reload()}>
            새로고침
          </button>
        </div>
      )}
    </div>
  );
}
