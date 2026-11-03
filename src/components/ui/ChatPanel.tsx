'use client';

import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/store/game';
import { getSocket } from '@/lib/socket';

const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul',
});

const MAX_LENGTH = 240;

export function ChatPanel() {
  const open = useGame((s) => s.chatOpen);
  const setOpen = useGame((s) => s.setChatOpen);
  const chat = useGame((s) => s.chat);
  const zone = useGame((s) => s.zone);
  const user = useGame((s) => s.user);
  const presence = useGame((s) => s.presence);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canChat = zone === 'clearing';

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chat, open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (event.code === 'Enter' && !open && !typing) {
        event.preventDefault();
        setOpen(true);
      }
      if (event.code === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
        (document.activeElement as HTMLElement | null)?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const send = () => {
    const text = draft.trim();
    if (!text || !canChat) return;
    if (performance.now() - sending < 700) return;
    setSending(performance.now());
    getSocket().emit('chat:send', { text });
    setDraft('');
  };

  return (
    <aside className="chat-panel glass" aria-label="숲의 빈터 대화">
      <header className="chat-head">
        <div>
          <strong>숲의 빈터</strong>
          <span>{presence.clearing}명이 함께 이야기하는 중</span>
        </div>
        <button type="button" className="chat-close" onClick={() => setOpen(false)} aria-label="대화 닫기">
          ✕
        </button>
      </header>

      <div className="chat-list" ref={listRef}>
        {chat.length === 0 && (
          <p className="chat-empty">
            아직 들려오는 이야기가 없습니다.
            <br />
            빈터의 불 옆에서 첫마디를 건네 보세요.
          </p>
        )}
        {chat.map((message) => {
          const mine = message.userId === user?.id;
          return (
            <div key={message.id} className={`chat-message ${mine ? 'is-mine' : ''}`}>
              <div className="chat-meta">
                <span className="chat-name">{message.name}</span>
                {message.guest && <span className="chat-guest">나그네</span>}
                <time dateTime={message.at}>
                  {Number.isNaN(new Date(message.at).getTime())
                    ? ''
                    : timeFormatter.format(new Date(message.at))}
                </time>
              </div>
              <p>{message.body}</p>
            </div>
          );
        })}
      </div>

      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(Array.from(event.target.value).slice(0, MAX_LENGTH).join(''))}
          maxLength={MAX_LENGTH}
          placeholder={canChat ? '숲의 빈터에 이야기를 남겨 보세요' : '빈터에 도착하면 이야기를 나눌 수 있어요'}
          disabled={!canChat}
          aria-label="채팅 입력"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={!canChat || draft.trim().length === 0} aria-label="보내기">
          보내기
        </button>
      </form>
      <footer className="chat-foot">
        {canChat ? (
          <>
            <span>{Array.from(draft).length}/240</span>
            <span>Enter 전송 · Esc 닫기</span>
          </>
        ) : (
          <span>지금은 {zone === 'cabin' ? '오두막' : '산길'}에 있습니다. 빈터에서만 대화할 수 있어요.</span>
        )}
      </footer>
    </aside>
  );
}
