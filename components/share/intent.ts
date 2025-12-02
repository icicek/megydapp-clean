// components/share/intent.ts
// Centralized share payload builder + channel intent URL helpers (SSR-safe)

export type Tone = 'playful' | 'short' | 'serious';

export type SharePayload = {
  url: string;          // canonical URL (ref/src/ctx ve opsiyonel UTM eklenmiş)
  shortUrl?: string;    // /share/[ctx]/[ref]?src=... şeklinde markalı kısa link (varsa tercih edilir)
  text: string;         // context'e göre oluşturulan post metni (cashtag'ler burada)
  hashtags?: string[];  // ör: ["Coincarnation"]
  via?: string;         // ör: "levershare" (başında @ olmasın)
  utm?: string;         // ekstra UTM çiftleri (k=v&k2=v2)
  subject?: string;     // email için
};

export type Channel =
  | 'twitter'
  | 'telegram'
  | 'whatsapp'
  | 'email'
  | 'copy'
  | 'instagram'
  | 'tiktok';

// ----------------- constants & tiny helpers -----------------

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://coincarnation.com';
const DEFAULT_VIA = 'levershare';
// 👉 Artık tüm gönderilerde #Coincarnation ve #Web3 kuyruğa ekleniyor
const DEFAULT_HASHTAGS: string[] = ['Coincarnation', 'Web3']; // cashtag'ler text'te

// ✅ NEW: normalize helper — hashtags & via her zaman dolu olsun
function withDefaults(p: SharePayload): SharePayload {
  return {
    ...p,
    hashtags:
      p.hashtags && p.hashtags.length > 0 ? p.hashtags : DEFAULT_HASHTAGS,
    via: (p.via ?? DEFAULT_VIA).replace(/^@/, ''),
  };
}

const toTicker = (s?: string) => (s ?? '').replace(/\$/g, '').trim().toUpperCase();

const toCashtag = (s?: string) => {
  const t = toTicker(s);
  if (!t || t.length > 12 || /[^A-Z0-9._-]/.test(t)) return '';
  return `$${t}`;
};

function safeUrl(u?: string): URL | null {
  try {
    return u ? new URL(u) : null;
  } catch {
    return null;
  }
}

