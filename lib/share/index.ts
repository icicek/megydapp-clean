// lib/share/index.ts
import {
    ShareChannel, SharePayload,
    buildTweetUrl, buildTelegramUrl, buildWhatsAppUrl, buildMailto,
    isLikelyMobile, isInAppWallet, fullUrl, copyToClipboard
  } from './channels';
  
  type RecordShareBody = {
    channel: ShareChannel;
    context: 'profile' | 'contribution' | 'leaderboard' | 'success';
    txId?: string;
    imageId?: string;
  };
  
  export type ShareResult = { copied?: boolean };
  
  async function recordShare(body: RecordShareBody) {
    try {
      await fetch('/api/share/record', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });
    } catch {/* noop */}
  }
  
  function openCentered(url: string) {
    const w = 680, h = 640;
    const y = window.top?.outerHeight ? Math.max((window.top.outerHeight - h) / 2, 0) : 0;
    const x = window.top?.outerWidth  ? Math.max((window.top.outerWidth  - w) / 2, 0) : 0;
    window.open(url, '_blank', `popup=yes,width=${w},height=${h},left=${x},top=${y}`);
  }
  
  export async function shareVia(
    channel: ShareChannel,
    payload: SharePayload,
    opts?: { context?: RecordShareBody['context']; txId?: string; imageId?: string; }
  ): Promise<ShareResult> {
    const context = opts?.context ?? 'profile';
    const result: ShareResult = {};
  
    switch (channel) {
      case 'x': {
        const baseText = payload.text ?? '';
        const fullText = `${baseText} ${fullUrl(payload.url, payload.utm)}`.trim();
  
        if (isInAppWallet()) {
          const ok = await copyToClipboard(fullText);
          result.copied = ok;
          alert(ok ? 'Copied! Open X and paste your post.' : 'Copy failed. Please paste manually.');
          openCentered(buildTweetUrl(payload));
          break;
        }
        openCentered(buildTweetUrl(payload));
        break;
      }
      case 'telegram': { openCentered(buildTelegramUrl(payload)); break; }
      case 'whatsapp': { openCentered(buildWhatsAppUrl(payload)); break; }
      case 'email':    { window.location.href = buildMailto(payload); break; }
      case 'discord':
      case 'tiktok':
      case 'instagram': {
        const link = fullUrl(payload.url, payload.utm);
        const ok = await copyToClipboard(link);
        result.copied = ok;
        alert(ok ? 'Link copied! Paste it into the app.' : 'Copy failed. Copy manually.');
        break;
      }
      case 'copy-link': {
        const link = fullUrl(payload.url, payload.utm);
        result.copied = await copyToClipboard(link);
        if (result.copied) alert('Link copied.');
        break;
      }
      case 'download-image': {
        if (payload.imageUrl) {
          const a = document.createElement('a');
          a.href = payload.imageUrl;
          a.download = payload.imageUrl.split('/').pop() || 'coincarnation.png';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        break;
      }
      case 'system': {
        if (navigator.share && isLikelyMobile()) {
          try {
            await navigator.share({
              title: 'Coincarnation',
              text: payload.text,
              url: fullUrl(payload.url, payload.utm),
            });
          } catch {/* cancelled */}
        } else {
          openCentered(buildTweetUrl(payload));
        }
        break;
      }
    }
  
    recordShare({ channel, context, txId: opts?.txId, imageId: opts?.imageId });
    return result;
  }
  
  export type { ShareChannel, SharePayload } from './channels';
  