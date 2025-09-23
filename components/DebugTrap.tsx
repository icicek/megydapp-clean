// components/DebugTrap.tsx
'use client';

import { useEffect } from 'react';

export default function DebugTrap() {
  useEffect(() => {
    const onErr = (ev: ErrorEvent) => {
      // eslint-disable-next-line no-console
      console.error('[window.onerror]', ev?.message, ev?.error);
    };
    const onRej = (ev: PromiseRejectionEvent) => {
      // eslint-disable-next-line no-console
      console.error('[unhandledrejection]', ev?.reason);
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);
  return null;
}
