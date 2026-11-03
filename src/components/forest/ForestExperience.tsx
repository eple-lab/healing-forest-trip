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
    </div>
  );
}
