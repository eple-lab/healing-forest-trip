import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCharacter } from '../../../server/db.mjs';
import { ForestExperience } from '@/components/forest/ForestExperience';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '숲으로 들어가기',
  robots: { index: false, follow: false },
};

export default async function ForestPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/');

  const name = session.user.name?.trim() || '나그네';

  let initialCharacter: string | null = null;
  try {
    initialCharacter = await getCharacter(session.user.id ?? '');
  } catch {
    initialCharacter = null;
  }

  return (
    <ForestExperience
      user={{
        id: session.user.id ?? '',
        name,
        image: session.user.image ?? null,
        isGuest: session.user.isGuest === true,
      }}
      initialCharacter={initialCharacter}
    />
  );
}
