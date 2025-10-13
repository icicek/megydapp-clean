// lib/analytics.ts
// Tip: Hem bilinen eventler için union, hem de gerektiğinde başka event adlarına izin:
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

// Union + “branded string” hilesi => bilinmeyen string’lere de izin verir
export type EventName = KnownEventName | (string & {});

// Parametreler serbest biçimli
export type EventParams = Record<string, unknown> | undefined;

export function logEvent(name: EventName, params?: EventParams): void {
  try {
    // Google Analytics varsa
    const gtag = (typeof window !== 'undefined' && (window as any).gtag) || null;
    if (gtag) gtag('event', name, params ?? {});

    // PostHog varsa
    const ph = (typeof window !== 'undefined' && (window as any).posthog) || null;
    if (ph?.capture) ph.capture(name as string, params ?? {});

    // Başka bir telemetry sistemi varsa buraya ekleyebilirsin.
  } catch {
    // no-op
  }
}
