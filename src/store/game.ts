'use client';

import { create } from 'zustand';
import type {
  ChatMessage,
  ConnectionState,
  Drink,
  InteractionTarget,
  Pose,
  Presence,
  PublicPlayer,
  Seat,
  ServerFire,
} from '@/types/game';
import type { Zone } from '@/lib/world';

type ToastTone = 'info' | 'warm' | 'warn';

type GameState = {
  pose: Pose;
  seat: Seat | null;
  resting: boolean;
  hasBlanket: boolean;
  blanketOn: boolean;
  holdingLog: boolean;
  drink: Drink | null;
  warmth: number;
  fire: ServerFire;

  zone: Zone;
  presence: Presence;
  players: PublicPlayer[];
  chat: ChatMessage[];
  chatOpen: boolean;
  helpOpen: boolean;
  connection: ConnectionState;
  visitCount: number | null;
  audioStarted: boolean;
  muted: boolean;
  serverOffset: number;
  interaction: InteractionTarget | null;

  toast: { id: number; text: string; tone: ToastTone } | null;
  warmFlash: number;

  user: { id: string; name: string; image: string | null; isGuest: boolean } | null;
  unreadChat: number;

  setUser: (user: { id: string; name: string; image: string | null; isGuest: boolean } | null) => void;
  sit: (seat: Seat) => void;
  stand: () => void;
  setResting: (value: boolean) => void;
  pickBlanket: () => void;
  coverBlanket: () => void;
  uncoverBlanket: () => void;
  dropBlanket: () => void;
  takeLog: () => void;
  useLog: () => void;
  takeDrink: (drink: Drink) => void;
  finishDrink: () => void;
  addFire: (fire: ServerFire) => void;
  setFire: (fire: ServerFire) => void;
  setZone: (zone: Zone) => void;
  setPresence: (presence: Presence) => void;
  setPlayers: (players: PublicPlayer[]) => void;
  upsertPlayer: (player: PublicPlayer) => void;
  upsertPlayers: (players: PublicPlayer[]) => void;
  removePlayer: (id: string) => void;
  appendChat: (message: ChatMessage) => void;
  setChat: (messages: ChatMessage[]) => void;
  setChatOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setConnection: (state: ConnectionState) => void;
  setVisitCount: (count: number) => void;
  setAudioStarted: (started: boolean) => void;
  toggleMuted: () => void;
  setServerNow: (now: number) => void;
  setInteraction: (target: InteractionTarget | null) => void;
  showToast: (text: string, tone?: ToastTone) => void;
  clearToast: (id: number) => void;
  flashWarmth: () => void;
};

