'use client';

import { useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { useGame } from '@/store/game';

export function HelpPanel() {
  const open = useGame((s) => s.helpOpen);
  const setOpen = useGame((s) => s.setHelpOpen);

  useEffect(() => {
    if (!open) return;
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

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <div
        className="help-panel glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="help-head">
          <div>
            <h2 id="help-title">숲속여행 안내</h2>
            <p>걸어서 만나는 작은 숲과 오두막</p>
          </div>
          <button type="button" className="chat-close" onClick={() => setOpen(false)} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="help-body">
          <section>
            <h3>조작법</h3>
            <ul className="key-list">
              <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>걷기 (방향키도 가능)</span></li>
              <li><kbd>Shift</kbd><span>조금 빠르게 걷기</span></li>
              <li><kbd>마우스</kbd><span>화면을 클릭하면 시점 고정 · 위아래 둘러보기</span></li>
              <li><kbd>E</kbd><span>앉기 · 줍기 · 열기 · 불 피우기</span></li>
              <li><kbd>Enter</kbd><span>빈터에서 대화 열기</span></li>
              <li><kbd>M</kbd><span>소리 켜고 끄기</span></li>
              <li><kbd>H</kbd><span>이 안내 열고 닫기</span></li>
              <li><kbd>Esc</kbd><span>대화/안내 닫기 · 시점 고정 해제</span></li>
            </ul>
            <p className="help-note">모바일에서는 왼쪽 조이스틱으로 걷고, 오른쪽 화면을 드래그해 둘러봅니다.</p>
          </section>

          <section>
            <h3>숲에서 할 수 있는 일</h3>
            <ul className="place-list">
              <li>
                <strong>산길 초입</strong>
                <span>천천히 걸으며 바람과 새소리를 듣습니다. 잘린 나무 밑동에 앉아 쉴 수 있어요.</span>
              </li>
              <li>
                <strong>숲의 빈터</strong>
                <span>화덕과 통나무 벤치가 있는 넓은 곳. 다른 나그네와 이야기를 나눌 수 있습니다.</span>
              </li>
              <li>
                <strong>숲속 오두막</strong>
                <span>장작을 주워 벽난로에 넣고, 흔들의자에 앉아 담요를 덮어 보세요. 주방의 커피와 물도 마실 수 있습니다.</span>
              </li>
              <li>
                <strong>2층 침실</strong>
                <span>침대에 눕거나 큰 창가에 앉아 한국 시간의 해와 달, 숲과 새를 바라봅니다.</span>
              </li>
            </ul>
          </section>

          <section>
            <h3>이야기 예절</h3>
            <p>
              빈터에서는 서로의 이야기를 존중해 주세요. 개인정보나 연락처를 묻거나 남기지 않도록
              합니다. 욕설·광고·도배는 서버에서 자동으로 제한됩니다.
            </p>
          </section>

          <section>
            <h3>소리와 배려</h3>
            <p>
              모든 소리는 브라우저에서 그때그때 합성합니다. 외부 음원을 내려받지 않으며, 소리는
              &lsquo;숲으로 들어가기&rsquo;를 누른 뒤에만 재생됩니다. 오른쪽 위 소리 버튼으로 언제든
              끌 수 있어요.
            </p>
          </section>

          <section>
            <h3>계정</h3>
            <p>
              Google 로그인은 이름과 프로필 사진만 사용하며 이메일은 저장하지 않습니다. 게스트로
              들어오면 매번 새 익명 이름으로 참여합니다.
            </p>
          </section>
        </div>

        <footer className="help-foot">
          <span>숲속여행 · 조용한 멀티플레이어 산책</span>
          <button
            type="button"
            className="text-btn"
            onClick={() => signOut({ callbackUrl: '/' })}
          >
            로그아웃
          </button>
        </footer>
      </div>
    </div>
  );
}
