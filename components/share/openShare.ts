// components/share/openShare.ts
import type { SharePayload, Channel } from '@/components/share/intent';
import { buildTwitterIntent } from '@/components/share/intent';
import { openWithAnchor } from '@/components/share/browser';

export async function openShareChannel(channel: Channel, payload: SharePayload) {
  if (channel === 'twitter') {
    // gesture-safe: görünmez <a> ile aç
    const url = buildTwitterIntent(payload);
    openWithAnchor(url, '_blank'); // noopener/noreferrer içeriyor
    return;
  }
  // ileride diğer kanallar yeniden aktif olduğunda burayı genişleteceğiz
}
