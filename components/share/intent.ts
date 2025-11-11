// components/share/intent.ts
// Merkez share helper'ları: tek yerde metin üretimi, URL kuralları, intent builder'lar.

export type SharePayload = {
  url: string;        // temel sayfa (APP_URL gibi)
  text: string;       // kanala gönderilecek metin (kısa, etkili)
  hashtags?: string[];  // örn: ["MEGY","FairFutureFund"]
  via?: string;         // örn: "levershare"  (⚠️ '@' YOK)
  utm?: string;         // örn: "utm_source=share&utm_medium=app"
  subject?: string;     // email için opsiyonel
};

export type Channel =
  | 'twitter'
  | 'telegram'
  | 'whatsapp'
  | 'email'
  | 'copy'
  | 'instagram'
  | 'tiktok';

export type ShareMeta = {
  ref?: string;  // referral code
  src?: string;  // 'app' | 'claimpanel' | 'leaderboard' | 'success' ...
  ctx?: string;  // 'success' | 'profile' | 'contribution' | 'leaderboard'
};

// ------------------------- URL yardımcıları -------------------------

function applyUtm(u: URL, utm?: string) {
  if (!utm) return;
  for (const part of utm.split('&')) {
    const [k, v] = part.split('=');
    if (k) u.searchParams.set(k, v ?? '');
  }
}

export function makeShareUrl(baseUrl: string, meta?: ShareMeta, utm?: string) {
  try {
    const u = new URL(baseUrl);
    if (meta?.ref) u.searchParams.set('r', meta.ref);
    if (meta?.src) u.searchParams.set('src', meta.src);
    if (meta?.ctx) u.searchParams.set('ctx', meta.ctx);
    applyUtm(u, utm);
    return u.toString();
  } catch {
    return baseUrl;
  }
}

// ------------------------- Intent URL builder'ları -------------------------

export function buildTwitterIntent(p: SharePayload, meta?: ShareMeta): string {
  const params = new URLSearchParams();
  if (p.text) params.set('text', p.text);
  if (p.url)  params.set('url', makeShareUrl(p.url, meta, p.utm));
  if (p.hashtags?.length) params.set('hashtags', p.hashtags.join(','));
  if (p.via) params.set('via', p.via.replace(/^@/, ''));
  // x.com/intent/post da olur ama twitter.com daha yaygın
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function buildTelegramWeb(p: SharePayload, meta?: ShareMeta): string {
  const params = new URLSearchParams();
  if (p.url)  params.set('url', makeShareUrl(p.url, meta, p.utm));
  if (p.text) params.set('text', p.text);
  return `https://t.me/share/url?${params.toString()}`;
}

export function buildWhatsAppWeb(p: SharePayload, meta?: ShareMeta): string {
  const combined = `${p.text ? p.text + ' ' : ''}${makeShareUrl(p.url, meta, p.utm)}`.trim();
  const params = new URLSearchParams({ text: combined });
  return `https://wa.me/?${params.toString()}`;
}

export function buildEmailIntent(p: SharePayload, meta?: ShareMeta): string {
  const subject = p.subject || 'Check this out';
  const body = `${p.text}\n\n${makeShareUrl(p.url, meta, p.utm)}`;
  const params = new URLSearchParams({ subject, body });
  return `mailto:?${params.toString()}`;
}

/**
 * Uygulama deeplink adayları (mobil: uygulamayı açmayı dener; olmadı web'e düşer).
 * Instagram / TikTok text prefill desteklemez, sadece app açılır.
 */
export const APP_LINKS = {
  telegram: (p: SharePayload, meta?: ShareMeta) => [
    'tg://msg',
    'tg://',
    buildTelegramWeb(p, meta),
  ],
  whatsapp: (p: SharePayload, meta?: ShareMeta) => [
    `whatsapp://send?text=${encodeURIComponent(
      `${p.text} ${makeShareUrl(p.url, meta, p.utm)}`.trim()
    )}`,
    buildWhatsAppWeb(p, meta),
  ],
  instagram: () => [
    'instagram://app',
    'https://www.instagram.com/',
  ],
  tiktok: () => [
    'tiktok://',
    'snssdk1128://',
    'https://www.tiktok.com/explore',
  ],
};

// ------------------------- Copy metni -------------------------

// Metin + boş satır + tam link + (tags/via satırı)
export function buildCopyText(p: SharePayload, meta?: ShareMeta): string {
  const url = p.url ? makeShareUrl(p.url, meta, p.utm) : '';
  const tags = p.hashtags?.length ? `#${p.hashtags.join(' #')}` : '';
  const via  = p.via ? `via @${p.via.replace(/^@/, '')}` : '';

  const parts = [
    p.text?.trim() ?? '',
    '',       // okunabilirlik için boş satır
    url,
    '',       // tags/via ayrı satırda dursun
    [tags, via].filter(Boolean).join(' ')
  ];

  return parts
    .map(s => (s ?? '').trim())
    .filter((s, i, arr) => s.length > 0 && !(i > 0 && s === arr[i-1]))
    .join('\n');
}

// ------------------------- Metin şablonları (tek yerden) -------------------------

type Tone = 'playful' | 'direct';

type BuildArgsBase = { url: string; tone?: Tone };
type SuccessArgs      = BuildArgsBase & { token: string; rank: number };
type ContributionArgs = BuildArgsBase & { token: string; amount: number | string };
type LeaderboardArgs  = BuildArgsBase & { rank?: number };
type ProfileArgs      = BuildArgsBase;

export function buildPayload(
  ctx: 'success' | 'contribution' | 'leaderboard' | 'profile',
  args: SuccessArgs | ContributionArgs | LeaderboardArgs | ProfileArgs,
  meta?: ShareMeta
): SharePayload {
  const tone: Tone = (args as any).tone ?? 'playful';
  const baseUrl = makeShareUrl(args.url, meta); // payload.url olarak da UTM/ref/src/ctx içersin

  const via = 'levershare'; // X hesabınız (via @levershare)
  const hashtags = ['MEGY', 'Coincarnation']; // kısa ve markalı

  const T = {
    success: (a: SuccessArgs) =>
      tone === 'playful'
        ? `I just revived $${a.token}. I’m Coincarnator #${a.rank}. $MEGY`
        : `Revived $${a.token}. Coincarnator #${a.rank}. $MEGY`,
    contribution: (a: ContributionArgs) =>
      tone === 'playful'
        ? `Reviving $${a.token} (${String(a.amount)}) into $MEGY. Join me.`
        : `Contributed ${String(a.amount)} $${a.token} to $MEGY.`,
    leaderboard: (a: LeaderboardArgs) =>
      typeof a.rank === 'number'
        ? (tone === 'playful'
            ? `I said “revive,” not “hodl.” I’m #${a.rank} on the Leaderboard. $MEGY`
            : `Leaderboard rank #${a.rank}. $MEGY`)
        : (tone === 'playful'
            ? `Chasing the Leaderboard. Revive with me. $MEGY`
            : `Join the Leaderboard. $MEGY`),
    profile: (_: ProfileArgs) =>
      tone === 'playful'
        ? `Your value, revived. Build your $MEGY story with Coincarnation.`
        : `Build your $MEGY position with Coincarnation.`,
  };

  const text = T[ctx](args as any);

  return {
    url: baseUrl,         // zaten ref/src/ctx ile zenginleşmiş
    text,
    hashtags,
    via,
    utm: 'utm_source=share&utm_medium=app&utm_campaign=' + ctx,
  };
}
