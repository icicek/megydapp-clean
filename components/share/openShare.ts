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
import { detectInAppBrowser } from '@/components/share/browser';

function isMobileUA() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent);
}

/**
 * Throws 'IN_APP_BLOCKED' for channels that are known to be blocked in in-app browsers.
 * ShareCenter will catch this and show a guided "Open in Browser" step.
 */
export async function openShareChannel(channel: Channel, payload: SharePayload) {
  const { inApp } = detectInAppBrowser();
  const canWebShare =
    typeof navigator !== 'undefined' &&
    typeof (navigator as any).share === 'function' &&
    isMobileUA();

  // If we are inside an in-app browser, block problematic channels up-front
  if (inApp && (channel === 'whatsapp' || channel === 'telegram' || channel === 'instagram' || channel === 'tiktok')) {
    const err: any = new Error('Blocked by in-app browser');
    err.code = 'IN_APP_BLOCKED';
    err.channel = channel;
    throw err;
  }

  // Twitter (always works)
  if (channel === 'twitter') {
    openWithAnchor(buildTwitterIntent(payload), '_blank');
    return;
  }

  // Email
  if (channel === 'email') {
    openWithAnchor(buildEmailIntent(payload), '_self');
    return;
  }

  // Copy
  if (channel === 'copy') {
    try { await navigator.clipboard.writeText(buildCopyText(payload)); } catch {}
    return;
  }

  // Prefer OS Share when available for mobile
  const prefersOSShare = channel === 'whatsapp' || channel === 'telegram' || channel === 'instagram' || channel === 'tiktok';
  if (prefersOSShare && canWebShare) {
    try {
      await (navigator as any).share({
        title: 'Coincarnation',
        text: payload.text,
        url: payload.url,
      });
      return;
    } catch {
      // user canceled or unsupported, fall through
    }
  }

  // Safe web intents
  if (channel === 'whatsapp') {
    openWithAnchor(buildWhatsAppWeb(payload), '_blank'); // https://wa.me/?text=...
    return;
  }
  if (channel === 'telegram') {
    openWithAnchor(buildTelegramWeb(payload), '_blank'); // https://t.me/share/url?...
    return;
  }

  // From web there is no official composer for IG/TikTok
  if (channel === 'instagram') {
    openWithAnchor('https://www.instagram.com/', '_blank');
    return;
  }
  if (channel === 'tiktok') {
    openWithAnchor('https://www.tiktok.com/explore', '_blank');
    return;
  }

  // Last resort
  openWithAnchor(payload.url, '_blank');
}
