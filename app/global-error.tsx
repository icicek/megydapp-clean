// app/global-error.tsx
'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Hata ayrıntısını konsola bas (stack dahil)
    // eslint-disable-next-line no-console
    console.error('[GLOBAL ERROR]', error);
  }, [error]);

  return (
    <html>
      <body style={{ background: '#000', color: '#fff', fontFamily: 'ui-sans-serif' }}>
        <div style={{ maxWidth: 880, margin: '40px auto', padding: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
            Something went wrong (Client)
          </h1>
          <pre
            style={{
              background: '#111',
              border: '1px solid #333',
              borderRadius: 8,
              padding: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
{String(error?.stack || error?.message || error)}
          </pre>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 12,
              padding: '8px 12px',
              background: '#2563eb',
              borderRadius: 8,
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
