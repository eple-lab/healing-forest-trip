'use client';

import { useEffect, useState } from 'react';
import { useGame } from '@/store/game';
import { loadNotices, unreadCount } from '@/lib/notices';

const CATEGORY_LABEL: Record<string, string> = {
  notice: '안내',
  schedule: '일정',
  maintenance: '점검',
  update: '업데이트',
};

function categoryLabel(value: string) {
  return CATEGORY_LABEL[value] ?? '안내';
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(date);
}

export function NoticePanel() {
  const open = useGame((s) => s.noticeOpen);
  const setOpen = useGame((s) => s.setNoticeOpen);
  const items = useGame((s) => s.notices);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    // 보는 순간 모두 읽음 처리한다.
    useGame.getState().markNoticesRead();
    useGame.getState().setInteraction(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const refresh = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await loadNotices({ force: true });
      useGame.getState().setNotices(result.items, unreadCount(result.items));
      // 새 소식도 보는 순간 읽음 처리
      useGame.getState().markNoticesRead();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <div
        className="notice-panel glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="notice-head">
          <div>
            <h2 id="notice-title">입구 알림판</h2>
            <p>관리자가 올린 중요한 일정과 업데이트 소식</p>
          </div>
          <button type="button" className="chat-close" onClick={() => setOpen(false)} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="notice-body">
          {items.length === 0 ? (
            <p className="notice-empty">등록된 소식이 없습니다.</p>
          ) : (
            <ul className="notice-list">
              {items.map((item) => (
                <li key={item.id} className="notice-item">
                  <div className="notice-item-head">
                    <span className={`notice-chip ${item.category}`}>{categoryLabel(item.category)}</span>
                    {item.pinned && <span className="notice-pin">중요</span>}
                    <span className="notice-date">{formatDate(item.publishedAt)}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="notice-foot">
          <span>소식은 읽으면 로컬에 캐싱되어 다시 조회하지 않습니다.</span>
          <button type="button" className="text-btn" onClick={refresh} disabled={loading}>
            {loading ? '확인 중…' : '새 소식 확인'}
          </button>
        </footer>
      </div>
    </div>
  );
}
