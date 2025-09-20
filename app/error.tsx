'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error('[route error]', error), [error]);
  return (
    <html>
      <body className="min-h-screen bg-black text-white grid place-items-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-300 mb-4">A client-side exception occurred. Please try again.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => reset()} className="px-4 py-2 rounded bg-white text-black font-semibold">Try again</button>
            <a href="/" className="px-4 py-2 rounded border border-white/20 hover:bg-white/10">Go Home</a>
          </div>
        </div>
      </body>
    </html>
  );
}
