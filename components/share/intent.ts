// components/share/intent.ts
// Only builds share URLs or returns helpers; no window/DOM calls here.

export type SharePayload = {
  url: string;
  text: string;         // keep URL OUT of text; intent builders add it.
  hashtags?: string[];  // e.g., ["Levershare","MEGY"]
  via?: string;         // "levershare"
  utm?: string;         // e.g., "utm_source=share&utm_medium=app&utm_campaign=referral"
  subject?: string;     // for email
};

export type Channel =
  | 'twitter'
  | 'telegram'
  | 'whatsapp'
  | 'email'
  | 'copy'
  | 'instagram'
  | 'tiktok';

/* -------------------- small util -------------------- */
function addUtm(u: string, utm?: string): string {
  if (!utm) return u;
  try {
    const url = new URL(u);
    for (const part of utm.split('&')) {
      const [k, v] = part.split('=');
      if (k) url.searchParams.set(k, v ?? '');
    }
    return url.toString();
  } catch {
    return u;
  }
}

/* -------------------- URL builders -------------------- */
export function buildTwitterIntent(p: SharePayload): string {
  const params = new URLSearchParams();
  if (p.text) params.set('text', p.text);              // sentence only
  if (p.url) params.set('url', addUtm(p.url, p.utm));  // link separately
  if (p.hashtags?.length) params.set('hashtags', p.hashtags.join(','));
  if (p.via) params.set('via', p.via);                 // -> @levershare
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function buildTelegramWeb(p: SharePayload): string {
  const params = new URLSearchParams();
  if (p.url)  params.set('url', addUtm(p.url, p.utm));
  if (p.text) params.set('text', p.text);
  return `https://t.me/share/url?${params.toString()}`;
}

export function buildWhatsAppWeb(p: SharePayload): string {
  const combined = `${p.text ? p.text + ' ' : ''}${addUtm(p.url, p.utm)}`.trim();
  const params = new URLSearchParams({ text: combined });
  return `https://wa.me/?${params.toString()}`;
}

export function buildEmailIntent(p: SharePayload): string {
  const subject = p.subject || 'Check this out';
  const body = `${p.text}\n\n${addUtm(p.url, p.utm)}`;
  const params = new URLSearchParams({ subject, body });
  return `mailto:?${params.toString()}`;
}

export function buildCopyText(p: SharePayload): string {
  const tags = p.hashtags?.length ? ` #${p.hashtags.join(' #')}` : '';
  const link = addUtm(p.url, p.utm);
  return `${p.text}\n${link}${tags ? `\n${tags}` : ''}`;
}

/* -------------------- App links (deeplink candidates) -------------------- */
export const APP_LINKS = {
  telegram: (p: SharePayload) => ['tg://msg', 'tg://', buildTelegramWeb(p)],
  whatsapp: (p: SharePayload) => [
    `whatsapp://send?text=${encodeURIComponent(`${p.text} ${addUtm(p.url, p.utm)}`.trim())}`,
    buildWhatsAppWeb(p),
  ],
  instagram: (_p: SharePayload) => ['instagram://app', 'https://www.instagram.com/'],
  tiktok:    (_p: SharePayload) => ['tiktok://', 'snssdk1128://', 'https://www.tiktok.com/explore'],
};

/* -------------------- Context-based payload builder -------------------- */
export type ShareContext = 'success' | 'leaderboard' | 'profile' | 'contribution';
export type ShareTone    = 'playful' | 'cinematic' | 'professional';

/**
 * Merkezi payload üreticisi.
 * - Metinler kısa ve vurucu.
 * - URL metne eklenmez; intent builder ayrı ekler.
 * - 2 hashtag + via @levershare.
 * - Varsayılan ton: 'playful'
 */
export function buildPayload(
  ctx: ShareContext,
  data: {
    url: string;
    token?: string;
    amount?: number | string;
    rank?: number;
  },
  tone: ShareTone = 'playful'
): SharePayload {
  const utm = `utm_source=share&utm_medium=app&utm_campaign=${ctx}`;
  const via = 'levershare';
  const tagsBase = ['Levershare', 'MEGY'] as const;

  // ---- tone maps (sentence only; no link) ----
  const lines = {
    playful: {
      profile:      `Jump in with my invite—let’s revive value together!`,
      leaderboard:  `Climbing the board one share at a time. Catch me if you can!`,
      contribution: `Reviving $${data.token || 'TOKEN'}—future says thanks. 🚀`,
      success:      `Just Coincarne’d $${data.token || 'TOKEN'} for $MEGY—let’s make history!`,
    },
    cinematic: {
      profile:      `Answer the call—your revival starts here.`,
      leaderboard:  `Another step upward. The board keeps watching.`,
      contribution: `Value reborn: $${data.token || 'TOKEN'} fuels tomorrow.`,
      success:      `A spark in the dark—$${data.token || 'TOKEN'} reborn into $MEGY.`,
    },
    professional: {
      profile:      `Join via my referral—build real network value.`,
      leaderboard:  `Advancing on the leaderboard—your turn to move up.`,
      contribution: `Contributed $${data.token || 'TOKEN'} toward $MEGY. Solid step.`,
      success:      `Converted $${data.token || 'TOKEN'} to $MEGY successfully.`,
    },
  } as const;

  const text = lines[tone][ctx];

  // bağlama göre 2 hashtag seçimi (çok değişmesin, odak: Levershare + etkinlik)
  const hashtags =
    ctx === 'leaderboard' ? ['Levershare', 'Coincarnation'] :
    ctx === 'contribution' ? ['Levershare', 'Coincarnation'] :
    ctx === 'success' ? ['Levershare', 'FairFutureFund'] :
    [...tagsBase];

  return {
    url: data.url,
    text,
    hashtags,
    via,
    utm,
  };
}
