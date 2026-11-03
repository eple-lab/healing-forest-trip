import data from '../../shared/characters.json';

export type SharedCharacter = (typeof data.characters)[number];

export const CHARACTERS = data.characters as readonly SharedCharacter[];
export const CHARACTER_IDS = new Set<string>(CHARACTERS.map((c) => c.id));

export function isCharacterId(input: unknown): input is string {
  return typeof input === 'string' && CHARACTER_IDS.has(input);
}
