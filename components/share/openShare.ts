// components/share/openShare.ts
import type { SharePayload, Channel } from '@/components/share/intent';
import {
  buildTwitterIntent,
  buildTelegramWeb,
  buildWhatsAppWeb,
  buildEmailIntent,
  buildCopyText,
} from '@/components/share/intent';
import { openWithAnchor } from '@/components/share/browser';

function isMobileUA() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent);
}

/**
 * Unified share opener:
 * 1) Try OS Share Sheet (navigator.share) when it makes sense
 * 2) Fallback to safe web intents (wa.me / t.me / twitter intent)
 * 3) Email via mailto, IG/TikTok via platform homepage (no composer from web)
 * Always opens in a way that avoids ERR_UNKNOWN_URL_SCHEME.
 */
export async function openShareChannel(channel: Channel, payload: SharePayload) {
  const canWebShare =
    typeof navigator !== 'undefined' &&
    typeof (navigator as any).share === 'function' &&
    isMobileUA();

  // Channels that benefit most from OS share first
  const prefersOSShare = channel === 'instagram' || channel === 'tiktok' || channel === 'whatsapp' || channel === 'telegram';

  // 0) Twitter (always web intent, works everywhere)
  if (channel === 'twitter') {
    openWithAnchor(buildTwitterIntent(payload), '_blank');
    return;
  }

  // 1) Email (mailto in same tab so mail app can intercept)
  if (channel === 'email') {
    openWithAnchor(buildEmailIntent(payload), '_self');
    return;
  }

  // 2) Try OS Share Sheet (mobile capable) for specific channels
  if (prefersOSShare && canWebShare) {
    try {
      // NOTE: We cannot force a specific app via Web Share API.
      await (navigator as any).share({
        title: 'Coincarnation',
        text: payload.text,
        url: payload.url,
      });
      return;
    } catch {
      // user canceled or not supported -> fall through to web intents
    }
  }

  // 3) Web intents (safe, no custom schemes)
  if (channel === 'whatsapp') {
    openWithAnchor(buildWhatsAppWeb(payload), '_blank'); // https://wa.me/?text=...
    return;
  }

  if (channel === 'telegram') {
    openWithAnchor(buildTelegramWeb(payload), '_blank'); // https://t.me/share/url?url=...&text=...
    return;
  }

  // 4) IG/TikTok: from web there is no official composer deep link.
  if (channel === 'instagram') {
    openWithAnchor('https://www.instagram.com/', '_blank');
    return;
  }
  if (channel === 'tiktok') {
    openWithAnchor('https://www.tiktok.com/explore', '_blank');
    return;
  }

  // 5) Copy (utility)
  if (channel === 'copy') {
    try {
      await navigator.clipboard.writeText(buildCopyText(payload));
    } catch {}
    return;
  }

  // 6) Last resort: just open our URL
  openWithAnchor(payload.url, '_blank');
}
