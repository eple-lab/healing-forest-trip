'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { CHARACTERS, storeCharacter, type Character } from '@/lib/characters';
import { useGame } from '@/store/game';

function HumanPreview({ character }: { character: Character }) {
  const long = character.hairStyle === 'long';
  return (
    <svg viewBox="0 0 120 150" role="img" aria-label={character.label}>
      {/* 뒷머리 (여성 스타일) */}
      {long && <ellipse cx="60" cy="62" rx="19" ry="24" fill={character.hair} />}
      {/* 몸통 */}
      <path
        d="M30 150 L36 96 C36 74 48 66 60 66 C72 66 84 74 84 96 L90 150 Z"
        fill={character.cloth}
      />
      {/* 목 */}
      <rect x="53" y="52" width="14" height="14" rx="4" fill={character.skin} />
      {/* 머리 */}
      <circle cx="60" cy="38" r="19" fill={character.skin} />
      {/* 머리카락 */}
      <path
        d="M41 38 A19 19 0 0 1 79 38 L79 28 A19 19 0 0 0 41 28 Z"
        fill={character.hair}
      />
      {/* 눈 */}
      <circle cx="53" cy="39" r="1.8" fill="#241a14" />
      <circle cx="67" cy="39" r="1.8" fill="#241a14" />
      {/* 미소 */}
      <path d="M54 46 Q60 50 66 46" stroke="#241a14" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* 배낭 */}
      <rect x="42" y="104" width="36" height="26" rx="7" fill="#7c5f3f" opacity="0.9" />
    </svg>
  );
}

