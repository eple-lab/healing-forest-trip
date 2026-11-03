'use client';

/**
 * 소켓 연결 + 서버 이벤트 → 게임 상태 동기화
 * 서버가 보낸 위치/채팅/화덕 상태만 신뢰한다.
 */

import { useEffect, useRef } from 'react';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { isCharacterId } from '@/lib/characters';
import { useClock, useGame } from '@/store/game';
import type { ChatMessage, Pose, Presence, PublicPlayer, ServerFire } from '@/types/game';

type WelcomePayload = {
  self: PublicPlayer;
  players: PublicPlayer[];
  fire: ServerFire;
  chat: ChatMessage[];
  presence: Presence;
  now: number;
};

const POSE_SET = new Set<Pose>(['idle', 'walk', 'sit', 'lie']);

function normalizePlayer(input: Partial<PublicPlayer> & { id: string }): PublicPlayer {
  return {
    id: input.id,
    name: typeof input.name === 'string' ? input.name.slice(0, 24) : '나그네',
    image: typeof input.image === 'string' ? input.image : null,
    guest: input.guest === true,
    color: typeof input.color === 'string' ? input.color : '#7fa88a',
    character: isCharacterId(input.character) ? input.character : undefined,
    x: Number.isFinite(input.x) ? (input.x as number) : 0,
    y: Number.isFinite(input.y) ? (input.y as number) : 0,
    z: Number.isFinite(input.z) ? (input.z as number) : 0,
    rot: Number.isFinite(input.rot) ? (input.rot as number) : 0,
    pose: POSE_SET.has(input.pose as Pose) ? (input.pose as Pose) : 'idle',
    blanket: input.blanket === true,
    zone: input.zone === 'clearing' || input.zone === 'cabin' ? input.zone : 'trail',
    joinedAt: Number.isFinite(input.joinedAt) ? (input.joinedAt as number) : Date.now(),
  };
}

