import type { Zone } from '@/lib/world';

export type Pose = 'idle' | 'walk' | 'sit' | 'lie';
export type Drink = 'coffee' | 'water';

export type Seat = {
  id: string;
  kind: 'stump' | 'chair' | 'window' | 'bed';
  label: string;
  /** 앉은 자리의 카메라 높이 */
  eyeY: number;
  /** 앉은 자리의 발 위치 */
  feetY: number;
  x: number;
  z: number;
  yaw: number;
  standX: number;
  standZ: number;
};

export type PublicPlayer = {
  id: string;
  name: string;
  image: string | null;
  guest: boolean;
  color: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  pose: Pose;
  blanket: boolean;
  zone: Zone;
  joinedAt: number;
};

export type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  body: string;
  at: string;
  guest?: boolean;
};

export type Presence = {
  total: number;
  clearing: number;
  cabin: number;
  trail: number;
  max: number;
};

export type InteractionTarget = {
  id: string;
  label: string;
  hint?: string;
  enabled: boolean;
  x: number;
  z: number;
  distance: number;
};

export type ServerFire = { logs: number; intensity: number };

export type ConnectionState = 'connecting' | 'online' | 'offline';
