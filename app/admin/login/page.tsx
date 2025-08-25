// app/admin/login/page.tsx
'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import bs58 from 'bs58';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
// UI stilini ya global provider dosyanda import ediyorsundur.
// Değilse bir kere projede (ör. WalletConnectionProvider) import et:
// import '@solana/wallet-adapter-react-ui/styles.css';

function LoginCard() {
  const router = useRouter();
  const { publicKey, signMessage, connected } = useWallet();

  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string>('');
  const [token, setToken] = useState<string | null>(null);

  const walletBase58 = publicKey?.toBase58();

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

      // 1) Get nonce
      const nonceRes = await fetch(`/api/admin/auth/nonce?wallet=${walletBase58}`, { cache: 'no-store' });
      const nonceJson = await nonceRes.json();
      if (!nonceRes.ok || !nonceJson?.success) {
        setLog(`Nonce error: ${nonceJson?.error || `HTTP ${nonceRes.status}`}`);
        return;
      }
      const message: string = nonceJson.message;

      // 2) Sign message
      const encoded = new TextEncoder().encode(message);
      const signature = await signMessage(encoded);
      const signatureB58 = bs58.encode(signature);

      // 3) Verify → server sets HttpOnly cookie; may also return JWT for debug
      const verifyRes = await fetch('/api/admin/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'include',
        body: JSON.stringify({ wallet: walletBase58, signature: signatureB58 }),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok || !verifyJson?.success) {
        setLog(`Verify error: ${verifyJson?.error || `HTTP ${verifyRes.status}`}`);
        return;
      }

      if (verifyJson.token) {
        setToken(verifyJson.token as string);
      }
      setLog('Login successful. Session cookie set.');

      // Go to admin panel
      router.replace('/admin/tokens');
    } catch (e: any) {
      setLog(`Error: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [connected, signMessage, walletBase58, router]);

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 rounded-xl border border-gray-800 bg-black text-white">
      <h2 className="text-2xl font-bold mb-3">Admin Login</h2>
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
        <div><span className="text-gray-400">Wallet:</span> {walletBase58 || '—'}</div>
        <div className="mt-2"><span className="text-gray-400">Status:</span> {log || '—'}</div>
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
  // Global WalletConnectionProvider (app/layout.tsx) zaten tüm context’i sağlıyor.
  // Burada sadece kartı render ediyoruz.
  return <LoginCard />;
}
