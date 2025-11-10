// components/share/intent.ts
// Centralized share payload builder + channel intent URL helpers
// No DOM/window usage here – safe for SSR.

export type Tone = 'playful' | 'short' | 'serious';

export type SharePayload = {
  url: string;          // final URL (with ref/src/ctx merged)
  text: string;         // post text (includes $MEGY / $<TOKEN> if applicable)
  hashtags?: string[];  // e.g., ["Coincarnation"]
  via?: string;         // e.g., "levershare" (no @)
  utm?: string;         // optional extra UTM pairs (k=v&k2=v2)
  subject?: string;     // email subject (optional)
};

export type Channel =
  | 'twitter'
  | 'telegram'
  | 'whatsapp'
  | 'email'
  | 'copy'
  | 'instagram'
  | 'tiktok';

// ----------------- small utils -----------------

const DEFAULT_VIA = 'levershare';
const DEFAULT_HASHTAGS: string[] = ['Coincarnation']; // keep minimal; cashtags go in text

const toTicker = (s?: string) =>
  (s ?? '').replace(/\$/g, '').trim().toUpperCase();

const toCashtag = (s?: string) => {
  const t = toTicker(s);
  if (!t || t.length > 12 || /[^A-Z0-9._-]/.test(t)) return '';
  return `$${t}`;
};

function safeUrl(u?: string): URL | null {
  try {
    if (!u) return null;
    return new URL(u);
  } catch {
    return null;
  }
}

// merge tracking params into URL (ref, src, ctx) + optional extra utm pairs
function enrichUrl(baseUrl: string, opts?: { ref?: string; src?: string; ctx?: string; utm?: string }): string {
  const u = safeUrl(baseUrl);
  if (!u) return baseUrl;
  if (opts?.ref) u.searchParams.set('ref', opts.ref);
  if (opts?.src) u.searchParams.set('src', opts.src);
  if (opts?.ctx) u.searchParams.set('ctx', opts.ctx);
  if (opts?.utm) {
    for (const part of opts.utm.split('&')) {
      const [k, v] = part.split('=');
      if (k) u.searchParams.set(k, v ?? '');
    }
  }
  return u.toString();
}

// if an extra UTM string is supplied, add it as query pairs
function addUtm(u: string, utm?: string): string {
  if (!utm) return u;
  const url = safeUrl(u);
  if (!url) return u;
  for (const part of utm.split('&')) {
    const [k, v] = part.split('=');
    if (k) url.searchParams.set(k, v ?? '');
  }
  return url.toString();
}

// builds a single plain text for copy modal
export function buildCopyText(p: SharePayload): string {
  const link = addUtm(p.url, p.utm);
  const via = p.via ? `\nvia @${p.via.replace(/^@/, '')}` : '';
  const tags = p.hashtags?.length ? `\n#${p.hashtags.join(' #')}` : '';
  return `${p.text}\n${link}${via}${tags}`;
}

// ----------------- context text templates -----------------

function textForSuccess(p: { token?: string; tone?: Tone }): string {
  const megy = '$MEGY';
  const coin = toCashtag(p.token);
  // concise & playful by default
  return `Revived ${coin} into ${megy}. Join the rebirth.`;
}

function textForContribution(p: { token?: string; amount?: number; tone?: Tone }): string {
  const megy = '$MEGY';
  const coin = toCashtag(p.token);
  const amt =
    typeof p.amount === 'number' && isFinite(p.amount) && p.amount > 0
      ? ` ${Number(p.amount).toString()}`
      : '';
  return `I just Coincarnated${amt} ${coin} → ${megy}. Be part of it.`;
}

function textForLeaderboard(p: { rank?: number; tone?: Tone }): string {
  const megy = '$MEGY';
  if (typeof p.rank === 'number' && p.rank > 0) {
    return `Climbing the Coincarnation Leaderboard with ${megy}. I’m #${p.rank}.`;
  }
  return `Join the Coincarnation Leaderboard with ${megy}.`;
}

function textForProfile(_p: { tone?: Tone }): string {
  const megy = '$MEGY';
  return `I’m reviving the Fair Future Fund with ${megy}. Use my link & jump in.`;
}

// ----------------- Public builder -----------------

