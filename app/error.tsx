'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: any;
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[route error]', error);
  }, [error]);

  return (
    <html>
      <body style={{ background: 'black', color: 'white', padding: 24, fontFamily: 'ui-sans-serif' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
        <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.9 }}>
{String(error?.message || error)}
{'\n\n'}
{String(error?.stack || '')}
        </pre>
        <button onClick={() => reset()} style={{ marginTop: 12, padding: '8px 12px' }}>
          Try again
        </button>
      </body>
    </html>
  );
}