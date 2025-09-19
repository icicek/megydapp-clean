// lib/idempotency.ts
export function makeIdempotencyKey(seed: string) {
    // fast-enough & unique per attempt
    const base = new TextEncoder().encode(seed);
    let h = 0;
    for (let i = 0; i < base.length; i++) h = (h * 31 + base[i]) >>> 0;
    return `idem_${h.toString(16)}_${Date.now()}`;
  }
  
  /** Optional helper for tests/retries that must reuse the exact same key for the same seed */
  export function makeStableIdempotencyKey(seed: string) {
    const base = new TextEncoder().encode(seed);
    let h = 0;
    for (let i = 0; i < base.length; i++) h = (h * 31 + base[i]) >>> 0;
    return `idem_${h.toString(16)}`;
  }
  