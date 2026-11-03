import { getServerSession } from 'next-auth';
import { authOptions, googleEnabled, guestEnabled } from '@/lib/auth';
import { Landing } from '@/components/Landing';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  const rawError = searchParams?.error;
  const error = typeof rawError === 'string' ? rawError.slice(0, 40) : undefined;

  const sessionUser = session?.user?.name
    ? {
        name: session.user.name,
        image: session.user.image ?? null,
      }
    : null;

  return (
    <Landing
      sessionUser={sessionUser}
      googleEnabled={googleEnabled}
      guestEnabled={guestEnabled}
      error={error}
    />
  );
}
