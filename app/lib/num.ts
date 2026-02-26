// app/lib/num.ts
export function toNum(v: unknown, fallback = 0): number {
    if (v === null || v === undefined) return fallback;
    if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
    if (typeof v === 'string') {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
  }
  
  export function toPct01(v: unknown): number {
    // 0..1 arası bekleyen progress bar için
    const n = toNum(v, 0);
    if (!Number.isFinite(n)) return 0;
    if (n > 1) return Math.min(1, n / 100); // bazen 0..100 gelirse
    return Math.max(0, Math.min(1, n));
  }