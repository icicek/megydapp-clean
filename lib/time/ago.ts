// lib/time/ago.ts
export function formatAgo(updatedAt?: number | null): string {
    if (!updatedAt) return '';
    const now = Date.now();
    const diffMs = Math.max(0, now - Number(updatedAt));
    const s = Math.floor(diffMs / 1000);
    if (s < 30) return 'just now';
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d >= 1) return `${d}d ago`;
    if (h >= 1) return `${h}h ago`;
    if (m >= 1) return `${m}m ago`;
    return `${s}s ago`;
  }
  