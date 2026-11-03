'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * 세션 쿠키(httpOnly)로 인증하는 소켓.
 * 토큰을 JS 로 꺼내지 않으며, 서버가 NextAuth JWT 를 직접 검증한다.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8000,
      timeout: 12000,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