export function MultiplayerBridge({ enabled = true }: { enabled?: boolean }) {
  const prevZone = useRef<string>('trail');

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    const store = useGame.getState();
    store.setConnection(socket.connected ? 'online' : 'connecting');

    const onConnect = () => {
      useGame.getState().setConnection('online');
      // 서버는 클라이언트가 보낸 값을 검증한다. 로컬 선택이 있으면 알린다.
      const id = useGame.getState().characterId;
      if (id) getSocket().emit('profile:set', { character: id });
    };

    const onDisconnect = () => {
      useGame.getState().setConnection('offline');
      useGame.getState().setPlayers([]);
    };

    const onConnectError = (error: Error) => {
      useGame.getState().setConnection('offline');
      const reason = error?.message ?? '';
      let message = '숲과 연결이 끊어졌습니다. 잠시 후 다시 시도합니다.';
      if (reason === 'unauthorized') message = '로그인 세션이 만료되었습니다. 다시 들어와 주세요.';
      else if (reason === 'room_full') message = '지금 숲이 가득 찼습니다. 잠시 후 다시 시도해 주세요.';
      else if (reason === 'too_many_connections')
        message = '같은 네트워크에서 너무 많이 접속했습니다.';
      else if (reason === 'rate_limited')
        message = '접속 시도가 너무 잦습니다. 잠시 기다려 주세요.';
      useGame.getState().showToast(message, 'warn');
    };

    const onWelcome = (payload: WelcomePayload) => {
      const state = useGame.getState();
      state.setPlayers(
        Array.isArray(payload.players)
          ? payload.players.map((p) => normalizePlayer(p))
          : [],
      );
      if (payload.fire) state.setFire(payload.fire);
      if (Array.isArray(payload.chat)) state.setChat(payload.chat);
      if (payload.presence) state.setPresence(payload.presence);
      if (Number.isFinite(payload.now)) state.setServerNow(payload.now);
      useClock.getState().setNow(Date.now() + state.serverOffset);
      state.setConnection('online');
    };

    const onJoin = (player: PublicPlayer) => {
      const state = useGame.getState();
      if (!player?.id) return;
      state.upsertPlayer(normalizePlayer(player));
      if (player.name) {
        state.showToast(`${player.name} 님이 숲에 들어왔습니다.`, 'info');
      }
    };

    const onLeave = (payload: { id?: string }) => {
      if (!payload?.id) return;
      useGame.getState().removePlayer(payload.id);
    };

    const onMoveBatch = (payload: unknown) => {
      if (!Array.isArray(payload) || payload.length === 0) return;
      const players: PublicPlayer[] = [];
      for (const item of payload) {
        if (!item || typeof item !== 'object') continue;
        const id = (item as { id?: unknown }).id;
        if (typeof id !== 'string' || id.length === 0) continue;
        players.push(normalizePlayer(item as Partial<PublicPlayer> & { id: string }));
      }
      if (players.length > 0) useGame.getState().upsertPlayers(players);
    };

    const onPresence = (presence: Presence) => {
      if (presence) useGame.getState().setPresence(presence);
    };

    const onFire = (fire: ServerFire) => {
      if (fire) useGame.getState().setFire(fire);
    };

    const onChat = (message: ChatMessage) => {
      if (!message?.id) return;
      useGame.getState().appendChat(message);
    };

    const onChatDenied = (payload: { reason?: string }) => {
      const reason = payload?.reason;
      const state = useGame.getState();
      if (reason === 'clearing_only') {
        state.showToast('이야기는 숲의 빈터에서만 나눌 수 있어요.', 'info');
      } else if (reason === 'rate_limited') {
        state.showToast('조금 천천히 이야기해 주세요.', 'warn');
      } else if (reason === 'duplicate') {
        state.showToast('같은 말을 방금 했어요.', 'warn');
      } else if (reason === 'invalid') {
        state.showToast('보낼 수 없는 내용이에요.', 'warn');
      }
    };

    const onFireFull = () => {
      useGame.getState().showToast('벽난로가 이미 활활 타오르고 있어요.', 'warn');
    };

    const onProfile = (payload: { visitCount?: number }) => {
      if (typeof payload?.visitCount === 'number') {
        useGame.getState().setVisitCount(payload.visitCount);
      }
    };

    const onPlayerUpdate = (player: PublicPlayer) => {
      if (!player?.id) return;
      useGame.getState().upsertPlayer(normalizePlayer(player));
    };

    /**
     * 브라우저 탭을 닫거나 컴퓨터가 꺼질 때 서버 접속자 목록에서 즉시 빠지도록
     * pagehide 시점에 소켓을 닫는다. (b/bfcache 복원 시 pageshow 에서 다시 연결)
     * 전원 차단처럼 close 패킷이 유실되는 경우는 서버 ping 타임아웃이 정리한다.
     */
    const onPageHide = () => {
      const active = getSocket();
      if (active.connected || active.active) active.disconnect();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      const active = getSocket();
      if (!active.connected) active.connect();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('welcome', onWelcome);
    socket.on('player:join', onJoin);
    socket.on('player:leave', onLeave);
    socket.on('players:move', onMoveBatch);
    socket.on('presence', onPresence);
    socket.on('fire:state', onFire);
    socket.on('chat:message', onChat);
    socket.on('chat:denied', onChatDenied);
    socket.on('fire:full', onFireFull);
    socket.on('profile', onProfile);
    socket.on('player:update', onPlayerUpdate);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);

    if (!socket.connected) socket.connect();

    const clockTimer = window.setInterval(() => {
      useClock.getState().setNow(Date.now() + useGame.getState().serverOffset);
    }, 1000);

    const unsubscribe = useGame.subscribe((state) => {
      if (state.zone === prevZone.current) return;
      const previous = prevZone.current;
      prevZone.current = state.zone;
      if (state.zone === 'clearing' && previous === 'trail') {
        state.showToast('숲의 빈터에 도착했습니다. 불 옆에서 이야기를 나눠 보세요.', 'warm');
      } else if (state.zone === 'cabin' && previous !== 'cabin') {
        state.showToast('오두막에 들어왔습니다. 벽난로가 반겨 줍니다.', 'warm');
      }
    });

    return () => {
      window.clearInterval(clockTimer);
      unsubscribe();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('welcome', onWelcome);
      socket.off('player:join', onJoin);
      socket.off('player:leave', onLeave);
      socket.off('players:move', onMoveBatch);
      socket.off('presence', onPresence);
      socket.off('fire:state', onFire);
      socket.off('chat:message', onChat);
      socket.off('chat:denied', onChatDenied);
      socket.off('fire:full', onFireFull);
      socket.off('profile', onProfile);
      socket.off('player:update', onPlayerUpdate);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      disconnectSocket();
    };
  }, [enabled]);

  return null;
}
