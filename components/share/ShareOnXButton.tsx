'use client';

import React, { useCallback, useState } from 'react';

type ShareProps = {
  text?: string;            // doğrudan tweet metni (url hariç)
  url?: string;             // link (örn: referral / site url)
  hashtags?: string[];      // ['MEGY','Coincarnation']
  via?: string;             // 'coincarnation'
  className?: string;
  buildText?: () => string; // text verilmezse metni dinamik kurar
  onShared?: () => void | Promise<void>; // paylaşım tetiklenince kayıt vb. için
};

function buildWebIntentURL({ text, url, hashtags, via }: { text: string; url?: string; hashtags?: string[]; via?: string }) {
  const params = new URLSearchParams();
  if (text) params.set('text', text);
  if (url) params.set('url', url);
  if (hashtags?.length) params.set('hashtags', hashtags.join(','));
  if (via) params.set('via', via);
  return `https://x.com/intent/tweet?${params.toString()}`;
}

const isInAppWallet = () => {
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase();
  return ua.includes('phantom') || ua.includes('solflare') || ua.includes('backpack') || ua.includes('rainbow') || ua.includes('metamask');
};

const openInNewTab = (href: string) => {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export default function ShareOnXButton(props: ShareProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(async () => {
    const baseText = (props.text && props.text.trim()) || props.buildText?.() || '';
    const fullText = props.url ? `${baseText} ${props.url}`.trim() : baseText;

    // paylaşımı tetiklediğimizi burada kayıt altına alıyoruz (önce/sonra fark etmiyor)
    try { await props.onShared?.(); } catch { /* noop */ }

    // 0) Web Share API (uygunsa)
    if (navigator.share && !isInAppWallet()) {
      try {
        await navigator.share({ text: fullText, url: props.url });
        return;
      } catch { /* user cancelled → fallbacks */ }
    }

    // 1) native app deep link dene → 2) web intent fallback
    const iosLink = `twitter://post?message=${encodeURIComponent(fullText)}`;
    const androidLink = `intent://tweet?text=${encodeURIComponent(fullText)}#Intent;package=com.twitter.android;scheme=twitter;end`;
    const webIntent = buildWebIntentURL({ text: baseText, url: props.url, hashtags: props.hashtags, via: props.via });

    const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase();
    const isiOS = /iphone|ipad|ipod/.test(ua);

    let timeout: any;
    const start = Date.now();
    const fallbackToWeb = () => {
      if (Date.now() - start < 2000) openInNewTab(webIntent);
    };

    try {
      if (isiOS) {
        window.location.href = iosLink;
        timeout = setTimeout(fallbackToWeb, 800);
      } else {
        window.location.href = androidLink;
        timeout = setTimeout(fallbackToWeb, 800);
      }
    } catch {
      openInNewTab(webIntent);
    } finally {
      // In-app wallet browser’larda deep link bloklanırsa metni kopyala
      setTimeout(async () => {
        if (isInAppWallet() && fullText) {
          try {
            await navigator.clipboard.writeText(fullText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {}
        }
        if (timeout) clearTimeout(timeout);
      }, 1200);
    }
  }, [props]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={props.className || 'w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium'}
      aria-label="Share on X"
    >
      {copied ? '📋 Copied! Open X and paste' : '🐦 Share on X'}
    </button>
  );
}
