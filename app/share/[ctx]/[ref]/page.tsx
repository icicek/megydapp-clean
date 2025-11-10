// app/share/[ctx]/[ref]/page.tsx
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const runtime = 'edge';

const BASE = 'https://coincarnation.com';
const BOT_UA =
  /(Twitterbot|facebookexternalhit|WhatsApp|Telegram|LinkedInBot|Slackbot|Discordbot|Googlebot|Bingbot)/i;

type Params = { ctx: string; ref: string };

export async function generateMetadata(
  { params }: { params: Params }
): Promise<Metadata> {
  const { ctx } = params;

  const titleMap: Record<string, string> = {
    success: 'I just Coincarnated — Levershare',
    contribution: 'Joining the Coincarnation — Levershare',
    leaderboard: 'I’m climbing the Leaderboard — Levershare',
    profile: 'My Coincarnation Profile — Levershare',
  };
  const title = titleMap[ctx] || 'Levershare — Coincarnation';

  const description =
    'Revive deadcoins. Join the Fair Future Fund with MEGY. Coincarnation by Levershare.';

  const ogImage = `${BASE}/og/og-default.png`;

  return {
    metadataBase: new URL(BASE),
    alternates: { canonical: BASE },
    title,
    description,
    openGraph: {
      type: 'website',
      url: BASE,
      siteName: 'Levershare',
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: 'Coincarnation — Fair Future Fund' }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@levershare',
      creator: '@levershare',
      title,
      description,
      images: [ogImage],
    },
    robots: { index: true, follow: true },
  };
}

export default function ShareLanding({ params }: { params: Params }) {
  // ✅ tip hatasını sıfırlayan çözüm
  const h = headers();
    type HasGet = { get(name: string): string | null };
    const ua = ((h as unknown as Partial<HasGet>).get?.('user-agent')) ?? '';

  if (!BOT_UA.test(ua)) {
    const { ctx, ref } = params;
    const url = new URL(BASE);
    if (ref && ref !== '-') {
      url.searchParams.set('r', ref);
      url.searchParams.set('ref', ref);
    }
    url.searchParams.set('src', 'app');
    url.searchParams.set('ctx', ctx);
    redirect(url.toString());
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'black',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Levershare — Coincarnation</h1>
        <p style={{ opacity: 0.8 }}>
          Revive deadcoins. Join the Fair Future Fund with MEGY.
        </p>
        <noscript>
          <p style={{ marginTop: 12 }}>
            <a href={BASE} style={{ color: '#60a5fa', textDecoration: 'underline' }}>
              Open Coincarnation
            </a>
          </p>
        </noscript>
      </div>
    </main>
  );
}
