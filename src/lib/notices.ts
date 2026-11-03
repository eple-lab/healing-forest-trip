'use client';

/**
 * 입구 알림판 공지 클라이언트 캐시
 * ─────────────────────────────────────────────
 * - 공지는 읽고 나면 다시 조회할 필요가 없으므로,
 *   localStorage 에 12시간 동안 캐싱하고 그 안에는 네트워크 요청을 보내지 않는다.
 * - 관리자가 DB(Neon)에서 공지를 바꾸면 서버가 `notices:changed` 를 보내고,
 *   그때는 force 로 다시 조회한다 (If-None-Match → 304 지원).
 * - 읽은 공지는 READ_KEY 에 ID 로 기록해 중복 안내를 하지 않는다.
 */

import type { Notice } from '@/types/game';

const CACHE_KEY = 'forest.notices.v1';
const READ_KEY = 'forest.notices.read.v1';
const FRESH_MS = 12 * 60 * 60 * 1000;
const MAX_ITEMS = 20;
const MAX_READ_IDS = 300;

export const FALLBACK_NOTICES: Notice[] = [
  {
    id: 'welcome',
    title: '숲속여행에 오신 것을 환영합니다',
    body: '관리자가 공지를 등록하면 이 알림판에 표시됩니다. 브라우저를 닫으면 로그아웃되니 다시 오실 때는 로그인해 주세요.',
    category: 'update',
    pinned: true,
    publishedAt: '2026-11-03T00:00:00.000Z',
  },
];

type Cache = { fetchedAt: number; etag: string | null; items: Notice[] };

function safeParse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function sanitize(input: unknown): Notice[] {
  const raw = (input as { items?: unknown })?.items ?? input;
  if (!Array.isArray(raw)) return [];
  const out: Notice[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const n = item as Record<string, unknown>;
    const id = typeof n.id === 'string' || typeof n.id === 'number' ? String(n.id) : '';
    const title = typeof n.title === 'string' ? n.title.slice(0, 80) : '';
    const body = typeof n.body === 'string' ? n.body.slice(0, 500) : '';
    if (!id || !title || !body) continue;
    out.push({
      id,
      title,
      body,
      category: typeof n.category === 'string' ? n.category.slice(0, 32) : 'notice',
      pinned: n.pinned === true,
      publishedAt:
        typeof n.publishedAt === 'string' ? n.publishedAt : new Date().toISOString(),
    });
    if (out.length >= MAX_ITEMS) break;
  }
  out.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt));
  return out;
}

export function readCachedNotices(): Cache | null {
  if (typeof window === 'undefined') return null;
  const parsed = safeParse<Cache>(window.localStorage.getItem(CACHE_KEY));
  if (!parsed || !Array.isArray(parsed.items)) return null;
  return {
    fetchedAt: Number.isFinite(parsed.fetchedAt) ? parsed.fetchedAt : 0,
    etag: typeof parsed.etag === 'string' ? parsed.etag : null,
    items: sanitize(parsed.items),
  };
}

export function isFresh(cache: Cache | null, now = Date.now()): boolean {
  return Boolean(cache && now - cache.fetchedAt < FRESH_MS && cache.items.length > 0);
}

export function readReadIds(): string[] {
  if (typeof window === 'undefined') return [];
  const parsed = safeParse<unknown[]>(window.localStorage.getItem(READ_KEY));
  return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
}

export function markReadIds(ids: string[]) {
  if (typeof window === 'undefined' || ids.length === 0) return;
  const current = new Set(readReadIds());
  for (const id of ids) current.add(id);
  window.localStorage.setItem(READ_KEY, JSON.stringify(Array.from(current).slice(-MAX_READ_IDS)));
}

export function unreadCount(items: Notice[]): number {
  const read = new Set(readReadIds());
  return items.reduce((acc, item) => acc + (read.has(item.id) ? 0 : 1), 0);
}

function saveCache(items: Notice[], etag: string | null, fetchedAt: number) {
  if (typeof window === 'undefined') return;
  const payload: Cache = { fetchedAt, etag, items };
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* 용량 초과 등: 조용히 무시 */
  }
}

export type LoadNoticesResult = {
  items: Notice[];
  unread: number;
  source: 'cache' | 'network' | 'fallback';
};

/**
 * 공지를 불러온다.
 * - 캐시가 싱싱하고 force 가 아니면 네트워크 요청을 보내지 않는다.
 * - force 거나 캐시가 없으면 한 번만 네트워크로 확인한다.
 * - 304/424(HTTP 실패) 시 기존 캐시를 그대로 사용한다.
 */
export async function loadNotices({
  force = false,
}: { force?: boolean } = {}): Promise<LoadNoticesResult> {
  const cached = readCachedNotices();
  if (!force && isFresh(cached)) {
    return { items: cached!.items, unread: unreadCount(cached!.items), source: 'cache' };
  }

  const headers: Record<string, string> = {};
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  try {
    const response = await fetch('/api/announcements', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
    });

    if (response.status === 304 && cached) {
      const items = cached.items;
      saveCache(items, cached.etag, Date.now());
      return { items, unread: unreadCount(items), source: 'cache' };
    }

    if (!response.ok) throw new Error(`announcements http ${response.status}`);
    const data = (await response.json()) as unknown;
    const items = sanitize(data);
    const etag = response.headers.get('ETag');
    saveCache(items, etag, Date.now());
    return { items, unread: unreadCount(items), source: 'network' };
  } catch {
    if (cached && cached.items.length > 0) {
      return { items: cached.items, unread: unreadCount(cached.items), source: 'cache' };
    }
    return {
      items: FALLBACK_NOTICES,
      unread: unreadCount(FALLBACK_NOTICES),
      source: 'fallback',
    };
  }
}
