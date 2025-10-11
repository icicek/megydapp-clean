// lib/analytics.ts
type AllowedEvent =
  | 'smart_connect_shown'
  | 'smart_connect_inapp_hint_shown'
  | 'smart_connect_open_in_phantom'
  | 'smart_connect_open_in_solflare'
  | 'smart_connect_open_in_backpack'
  | 'smart_connect_walletconnect_hint'
  | 'wallet_connect_attempt'
  | 'wallet_connect_success'
  | 'wallet_connect_error'
  | 'direct_connect_start'   // <—
  | 'direct_connect_done';   // <—

type Props = Record<string, unknown>;

export function logEvent(name: AllowedEvent, props: Props = {}) {
  try {
    console.log('[analytics]', name, props);
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', name, props);
    }
    // amplitude vb. burada
  } catch {}
}