/**
 * Central entry: returns a SharePayload with:
 * - text: context-aware (success/contribution/leaderboard/profile), cashtag ready
 * - url: base url + (ref, src, ctx) merged
 * - via: "levershare" (default)
 * - hashtags: ["Coincarnation"] (default)
 */
export function buildPayload(
  ctx: 'success' | 'contribution' | 'leaderboard' | 'profile',
  data: {
    url: string;
    token?: string;
    amount?: number;
    rank?: number;
    tone?: Tone;
    hashtags?: string[];
    via?: string;
    utm?: string;      // optional additional utm pairs
    subject?: string;  // for email
  },
  opts?: {
    ref?: string;      // referral code (added as ?ref=)
    src?: string;      // source tag, e.g. "app" (added as ?src=)
    ctx?: string;      // overrides query ctx (defaults to ctx arg)
  }
): SharePayload {
  const finalUrl = enrichUrl(
    data.url,
    {
      ref: opts?.ref,
      src: opts?.src ?? 'app',
      ctx: opts?.ctx ?? ctx,
      utm: data.utm,
    }
  );

  // choose template
  let text = '';
  if (ctx === 'success') {
    text = textForSuccess({ token: data.token, tone: data.tone });
  } else if (ctx === 'contribution') {
    text = textForContribution({ token: data.token, amount: data.amount, tone: data.tone });
  } else if (ctx === 'leaderboard') {
    text = textForLeaderboard({ rank: data.rank, tone: data.tone });
  } else {
    text = textForProfile({ tone: data.tone });
  }

  return {
    url: finalUrl,
    text,
    hashtags: data.hashtags ?? DEFAULT_HASHTAGS,
    via: (data.via ?? DEFAULT_VIA).replace(/^@/, ''),
    utm: data.utm,
    subject: data.subject,
  };
}

// ----------------- Channel intent builders -----------------

export function buildTwitterIntent(p: SharePayload): string {
  const params = new URLSearchParams();
  if (p.text) params.set('text', p.text);                  // contains $MEGY / $TOKEN
  if (p.url) params.set('url', addUtm(p.url, p.utm));
  if (p.hashtags?.length) params.set('hashtags', p.hashtags.join(','));
  if (p.via) params.set('via', p.via.replace(/^@/, ''));   // "levershare"
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

// Telegram (web)
export function buildTelegramWeb(p: SharePayload): string {
  const params = new URLSearchParams();
  if (p.url) params.set('url', addUtm(p.url, p.utm));
  if (p.text) params.set('text', p.text);
  return `https://t.me/share/url?${params.toString()}`;
}

// WhatsApp (web)
export function buildWhatsAppWeb(p: SharePayload): string {
  const combined = `${p.text ? p.text + ' ' : ''}${addUtm(p.url, p.utm)}`.trim();
  const params = new URLSearchParams({ text: combined });
  return `https://wa.me/?${params.toString()}`;
}

// Email
export function buildEmailIntent(p: SharePayload): string {
  const subject = p.subject || 'Check this out';
  const body = `${p.text}\n\n${addUtm(p.url, p.utm)}\nvia @${(p.via ?? DEFAULT_VIA).replace(/^@/, '')}`;
  const params = new URLSearchParams({ subject, body });
  return `mailto:?${params.toString()}`;
}

// ----------------- App deep links (mobile) -----------------

/**
 * App deeplink candidates. First entries attempt app open; last entries are safe web fallbacks.
 * Instagram/TikTok don’t accept prefilled captions; we only open the app or web.
 */
export const APP_LINKS = {
  telegram: (p: SharePayload) => [
    'tg://msg',
    'tg://',
    buildTelegramWeb(p),
  ],
  whatsapp: (p: SharePayload) => [
    `whatsapp://send?text=${encodeURIComponent(`${p.text} ${addUtm(p.url, p.utm)}`.trim())}`,
    buildWhatsAppWeb(p),
  ],
  instagram: (_p: SharePayload) => [
    'instagram://app',
    'https://www.instagram.com/',
  ],
  tiktok: (_p: SharePayload) => [
    'tiktok://',
    'snssdk1128://',
    'https://www.tiktok.com/explore',
  ],
};
