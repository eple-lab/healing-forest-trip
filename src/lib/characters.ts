'use client';

import { CHARACTERS, CHARACTER_IDS, isCharacterId } from './character-ids';
import type { SharedCharacter } from './character-ids';

export type Character = SharedCharacter;
export { CHARACTERS, CHARACTER_IDS, isCharacterId };

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));
const STORAGE_KEY = 'forest.character.v1';

export function characterById(id: string | null | undefined): Character | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

export function readStoredCharacter(): Character | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return characterById(raw);
  } catch {
    return null;
  }
}

export function storeCharacter(id: string): void {
  if (typeof window === 'undefined' || !CHARACTER_IDS.has(id)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* 시크릿 모드 등: 세션만 유지 */
  }
}
