// lib/analytics/index.ts
'use client';

export type KnownEventName =
  | 'smart_connect_shown'
  | 'smart_connect_inapp_hint_shown'
  | 'smart_connect_open_in_phantom'
  | 'smart_connect_open_in_solflare'
  | 'smart_connect_open_in_backpack'
  | 'smart_connect_walletconnect_hint'
  | 'wallet_connect_attempt'
  | 'wallet_connect_success'
  | 'wallet_connect_error'
  | 'direct_connect_start'
  | 'direct_connect_done'
  | 'autoconnect_attempt'
  | 'autoconnect_success'
  | 'autoconnect_error'
  | 'autoconnect_skip';

export type EventName = KnownEventName | (string & {});
export type EventParams = Record<string, unknown> | undefined;

export function logEvent(name: EventName, params?: EventParams): void {
  try {
    const gtag = (typeof window !== 'undefined' && (window as any).gtag) || null;
    if (gtag) gtag('event', name as string, params ?? {});

    const ph = (typeof window !== 'undefined' && (window as any).posthog) || null;
    if (ph?.capture) ph.capture(name as string, params ?? {});
  } catch {
    // no-op
  }
}
