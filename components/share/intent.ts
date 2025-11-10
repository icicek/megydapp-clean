// components/share/intent.ts
// Only builds share URLs or returns helpers; no window DOM calls here.

export type SharePayload = {
  url: string;
  text: string;
  hashtags?: string[];   // e.g., ["MEGY","Coincarnation"]
  via?: string;          // e.g., "Coincarnation"
  utm?: string;          // e.g., "ref:z1k:src:app:ctx:leaderboard"  (Levershare short-code)
  subject?: string;      // email subject (optional)
};

export type Channel =
  | 'twitter'
  | 'telegram'
  | 'whatsapp'
  | 'email'
  | 'copy'
  | 'instagram'
  | 'tiktok';

export type BuildOptions = {
  /** referral code (preferred). Eğer verilmezse URL’deki ?r= yakalanır. */
  ref?: string;
  /** kaynak: app | xshare | tgshare | etc. Varsayılan: 'app' */
  src?: string;
  /** bağlam: success | leaderboard | profile | contribution | claim | ... */
  ctx?: string;
  /** tone override vs. ileride eklemek için boşluk bıraktık */
};

// ---------- internals ----------

function getRefFromUrl(u: string): string | undefined {
  try {
    const url = new URL(u);
    const r = url.searchParams.get('r') || url.searchParams.get('ref');
    return r || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Levershare short-code → gerçek query paramları
 * - utm kısa biçim gelirse: "ref:xxx:src:app:ctx:leaderboard"
 * - klasik biçim gelirse: "utm_source=...&utm_medium=...": geriye dönük destek
 */
function addUtm(u: string, utm?: string): string {
  try {
    const url = new URL(u);

    // 1) Eski stil (utm_source=…): geriye dönük destek
    if (utm && utm.includes('=')) {
      for (const part of utm.split('&')) {
        const [k, v] = part.split('=');
        if (k) url.searchParams.set(k, v ?? '');
      }
      return url.toString();
    }

    // 2) Yeni kısa stil (ref:…:src:…:ctx:…)
    if (utm && utm.includes(':')) {
      const parts = utm.split(':');
      for (let i = 0; i < parts.length; i += 2) {
        const k = parts[i];
        const v = parts[i + 1];
        if (k && v) url.searchParams.set(k, v);
      }
      return url.toString();
    }

    // 3) utm yoksa aynen bırak
    return url.toString();
  } catch {
    return u;
  }
}

// ---- URL builders (no side effects) ----

export function buildTwitterIntent(p: SharePayload): string {
  const params = new URLSearchParams();
  if (p.text) params.set('text', p.text);
  if (p.url)  params.set('url', addUtm(p.url, p.utm));
  if (p.hashtags?.length) params.set('hashtags', p.hashtags.join(','));
  if (p.via) params.set('via', p.via);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

// Telegram: web intent
export function buildTelegramWeb(p: SharePayload): string {
  const params = new URLSearchParams();
  if (p.url)  params.set('url', addUtm(p.url, p.utm));
  if (p.text) params.set('text', p.text);
  return `https://t.me/share/url?${params.toString()}`;
}

// WhatsApp: web intent
export function buildWhatsAppWeb(p: SharePayload): string {
  const combined = `${p.text ? p.text + ' ' : ''}${addUtm(p.url, p.utm)}`.trim();
  const params = new URLSearchParams({ text: combined });
  return `https://wa.me/?${params.toString()}`;
}

// Email: mailto
export function buildEmailIntent(p: SharePayload): string {
  const subject = p.subject || 'Check this out';
  const body = `${p.text}\n\n${addUtm(p.url, p.utm)}`;
  const params = new URLSearchParams({ subject, body });
  return `mailto:?${params.toString()}`;
}

// Kopyalama: modal içinde panoya basılacak metni üretir
export function buildCopyText(p: SharePayload): string {
  const tags = p.hashtags?.length ? ` #${p.hashtags.join(' #')}` : '';
  const link = addUtm(p.url, p.utm);
  return `${p.text}\n${link}${tags ? `\n${tags}` : ''}`;
}

/**
 * Uygulama deeplink adayları (mobilde uygulamayı açmayı dener, başarılı olmazsa web fallback kullanılmalı).
 * Instagram ve TikTok caption’ı önceden doldurtmuyor; sadece uygulamayı açarız.
 */
export const APP_LINKS = {
  telegram: (p: SharePayload) => [
    'tg://msg',
    'tg://',
    buildTelegramWeb(p)
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

// ---------- payload builder (metin + kısa UTM) ----------

/**
 * Bağlama göre varsayılan metin üretir ve kısa UTM’yi ekler.
 * - context: 'success' | 'leaderboard' | 'profile' | 'contribution' | 'claim' | ...
 * - data: { url, token?, amount?, rank? ... }
 * - opts: { ref?, src?, ctx? }  (ctx verilmezse context kullanılır, src varsayılan 'app')
 */
export function buildPayload(
  context:
    | 'success'
    | 'leaderboard'
    | 'profile'
    | 'contribution'
    | 'claim'
    | (string & {}),
  data: {
    url: string;
    token?: string;
    amount?: number | string;
    rank?: number;
    tone?: 'playful' | 'serious';
    hashtags?: string[];
    via?: string;
    subject?: string;
  },
  opts?: BuildOptions
): SharePayload {
  const tone = data.tone ?? 'playful';
  const via = data.via ?? 'Levershare';
  const hashtags = data.hashtags ?? ['Levershare', 'Coincarnation'];

  // ---- metin şablonları
  const T = {
    success: (token?: string) =>
      tone === 'serious'
        ? `I just revived ${token ? '$' + token : 'a token'} into $MEGY on Levershare.`
        : `Revived ${token ? '$' + token : 'a token'} into $MEGY. One step closer to the Fair Future.`,
    leaderboard: (rank?: number) =>
      tone === 'serious'
        ? (rank ? `I’m currently #${rank} on the Levershare Leaderboard.` : `Join the Levershare Leaderboard.`)
        : (rank ? `Climbing! I’m #${rank} on the Levershare Leaderboard.` : `Join the Levershare Leaderboard — let’s climb.`),
    profile: () =>
      tone === 'serious'
        ? `I’m building value on Levershare.`
        : `I’m building value on Levershare — come with me.`,
    contribution: (token?: string, amount?: number | string) =>
      tone === 'serious'
        ? `Contributed ${amount ?? ''} ${token ?? ''} to revive the Fair Future Fund.`
        : `Sent ${amount ?? ''} ${token ?? ''} to revive the Fair Future Fund. Let’s go!`,
    claim: () =>
      tone === 'serious'
        ? `Claiming my $MEGY on Levershare.`
        : `Claim time. $MEGY unlocked on Levershare.`,
  } as const;

  // context’e göre metin
  let text = '';
  switch (context) {
    case 'success':
      text = T.success(data.token);
      break;
    case 'leaderboard':
      text = T.leaderboard(data.rank);
      break;
    case 'profile':
      text = T.profile();
      break;
    case 'contribution':
      text = T.contribution(data.token, data.amount);
      break;
    case 'claim':
      text = T.claim();
      break;
    default:
      text = data.token ? `Levershare — $${data.token}` : 'Levershare';
  }

  // ---- kısa UTM’yi hazırla (ref/src/ctx)
  const ctx = opts?.ctx ?? context;
  const src = (opts?.src || 'app').toLowerCase();       // varsayılan: app
  const ref = opts?.ref ?? getRefFromUrl(data.url);     // URL’de ?r= varsa al

  // short-code: "ref:...:src:...:ctx:..."
  const short = [
    ref ? `ref:${ref}` : '',
    `src:${src}`,
    `ctx:${ctx}`,
  ].filter(Boolean).join(':');

  // payload
  const payload: SharePayload = {
    url: data.url,
    text,
    hashtags,
    via,
    subject: data.subject,
    utm: short || undefined,
  };

  return payload;
}
