// components/share/intent.ts
// Tek sorumluluk: paylaşım metinlerini ve URL'lerini üretmek (DOM yok)

// ---- Types ----
export type SharePayload = {
  url: string;
  text: string;
  hashtags?: string[];
  via?: string;          // e.g. "Levershare"
  subject?: string;      // email subject (opsiyonel)
};

export type Channel =
  | 'twitter'
  | 'telegram'
  | 'whatsapp'
  | 'email'
  | 'copy'
  | 'instagram'
  | 'tiktok';

export type ShareContext = 'success' | 'contribution' | 'leaderboard' | 'profile';
export type ShareTone = 'playful' | 'minimal' | 'bold';

type BuildPayloadData = {
  url: string;          // base URL (genelde APP_URL — ama temiz linki biz üreteceğiz)
  token?: string;       // success / contribution için
  amount?: number | string;
  rank?: number;
  tone?: ShareTone;     // vermezsen 'playful'
  hashtags?: string[];  // vermezsen ['MEGY','Coincarnation']
  via?: string;         // vermezsen 'Levershare'
};

type BuildPayloadOpts = {
  ref?: string;         // referral code
  src?: string;         // kaynak etiketi (kayıt tutmak istersen; OG için kullanmıyoruz)
  // ctx otomatik geliyor (fonksiyon parametresi)
};

// ---- Sabitler ----
const BASE = 'https://coincarnation.com';

// OG/görsel uyumu için kısa link: /share/:ctx/:ref
function cleanShareLink(ctx: ShareContext, ref?: string) {
  const r = ref && ref.trim() ? ref.trim() : '-';
  return `${BASE}/share/${encodeURIComponent(ctx)}/${encodeURIComponent(r)}`;
}

// ---- Metin şablonları ----
function line(ctx: ShareContext, tone: ShareTone, d: BuildPayloadData): string {
  const token = d.token ? String(d.token).toUpperCase() : undefined;
  const amt = typeof d.amount === 'number' ? d.amount : d.amount ? Number(d.amount) : undefined;
  const rank = typeof d.rank === 'number' ? d.rank : undefined;

  // kısa, vurucu metinler
  const map: Record<ShareContext, Record<ShareTone, (p?: any) => string>> = {
    success: {
      playful: () =>
        `Revived ${token ? `$${token}` : 'a deadcoin'} → $MEGY. Fair Future Fund’a bir kıvılcım daha!`,
      minimal: () =>
        `Revived ${token ? `$${token}` : 'deadcoin'} → $MEGY.`,
      bold: () =>
        `I just Coincarnated ${token ? `$${token}` : 'a deadcoin'} into $MEGY.`
    },
    contribution: {
      playful: () =>
        `Dropped ${amt ? amt : 'some'} ${token ?? 'tokens'} to revive the Fair Future Fund. Join me!`,
      minimal: () =>
        `Contributed ${amt ?? ''} ${token ?? ''} → $MEGY.`,
      bold: () =>
        `Reviving the fund with ${amt ?? ''} ${token ?? ''}. #MEGY`
    },
    leaderboard: {
      playful: () =>
        rank ? `Climbing! I’m #${rank} on the Coincarnation Leaderboard.` : `Climbing the Coincarnation Leaderboard!`,
      minimal: () =>
        rank ? `Leaderboard: #${rank}.` : `Leaderboard.`,
      bold: () =>
        rank ? `I’m #${rank}. Catch me if you can.` : `Chasing the top.`
    },
    profile: {
      playful: () =>
        `My Coincarnation profile is live. Let’s revive the future together!`,
      minimal: () =>
        `My Coincarnation profile.`,
      bold: () =>
        `Profile live. Building value with Coincarnation.`
    }
  };

  return map[ctx][tone]();
}

// ---- Public API ----

/**
 * buildPayload
 * - ctx bağlamına göre kısa, OG-dostu URL üretir (/share/:ctx/:ref)
 * - metni kısa ve etkili üretir (playful/minimal/bold)
 * - UTM/karmaşayı bilerek eklemiyoruz (OG kartları için temiz URL şart)
 */
export function buildPayload(
  ctx: ShareContext,
  data: BuildPayloadData,
  opts?: BuildPayloadOpts
): SharePayload {
  const tone: ShareTone = data.tone ?? 'playful';
  const text = line(ctx, tone, data);
  const url = cleanShareLink(ctx, opts?.ref);
  const hashtags = data.hashtags ?? ['MEGY', 'Coincarnation'];
  const via = data.via ?? 'Levershare';

  return {
    url,
    text,
    hashtags,
    via
  };
}

// ---- Intent URL builders (gerekirse dışarıda kullanılır) ----

export function buildTwitterIntent(p: SharePayload): string {
  const params = new URLSearchParams();
  if (p.text) params.set('text', p.text);
  if (p.url)  params.set('url', p.url);
  if (p.hashtags?.length) params.set('hashtags', p.hashtags.join(','));
  if (p.via) params.set('via', p.via);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function buildTelegramWeb(p: SharePayload): string {
  const params = new URLSearchParams();
  if (p.url)  params.set('url', p.url);
  if (p.text) params.set('text', p.text);
  return `https://t.me/share/url?${params.toString()}`;
}

export function buildWhatsAppWeb(p: SharePayload): string {
  const combined = `${p.text ? p.text + ' ' : ''}${p.url}`.trim();
  const params = new URLSearchParams({ text: combined });
  return `https://wa.me/?${params.toString()}`;
}

export function buildEmailIntent(p: SharePayload): string {
  const subject = p.subject || 'Levershare — Coincarnation';
  const body = `${p.text}\n\n${p.url}`;
  const params = new URLSearchParams({ subject, body });
  return `mailto:?${params.toString()}`;
}

export function buildCopyText(p: SharePayload): string {
  const tags = p.hashtags?.length ? ` #${p.hashtags.join(' #')}` : '';
  return `${p.text}\n${p.url}${tags ? `\n${tags}` : ''}`;
}

/**
 * Uygulama deeplink/fallback adayları (gerekirse)
 */
export const APP_LINKS = {
  telegram: (p: SharePayload) => [
    'tg://msg',
    'tg://',
    buildTelegramWeb(p),
  ],
  whatsapp: (p: SharePayload) => [
    `whatsapp://send?text=${encodeURIComponent(`${p.text} ${p.url}`.trim())}`,
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
