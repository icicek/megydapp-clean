'use client';

import React, { useCallback, useState } from 'react';
import { shareVia } from '@/lib/share';

type ShareProps = {
  text?: string;
  url?: string;
  hashtags?: string[];
  via?: string;
  className?: string;
  buildText?: () => string;
  onShared?: () => void | Promise<void>;
  utm?: string;
};

export default function ShareOnXButton(props: ShareProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(async () => {
    const baseText = (props.text && props.text.trim()) || props.buildText?.() || '';

    try { await props.onShared?.(); } catch {}

    const res = await shareVia('x', {
      text: baseText,
      url: props.url || 'https://coincarnation.com',
      hashtags: props.hashtags,
      via: props.via,
      utm: props.utm,
    }, { context: 'profile' });

    if (res.copied) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
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