function CatPreview({ character }: { character: Character }) {
  return (
    <svg viewBox="0 0 120 150" role="img" aria-label={character.label}>
      {/* 꼬리 */}
      <path d="M92 118 C104 110 106 84 96 74" stroke={character.hair} strokeWidth="7" fill="none" strokeLinecap="round" />
      {/* 몸통 */}
      <rect x="22" y="72" width="76" height="46" rx="20" fill={character.cloth} />
      {/* 다리 */}
      {[30, 46, 66, 82].map((x) => (
        <rect key={x} x={x} y="108" width="7" height="20" rx="3" fill={character.hair} />
      ))}
      {/* 머리 */}
      <circle cx="38" cy="60" r="17" fill={character.cloth} />
      {/* 귀 */}
      <polygon points="26,48 30,31 38,45" fill={character.hair} />
      <polygon points="42,45 50,30 52,49" fill={character.hair} />
      {/* 눈 */}
      <circle cx="32" cy="59" r="1.7" fill="#181820" />
      <circle cx="45" cy="59" r="1.7" fill="#181820" />
      {/* 코/입 */}
      <path d="M35.5 64 h5" stroke="#d7a6a0" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function DogPreview({ character }: { character: Character }) {
  return (
    <svg viewBox="0 0 120 150" role="img" aria-label={character.label}>
      {/* 꼬리 */}
      <path d="M94 108 C102 100 103 80 96 70" stroke={character.cloth} strokeWidth="7" fill="none" strokeLinecap="round" />
      {/* 몸통 */}
      <rect x="22" y="72" width="76" height="46" rx="19" fill={character.cloth} />
      {/* 다리 */}
      {[30, 46, 66, 82].map((x) => (
        <rect key={x} x={x} y="108" width="7" height="20" rx="3" fill={character.hair} />
      ))}
      {/* 머리 */}
      <circle cx="38" cy="58" r="17" fill={character.skin} />
      {/* 처진 귀 */}
      <ellipse cx="22" cy="56" rx="6" ry="11" fill={character.hair} transform="rotate(18 22 56)" />
      <ellipse cx="54" cy="56" rx="6" ry="11" fill={character.hair} transform="rotate(-18 54 56)" />
      {/* 눈 */}
      <circle cx="32" cy="56" r="1.7" fill="#241a14" />
      <circle cx="45" cy="56" r="1.7" fill="#241a14" />
      {/* 코 */}
      <circle cx="38.5" cy="64" r="2.2" fill="#241a14" />
    </svg>
  );
}

// [FEAT-04] 들어가기 화면에서도 지금 모습을 그대로 보여 줄 수 있도록 내보낸다.
export function CharacterPreview({ character }: { character: Character }) {
  if (character.kind === 'animal') {
    return character.animal === 'cat' ? (
      <CatPreview character={character} />
    ) : (
      <DogPreview character={character} />
    );
  }
  return <HumanPreview character={character} />;
}

const DESCRIPTIONS: Record<string, string> = {
  'man-forest': '초록빛 숲길을 걷는 사람',
  'man-cabin': '오두막의 불을 지키는 사람',
  'woman-moss': '이끼와 숲 향기를 좋아하는 사람',
  'woman-sunset': '노을 질 녘 걷는 사람',
  dog: '꼬리를 흔들며 곁을 지키는 여행자',
  cat: '살금살금, 그러나 반드시 곁에 있는 여행자',
};

// [FEAT-04] initialId/onDone 이 있으면 "모습 바꾸기" 모드로 연다. (숲에 들어가기 전 확인·변경)
export function CharacterSelect({
  initialId = null,
  onDone,
}: {
  initialId?: string | null;
  onDone?: () => void;
}) {
  const changing = typeof onDone === 'function';
  // [FEAT-04] 바꾸기 모드에서는 지금 캐릭터가 선택된 채로 열린다.
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const user = useGame((s) => s.user);
  const setCharacter = useGame((s) => s.setCharacter);
  const confirmEnabled = selected !== null;
  // [FEAT-04] 바꾸기 화면이 열리면 지금 선택된 카드에 포커스를 준다.
  const initialCardRef = useRef<HTMLButtonElement | null>(null);

  const choices = useMemo(() => CHARACTERS, []);

  useEffect(() => {
    document.title = '숲속여행 · 여행자를 골라 주세요';
  }, []);

  // [FEAT-04] 열릴 때 한 번만 지금 캐릭터 카드로 포커스를 옮긴다.
  useEffect(() => {
    if (changing) initialCardRef.current?.focus();
  }, [changing]);

  const confirm = async () => {
    if (!selected) return;
    storeCharacter(selected);
    setCharacter(selected);
    const socket = getSocket();
    if (socket.connected) socket.emit('profile:set', { character: selected });
    const response = await fetch('/api/profile/character', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ character: selected }),
    }).catch(() => null);
    if (response && !response.ok) {
      console.warn('[character] 서버 저장 실패. 로컬에만 기억합니다.');
    }
    // [FEAT-04] 바꾸기 모드에서는 저장한 뒤 들어가기 화면으로 돌아간다.
    onDone?.();
  };

  return (
    <div className="character-screen">
      <div className="character-inner">
        <p className="character-eyebrow">{changing ? '모습 바꾸기' : '처음 방문'}</p>
        <h1>숲에 데려갈 여행자를 골라 주세요</h1>
        <p className="character-sub">
          {user?.name ? `${user.name} 님, ` : ''}한 번 고르면 다른 나그네에게도 이 모습으로 보입니다.
        </p>
        <div className="character-grid" role="radiogroup" aria-label="캐릭터 선택">
          {choices.map((choice) => {
            const active = selected === choice.id;
            return (
              <button
                key={choice.id}
                // [FEAT-04] 지금 캐릭터 카드에 열릴 때 포커스를 준다.
                ref={changing && choice.id === initialId ? initialCardRef : undefined}
                type="button"
                role="radio"
                aria-checked={active}
                className={`character-card${active ? ' selected' : ''}`}
                onClick={() => setSelected(choice.id)}
              >
                <span className="character-avatar">
                  <CharacterPreview character={choice} />
                </span>
                <span className="character-name">{choice.label}</span>
                <span className="character-desc">{DESCRIPTIONS[choice.id] ?? ''}</span>
              </button>
            );
          })}
        </div>
        <div className="character-actions">
          <button type="button" className="character-confirm" disabled={!confirmEnabled} onClick={confirm}>
            {changing ? '이 모습으로 정하기' : '이 캐릭터로 숲에 들어가기'}
          </button>
          {/* [FEAT-04] 바꾸기 모드에는 [취소]로 아무것도 바꾸지 않고 돌아갈 수 있다. */}
          {changing && (
            <button type="button" className="character-cancel" onClick={() => onDone?.()}>
              취소
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
