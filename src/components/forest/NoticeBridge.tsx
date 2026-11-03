'use client';

/**
 * 입구 알림판 공지 브리지
 * - 숲에 들어오면(로그인 후) 싱싱한 캐시가 있으면 그대로 쓰고, 없을 때만 한 번 불러온다.
 * - 관리자가 Neon 에서 공지를 바꾸면 서버가 `notices:changed` 를 보내고,
 *   이때만 강제로 다시 확인한다.
 */

import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { useGame } from '@/store/game';
import { loadNotices, readCachedNotices, unreadCount } from '@/lib/notices';

export function NoticeBridge() {
  useEffect(() => {
    let cancelled = false;
    const setNotices = useGame.getState().setNotices;
    const showToast = useGame.getState().showToast;

    const cached = readCachedNotices();
    if (cached) {
      useGame.getState().setNotices(cached.items, unreadCount(cached.items));
    }

    void loadNotices().then(({ items, unread }) => {
      if (cancelled) return;
      setNotices(items, unread);
      if (unread > 0) {
        showToast(`산길 입구 알림판에 ${unread}건의 읽지 않은 소식이 있습니다.`, 'info');
      }
    });

    const socket = getSocket();
    const onChanged = () => {
      void loadNotices({ force: true }).then(({ items, unread }) => {
        if (cancelled) return;
        useGame.getState().setNotices(items, unread);
        useGame.getState().showToast('입구 알림판의 소식이 바뀌었습니다.', 'info');
      });
    };

    socket.on('notices:changed', onChanged);
    return () => {
      cancelled = true;
      socket.off('notices:changed', onChanged);
    };
  }, []);

  return null;
}
