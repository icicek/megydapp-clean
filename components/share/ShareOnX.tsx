'use client';

import React from 'react';
import ShareOnXButton from './ShareOnXButton';
import { buildCoincarneText, buildTxItemText, buildRankText } from '@/utils/shareX';

const DEFAULT_URL = 'https://coincarnation.com';
const DEFAULT_HASHTAGS = ['MEGY','Coincarnation'];
const DEFAULT_VIA = 'coincarnation';

// 1) Coincarne sonrası
export function ShareOnXAfterCoincarne(props: {
  symbol: string;
  amount?: number | string;
  participantNumber?: number;
  url?: string;
  className?: string;
  onShared?: () => void | Promise<void>;
}) {
  return (
    <ShareOnXButton
      className={props.className}
      url={props.url || DEFAULT_URL}
      hashtags={DEFAULT_HASHTAGS}
      via={DEFAULT_VIA}
      buildText={() => buildCoincarneText({
        symbol: props.symbol,
        amount: props.amount,
        participantNumber: props.participantNumber,
      })}
      onShared={props.onShared}
    />
  );
}

// 2) Profil → işlem satırı
export function ShareOnXFromTxItem(props: {
  symbol: string;
  amount?: number | string;
  txSignature?: string;
  url?: string;
  className?: string;
  onShared?: () => void | Promise<void>;
}) {
  const sigShort = props.txSignature ? `${props.txSignature.slice(0, 4)}…${props.txSignature.slice(-4)}` : undefined;
  return (
    <ShareOnXButton
      className={props.className}
      url={props.url || DEFAULT_URL}
      hashtags={DEFAULT_HASHTAGS}
      via={DEFAULT_VIA}
      buildText={() => buildTxItemText({ symbol: props.symbol, amount: props.amount, sigShort })}
      onShared={props.onShared}
    />
  );
}

// 3) “Share your rank”
export function ShareRankOnX(props: {
  rank: number;
  total?: number;
  url?: string;
  className?: string;
  onShared?: () => void | Promise<void>;
}) {
  return (
    <ShareOnXButton
      className={props.className}
      url={props.url || DEFAULT_URL}
      hashtags={DEFAULT_HASHTAGS}
      via={DEFAULT_VIA}
      buildText={() => buildRankText({ rank: props.rank, total: props.total })}
      onShared={props.onShared}
    />
  );
}
