// app/admin/login/page.tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import bs58 from 'bs58';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function LoginCard() {
  const router = useRouter();
  const sp = useSearchParams();
  const { publicKey, signMessage, connected } = useWallet();

  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string>('');
  const [token, setToken] = useState<string | null>(null);

  const walletBase58 = useMemo(() => publicKey?.toBase58() ?? '', [publicKey]);

  // İlk gelişte olası hata kodunu göster (isteğe bağlı)
  const initialMsg = useMemo(() => {
    const e = sp?.get('e');
    if (!e) return '';
    if (e === 'missing') return 'Please connect your admin wallet and sign in.';
    if (e === 'session') return 'Session missing/expired. Please sign in again.';
    if (e === 'wallet-changed') return 'Wallet changed. Please re-authenticate.';
    if (e === 'error') return 'Unexpected error during session check. Please sign in again.';
    return '';
  }, [sp]);

  const handleLogin = useCallback(async () => {
    try {
      setLoading(true);
      setLog('');
      setToken(null);

      if (!connected || !walletBase58) {
        setLog('Please connect your wallet first.');
        return;
      }
      if (!signMessage) {
        setLog('This wallet does not support signMessage.');
        return;
      }

      // 1) Nonce al
      const nonceRes = await fetch(`/api/admin/auth/nonce?wallet=${walletBase58}`, { cache: 'no-store' });
      const nonceJson = await nonceRes.json().catch(() => ({}));
      if (!nonceRes.ok || !nonceJson?.success || !nonceJson?.message) {
        setLog(`Nonce error: ${nonceJson?.error || `HTTP ${nonceRes.status}`}`);
        return;
      }
      const message: string = nonceJson.message;

      // 2) İmzala
      const encoded = new TextEncoder().encode(message);
      const signature = await signMessage(encoded);
      const signatureB58 = bs58.encode(signature);

      // 3) Doğrula → server HttpOnly cookie yazar
      const verifyRes = await fetch('/api/admin/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'include',
        body: JSON.stringify({ wallet: walletBase58, signature: signatureB58 }),
      });

      const verifyJson = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !verifyJson?.success) {
        setLog(
          `Verify error: ${verifyJson?.error || `HTTP ${verifyRes.status}`}\n` +
          `Tip: If cookies are blocked, the HttpOnly session cookie cannot be set. ` +
          `Please allow site cookies for coincarnation.com and try again.`
        );
        return;
      }

      if (verifyJson.token) setToken(String(verifyJson.token));
      setLog('Login successful. Session cookie set. Redirecting…');

      // 4) Yönlendirme: önce SPA, ardından fallback olarak hard navigate
      try {
        router.replace('/admin/tokens');
      } catch {}
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.location.pathname.includes('/admin/login')) {
          window.location.assign('/admin/tokens');
        }
      }, 500);
    } catch (e: any) {
      setLog(`Error: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [connected, walletBase58, signMessage, router]);

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 rounded-xl border border-gray-800 bg-black text-white">
      {/* Header with back link */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Admin Login</h2>
        <Link
          href="/"
          className="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2"
          title="Back to site"
        >
          ← Back to site
        </Link>
      </div>

      <p className="text-gray-300 mb-4">
        Connect your wallet → fetch nonce → sign message → receive session (HttpOnly cookie).
      </p>

      <div className="flex items-center gap-3 mb-4">
        <WalletMultiButton />
        <button
          onClick={handleLogin}
          disabled={loading || !connected}
          className="px-4 py-2 rounded-lg font-semibold border border-gray-700 bg-gray-900 disabled:opacity-60"
        >
          {loading ? 'Signing…' : 'Sign & Login'}
        </button>
      </div>

      <div className="text-sm text-gray-200 whitespace-pre-wrap">
        <div>
          <span className="text-gray-400">Wallet:</span> {walletBase58 || '—'}
        </div>
        <div className="mt-2">
          <span className="text-gray-400">Status:</span>{' '}
          {log || initialMsg || '—'}
        </div>

        {token && (
          <div className="mt-3">
            <div className="text-gray-400 mb-1">JWT (debug):</div>
            <textarea
              readOnly
              value={token}
              className="w-full h-40 p-2 rounded bg-gray-950 border border-gray-800"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return <LoginCard />;
}
