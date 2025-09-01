// app/api/_lib/http.ts
export function httpErrorFrom(e: any, fallback = 500) {
    const msg = String(e?.message || 'Internal error');
    const status =
      typeof e?.status === 'number' ? e.status :
      /csrf/i.test(msg) ? 403 :
      fallback;
    return {
      status,
      body: { success: false, error: msg, code: e?.code },
    };
  }
  