// base URL'e ref/src/ctx ve opsiyonel UTM ekle
function enrichUrl(
  baseUrl: string,
  opts?: { ref?: string; src?: string; ctx?: string; utm?: string }
): string {
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

// mevcut URL'e yalnızca UTM ekle
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

// " #tag1 #tag2 via @xxx" (önce hashtag, sonra via) — tek satır kuyruğu
function inlineTail(p: SharePayload): string {
  const tags = p.hashtags?.length ? ` #${p.hashtags.join(' #')}` : '';
  const via = p.via ? ` via @${p.via.replace(/^@/, '')}` : '';
  return `${tags}${via}`;
}

// shortUrl varsa onu, yoksa canonical url'i (utm ekleyerek) kullan
function finalShareLink(p: SharePayload): string {
  const base = p.shortUrl && p.shortUrl.trim() ? p.shortUrl : p.url;
  return addUtm(base, p.utm);
}

// ---- COPY TEXT: X ile birebir aynı biçim ----
// metin ⏎⏎ link  #tags via @via
export function buildCopyText(p: SharePayload): string {
  const norm = withDefaults(p);
  const link = finalShareLink(norm);
  return `${norm.text}\n\n${link}${inlineTail(norm)}`;
}

// ----------------- context text templates -----------------

// Ortak küçük helper: satırlar arasında birer boş satır
function multiLine(lines: string[]): string {
  return lines.join('\n\n');
}

/**
 * SUCCESS (CoincarnationResult):
 *
 * I coincarnated $TOKEN for $MEGY.
 *
 * A new financial ecosystem is forming — built on unity, not exploitation.
 *
 * Be part of something bigger 👇
 */
function textForSuccess(p: { token?: string; tone?: Tone }): string {
  const coin = toCashtag(p.token) || '$MEGY';

  return multiLine([
    `I coincarnated ${coin} for $MEGY.`,
    `A new financial ecosystem is forming — built on unity, not exploitation.`,
    `Be part of something bigger 👇`,
  ]);
}

/**
 * CONTRIBUTION (ClaimPanel / history share):
 *
 * Crypto projects rise with hype — and disappear when reality hits.
 *
 * But this cycle finally has an escape hatch: Coincarnation.
 *
 * I already coincarnated my $TOKEN for $MEGY.
 * Come in before the crowd realizes where safety actually is.
 */

function textForContribution(p: { token?: string; amount?: number; tone?: Tone }): string {
  const coin = toCashtag(p.token) || '$MEGY';

  return multiLine([
    // 1. satır (emoji dahil)
    `Crypto projects rise with hype — and disappear when reality hits.\nBut this cycle finally has an escape hatch: Coincarnation ⚡`,
    
    // 2. satır (emoji dahil)
    `I already coincarnated my ${coin} for $MEGY — get in before the crowd wakes up 👀`,
  ]);
}

/**
 * LEADERBOARD:
 *
 * (rank varsa)
 * I’m #7 in the Fair Future Fund rankings — catch me if you can.
 *
 * (rank yoksa)
 * I’m climbing the Fair Future Fund rankings — catch me if you can.
 *
 * The global revival is already in motion.
 *
 * $MEGY
 */
function textForLeaderboard(p: { rank?: number; tone?: Tone }): string {
  const rankLine =
    typeof p.rank === 'number' && p.rank > 0
      ? `I’m #${p.rank} in the Fair Future Fund rankings — catch me if you can.`
      : `I’m climbing the Fair Future Fund rankings — catch me if you can.`;

  return multiLine([
    rankLine,
    `The global revival is already in motion.`,
    `$MEGY`,
  ]);
}

/**
 * PROFILE / REFERRAL (PVC / personal value currency):
 *
 * Something powerful is forming — a global synergy built by all of us.
 *
 * I’m already part of it — with $MEGY at the core.
 *
 * Join in before momentum takes over.
 */
function textForProfile(_p: { tone?: Tone }): string {
  return multiLine([
    `Income inequality won’t disappear —\nnot until everyone has the power to create their own currency.`,
    
    `Using past crypto losses as fuel for your own Personal Value Currency just makes sense.`,
    
    `There is zero reason not to join 👇`,
  ]);
}

// ----------------- Public builder -----------------

/**
 * Central entry:
 * - text: context-aware (çok satırlı, aralarda boş satır)
 * - url: canonical (ref/src/ctx merge + utm)
 * - shortUrl: /share/[ctx]/[ref]?src=... (ref varsa otomatik)
 * - via: "levershare" (default)
 * - hashtags: ["Coincarnation","Web3"] (default)
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
    utm?: string;
    subject?: string;
    shortUrl?: string; // dışarıdan kısa link verilirse override eder
  },
  opts?: {
    ref?: string; // referral code
    src?: string; // "app" gibi
    ctx?: string; // query'deki ctx override
  }
): SharePayload {
  const finalUrl = enrichUrl(data.url, {
    ref: opts?.ref,
    src: opts?.src ?? 'app',
    ctx: opts?.ctx ?? ctx,
    utm: data.utm,
  });

  // ref + ctx varsa markalı kısa linki otomatik hazırla
  const ctxForShort = opts?.ctx ?? ctx;
  const srcTag = opts?.src ?? 'app';
  const autoShort =
    opts?.ref && ctxForShort
      ? `${APP_URL}/share/${encodeURIComponent(ctxForShort)}/${encodeURIComponent(
          opts.ref
        )}?src=${encodeURIComponent(srcTag)}`
      : undefined;

  // text seçimi (context'e göre)
  let text = '';
  if (ctx === 'success') {
    text = textForSuccess({ token: data.token, tone: data.tone });
  } else if (ctx === 'contribution') {
    text = textForContribution({
      token: data.token,
      amount: data.amount,
      tone: data.tone,
    });
  } else if (ctx === 'leaderboard') {
    text = textForLeaderboard({ rank: data.rank, tone: data.tone });
  } else {
    text = textForProfile({ tone: data.tone });
  }

  return {
    url: finalUrl,
    shortUrl: data.shortUrl ?? autoShort, // dışarıdan gelmişse öncelik ver
    text,
    hashtags: data.hashtags ?? DEFAULT_HASHTAGS,
    via: (data.via ?? DEFAULT_VIA).replace(/^@/, ''),
    utm: data.utm,
    subject: data.subject,
  };
}

// ----------------- Channel intent builders -----------------

export function buildTwitterIntent(p: SharePayload): string {
  const norm = withDefaults(p);
  const params = new URLSearchParams();
  const link = finalShareLink(norm);
  const txt = norm.text
    ? `${norm.text}\n\n${link}${inlineTail(norm)}`
    : `${link}${inlineTail(norm)}`;
  params.set('text', txt);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function buildTelegramWeb(p: SharePayload): string {
  const norm = withDefaults(p);
  const params = new URLSearchParams();
  const txt = norm.text
    ? `${norm.text}\n\n${finalShareLink(norm)}${inlineTail(norm)}`
    : `${finalShareLink(norm)}${inlineTail(norm)}`;
  params.set('text', txt);
  return `https://t.me/share/url?${params.toString()}`;
}

export function buildWhatsAppWeb(p: SharePayload): string {
  const norm = withDefaults(p);
  const combined = `${norm.text ? norm.text + '\n\n' : ''}${finalShareLink(
    norm
  )}${inlineTail(norm)}`.trim();
  const params = new URLSearchParams({ text: combined });
  return `https://wa.me/?${params.toString()}`;
}

export function buildEmailIntent(p: SharePayload): string {
  const norm = withDefaults(p);
  const subject = norm.subject || 'Check this out';
  const body = `${norm.text}\n\n${finalShareLink(norm)}${inlineTail(norm)}`;
  const params = new URLSearchParams({ subject, body });
  return `mailto:?${params.toString()}`;
}


// ----------------- App deep links (mobile) -----------------

/**
 * App deeplink adayları. İlk girişler app'i denemeye çalışır; son girişler web fallback'tir.
 * Instagram/TikTok metin preload desteklemez — yalnızca uygulama ya da web açılır.
 */
export const APP_LINKS = {
  telegram: (p: SharePayload) => ['tg://msg', 'tg://', buildTelegramWeb(p)],

  whatsapp: (p: SharePayload) => {
    const norm = withDefaults(p);
    return [
      `whatsapp://send?text=${encodeURIComponent(
        `${norm.text ? norm.text + '\n\n' : ''}${finalShareLink(norm)}${inlineTail(norm)}`.trim()
      )}`,
      buildWhatsAppWeb(norm),
    ];
  },

  instagram: (_p: SharePayload) => ['instagram://app', 'https://www.instagram.com/'],
  tiktok: (_p: SharePayload) => ['tiktok://', 'snssdk1128://', 'https://www.tiktok.com/explore'],
};
