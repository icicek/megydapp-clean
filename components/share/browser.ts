// components/share/browser.ts
export const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const isAndroid = /Android/i.test(ua);
export const isIOS = /iPhone|iPad|iPod/i.test(ua);

export function detectInAppBrowser(): { inApp: boolean; vendor?: 'facebook' | 'instagram' | 'twitter' | 'tiktok' | 'line' | 'wechat' } {
  if (typeof navigator === 'undefined') return { inApp: false };
  const u = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB/i.test(u)) return { inApp: true, vendor: 'facebook' };
  if (/Instagram/i.test(u))       return { inApp: true, vendor: 'instagram' };
  if (/Twitter/i.test(u))         return { inApp: true, vendor: 'twitter' };
  if (/TikTok/i.test(u))          return { inApp: true, vendor: 'tiktok' };
  if (/Line/i.test(u))            return { inApp: true, vendor: 'line' };
  if (/MicroMessenger/i.test(u))  return { inApp: true, vendor: 'wechat' };
  return { inApp: false };
}

/**
 * Kullanıcı jesti altında güvenli açılış: görünmez <a> oluşturup .click()
 * target: '_self' ⇒ aynı sekme, '_blank' ⇒ yeni sekme
 */
export function openWithAnchor(url: string, target: '_self' | '_blank' = '_self') {
  const a = document.createElement('a');
  a.href = url;
  a.target = target;
  a.rel = target === '_blank' ? 'noopener noreferrer' : '';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
}

/**
 * İlk URL şema/intent (uygulama), 800ms sonra görünürlük değişmemişse web fallback.
 * iOS/Android’te ERR_UNKNOWN_URL_SCHEME sayfasına düşmeyi azaltır.
 */
export function openWithFallback(primaryUrl: string, fallbackUrl: string, { delayMs = 800, sameTab = true }: { delayMs?: number; sameTab?: boolean } = {}) {
  let handled = false;

  const onHidden = () => {
    // App’e geçti, fallback’i iptal et
    handled = true;
  };

  document.addEventListener('visibilitychange', onHidden, { once: true });

  // primary (scheme/intent) – aynı sekme önerilir
  openWithAnchor(primaryUrl, sameTab ? '_self' : '_blank');

  // zaman aşımıyla web fallback
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onHidden);
    if (!handled) {
      openWithAnchor(fallbackUrl, sameTab ? '_self' : '_blank');
    }
  }, delayMs);
}
