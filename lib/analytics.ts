// lib/analytics.ts
export async function logEvent(event: string, meta?: any) {
    try {
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event, meta }),
        keepalive: true,
      });
    } catch {}
  }
  