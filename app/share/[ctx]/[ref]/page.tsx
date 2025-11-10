// app/share/[ctx]/[ref]/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Params = { ctx: string; ref: string };
type SearchParams = Record<string, string | string[] | undefined>;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://coincarnation.com';

/**
 * OG için basic metadata. İstersen buradaki başlık/açıklamayı özelleştirebilirsin.
 * Görseli dinamik üretmek istersen /api/og gibi bir endpoint’e bağlayabilirsin.
 */
export async function generateMetadata(
  { params }: { params: Promise<Params> }
): Promise<Metadata> {
  const { ctx, ref } = await params;

  const title = 'Levershare — Coincarnation';
  const description = 'Revive the Fair Future Fund with Coincarnation.';
  const ogImage = `${APP_URL}/og/base.png?ctx=${encodeURIComponent(ctx)}&ref=${encodeURIComponent(ref)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/share/${ctx}/${ref}`,
      images: [{ url: ogImage }],
      siteName: 'Levershare',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

/**
 * /share/[ctx]/[ref]?src=... → 302 ile anasayfaya yönlendirir:
 * https://coincarnation.com/?r=<ref>&ref=<ref>&src=<src>&ctx=<ctx>
 * (OG imaj bu sayfada render olur, tıklayınca ana sayfaya temiz parametrelerle gider.)
 */
export default async function ShareRedirectPage(
  { params, searchParams }: { params: Promise<Params>; searchParams: Promise<SearchParams> }
) {
  const { ctx, ref } = await params;
  const sp = await searchParams;

  // src opsiyonel: gelmezse 'app'
  const rawSrc = sp.src;
  const src = Array.isArray(rawSrc) ? rawSrc[0] : (rawSrc ?? 'app');

  // Hedef URL’yi kur
  const target = new URL(APP_URL);
  if (ref) {
    target.searchParams.set('r', ref);   // referans
    target.searchParams.set('ref', ref); // istersen bunu kaldırabilirsin, tek r= yeter
  }
  if (ctx) target.searchParams.set('ctx', ctx);
  if (src) target.searchParams.set('src', src);

  // 302 redirect (throw)
  redirect(target.toString());
}
