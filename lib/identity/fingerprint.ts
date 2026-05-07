//lib/identity/fingerprint.ts
function safeValue(value: unknown) {
    if (value === undefined || value === null) return 'unknown';
    return String(value);
  }
  
  async function sha256(input: string) {
    const bytes = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  
  export async function createDeviceFingerprintHash() {
    if (typeof window === 'undefined') {
      return null;
    }
  
    const nav = window.navigator;
  
    const payload = [
      safeValue(nav.userAgent),
      safeValue(nav.language),
      safeValue(nav.languages?.join(',')),
      safeValue(Intl.DateTimeFormat().resolvedOptions().timeZone),
      safeValue(window.screen.width),
      safeValue(window.screen.height),
      safeValue(window.screen.colorDepth),
      safeValue(window.devicePixelRatio),
      safeValue((nav as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency),
      safeValue((nav as Navigator & { deviceMemory?: number }).deviceMemory),
      safeValue(nav.platform),
    ].join('|');
  
    return sha256(payload);
  }
  
  export async function recordIdentityFingerprint(walletAddress?: string | null) {
    const fingerprintHash = await createDeviceFingerprintHash();
  
    if (!fingerprintHash) {
      return {
        ok: false,
        recorded: false,
        reason: 'Fingerprint unavailable.',
      };
    }
  
    const res = await fetch('/api/auth/fingerprint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        fingerprintHash,
        walletAddress,
        source: 'web',
      }),
    });
  
    const data = await res.json();
  
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Failed to record identity fingerprint.');
    }
  
    return data;
  }