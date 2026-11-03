'use client';

/** 한국 시간·위치·자세에 맞춰 숲소리를 조정한다. */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { audio } from '@/lib/audio';
import { playerState } from '@/lib/player-state';
import { useClock, useGame } from '@/store/game';
import { CABIN } from '@/lib/world';
import { currentKoreaClock, sunState } from '@/lib/time';

export function AudioSystem() {
  const audioStarted = useGame((s) => s.audioStarted);
  const muted = useGame((s) => s.muted);
  const seat = useGame((s) => s.seat);
  const resting = useGame((s) => s.resting);
  const fireIntensity = useGame((s) => s.fire.intensity);
  const mutedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!audioStarted) return;
    void audio.start();
  }, [audioStarted]);

  useEffect(() => {
    if (mutedRef.current === muted) return;
    mutedRef.current = muted;
    audio.setMuted(muted);
  }, [muted]);

  useFrame(() => {
    if (!audio.isStarted) return;
    const now = useClock.getState().now || Date.now();
    const night = sunState(currentKoreaClock(now)).night;
    const inside =
      Math.abs(playerState.x - CABIN.x) < CABIN.halfW + 0.4 &&
      Math.abs(playerState.z - CABIN.z) < CABIN.halfD + 0.4;
    audio.update({
      night,
      cabin: inside,
      sitting: Boolean(seat),
      resting,
      fireIntensity,
    });
  });

  return null;
}
