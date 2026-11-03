import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isCharacterId } from '@/lib/character-ids';
import { setCharacter } from '../../../../../server/db.mjs';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const character = body?.character;
  if (!isCharacterId(character)) {
    return Response.json({ error: 'invalid_character' }, { status: 400 });
  }

  try {
    const result = await setCharacter({
      userId: session.user.id,
      provider: session.user.isGuest === true ? 'guest' : 'google',
      name: session.user.name ?? '나그네',
      image: session.user.image ?? null,
      character,
    });
    return Response.json({ ok: true, saved: result.saved });
  } catch (err) {
    console.warn('[profile] character save failed:', (err as Error)?.message ?? 'unknown');
    return Response.json({ ok: false }, { status: 503 });
  }
}