let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useGame = create<GameState>((set, get) => ({
  pose: 'idle',
  seat: null,
  resting: false,
  hasBlanket: false,
  blanketOn: false,
  holdingLog: false,
  drink: null,
  warmth: 0,
  fire: { logs: 2, intensity: 0.55 },

  zone: 'trail',
  presence: { total: 0, clearing: 0, cabin: 0, trail: 0, max: 40 },
  players: [],
  chat: [],
  chatOpen: false,
  helpOpen: false,
  connection: 'connecting',
  visitCount: null,
  audioStarted: false,
  muted: false,
  serverOffset: 0,
  interaction: null,

  toast: null,
  warmFlash: 0,

  user: null,
  unreadChat: 0,

  setUser: (user) => set({ user }),

  sit: (seat) =>
    set({
      seat,
      pose: seat.kind === 'bed' ? 'lie' : 'sit',
      resting: false,
      blanketOn: false,
    }),
  stand: () =>
    set({
      seat: null,
      pose: 'idle',
      resting: false,
      blanketOn: false,
    }),
  setResting: (resting) => set({ resting }),

  pickBlanket: () => {
    set({ hasBlanket: true });
    get().showToast('무릎담요를 집었다. 따뜻한 냄새가 난다.', 'warm');
  },
  coverBlanket: () => {
    if (!get().hasBlanket) return;
    set({ blanketOn: true });
    get().showToast('무릎 위로 담요를 덮었다. 온기가 스며든다.', 'warm');
  },
  uncoverBlanket: () => set({ blanketOn: false }),
  dropBlanket: () => {
    set({ hasBlanket: false, blanketOn: false });
    get().showToast('담요를 접어 테이블에 두었다.', 'info');
  },

  takeLog: () => {
    if (get().holdingLog) return;
    set({ holdingLog: true });
    get().showToast('장작 한 개를 들었다. 벽난로로 가져가자.', 'info');
  },
  useLog: () => {
    if (!get().holdingLog) return;
    set({ holdingLog: false });
  },

  takeDrink: (drink) => {
    set({ drink });
    get().showToast(
      drink === 'coffee' ? '따뜻한 커피를 한 잔 들었다.' : '시원한 물을 한 잔 들었다.',
      'warm',
    );
  },
  finishDrink: () => set({ drink: null }),
  addFire: (fire) =>
    set((state) => ({
      fire: { logs: state.fire.logs + fire.logs, intensity: Math.min(1, state.fire.intensity + fire.intensity) },
    })),
  setFire: (fire) => set({ fire }),

  setZone: (zone) => {
    if (get().zone === zone) return;
    set({ zone });
  },
  setPresence: (presence) => set({ presence }),
  setPlayers: (players) => set({ players }),
  upsertPlayer: (player) =>
    set((state) => {
      const index = state.players.findIndex((p) => p.id === player.id);
      if (index === -1) return { players: [...state.players, player] };
      const next = state.players.slice();
      next[index] = { ...next[index], ...player };
      return { players: next };
    }),
  // 서버가 100ms 마다 묶어 보낸 위치를 한 번의 set 으로 반영한다.
  // (플레이어 수만큼 set 을 호출하면 렌더가 N배로 늘어난다.)
  upsertPlayers: (incoming) =>
    set((state) => {
      if (incoming.length === 0) return {};
      const byId = new Map(state.players.map((p) => [p.id, p]));
      for (const player of incoming) {
        const prev = byId.get(player.id);
        byId.set(player.id, prev ? { ...prev, ...player } : player);
      }
      return { players: Array.from(byId.values()) };
    }),
  removePlayer: (id) => set((state) => ({ players: state.players.filter((p) => p.id !== id) })),
  appendChat: (message) =>
    set((state) => ({
      chat: [...state.chat.slice(-79), message],
      unreadChat: state.chatOpen ? 0 : state.unreadChat + 1,
    })),
  setChat: (messages) => set({ chat: messages.slice(-80) }),
  setChatOpen: (chatOpen) =>
    set({ chatOpen, unreadChat: chatOpen ? 0 : get().unreadChat }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setConnection: (connection) => set({ connection }),
  setVisitCount: (visitCount) => set({ visitCount }),
  setAudioStarted: (audioStarted) => set({ audioStarted }),
  toggleMuted: () => set((state) => ({ muted: !state.muted })),
  setServerNow: (now) => set({ serverOffset: now - Date.now() }),
  setInteraction: (interaction) => {
    const prev = get().interaction;
    if (
      prev?.id === interaction?.id &&
      prev?.label === interaction?.label &&
      prev?.enabled === interaction?.enabled
    ) {
      return;
    }
    set({ interaction });
  },

  showToast: (text, tone = 'info') => {
    const id = ++toastSeq;
    set({ toast: { id, text, tone } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 3800);
  },
  clearToast: (id) => {
    if (get().toast?.id === id) set({ toast: null });
  },
  flashWarmth: () => set({ warmFlash: Date.now() }),
}));

/** 1초마다 갱신되는 한국 시간 (서버 시간 보정 포함) */
type ClockState = {
  now: number;
  setNow: (now: number) => void;
};
export const useClock = create<ClockState>((set) => ({
  // SSR 과 첫 클라이언트 렌더가 같은 값을 보도록 0 에서 시작한다.
  // 실제 시각은 마운트 직후/서버 welcome 수신 시 설정한다.
  now: 0,
  setNow: (now) => set({ now }),
}));
