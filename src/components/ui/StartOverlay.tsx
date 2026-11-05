'use client';

import { useState } from 'react';
import { audio } from '@/lib/audio';
import { characterById } from '@/lib/characters';
import { useGame } from '@/store/game';
import { CharacterPreview } from './CharacterSelect';

export function StartOverlay({
  name,
  isGuest,
  visitCount,
  characterId,
  onChangeCharacter,
}: {
  name: string;
  isGuest: boolean;
  visitCount: number | null;
  // [FEAT-04] 들어가기 전에 지금 모습을 보여 주고 바꿀 수 있게 한다.
  characterId?: string | null;
  onChangeCharacter?: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [entered, setEntered] = useState(false);
  const setAudioStarted = useGame((s) => s.setAudioStarted);
  // [FEAT-04] 저장된 캐릭터를 찾지 못하면 예전처럼 이름 첫 글자를 보여 준다.
  const character = characterById(characterId);

  if (entered) return null;

  const enter = async () => {
    setLeaving(true);
    setAudioStarted(true);
    void audio.start();
    window.setTimeout(() => setEntered(true), 780);
  };

  return (
    <div className={`start-overlay ${leaving ? 'is-leaving' : ''}`}>
      <div className="start-vignette" aria-hidden="true" />
      <div className="start-content">
        <p className="start-eyebrow">조용한 멀티플레이어 산책</p>
        <h1 className="start-title">숲속여행</h1>
        <p className="start-lead">
          산길을 걷고, 빈터의 불 옆에서 이야기를 나누고,
          <br />
          오두막의 벽난로 곁에서 쉬어 가세요.
        </p>

        <div className="start-card glass">
          <div className="start-who">
            {/* [FEAT-04] 이름 첫 글자 대신 지금 캐릭터 그림을 보여 준다. */}
            {character ? (
              <span className="start-avatar is-character" aria-hidden="true">
                <CharacterPreview character={character} />
              </span>
            ) : (
              <span className="start-avatar" aria-hidden="true">
                {name.slice(0, 1)}
              </span>
            )}
            <div>
              <strong>{name}</strong>
              <span>
                {character ? `${character.label} · ` : ''}
                {isGuest ? '게스트로 참여' : 'Google 계정으로 참여'}
                {typeof visitCount === 'number' && visitCount > 1
                  ? ` · ${visitCount}번째 산책`
                  : ' · 첫 산책'}
              </span>
            </div>
            {/* [FEAT-04] 지금 모습을 바꾸는 입구. 숲 안에서는 바꾸지 않는다. */}
            {onChangeCharacter && (
              <button type="button" className="start-change" onClick={onChangeCharacter}>
                모습 바꾸기
              </button>
            )}
          </div>
          <button type="button" className="start-btn" onClick={() => void enter()}>
            <span>숲으로 들어가기</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <p className="start-hint">
            숲소리·발소리·장작 소리가 함께 켜집니다. 화면을 클릭하면 시점이 고정됩니다.
          </p>
        </div>

        <div className="start-features">
          <span>🌿 1인칭 산책</span>
          <span>🔥 빈터의 모닥불</span>
          <span>🏚️ 2층 오두막</span>
          <span>🕯️ 한국 시간의 낮과 밤</span>
        </div>
      </div>

      <footer className="start-footer">
        <span>이어폰을 끼고 천천히 걸어 보세요.</span>
        <span>WASD · 마우스 · E · Enter</span>
      </footer>
    </div>
  );
}
