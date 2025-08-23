'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import bs58 from 'bs58';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import { WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import {
  WalletModalProvider,
  WalletMultiButton
} from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';

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
        setLog('Önce cüzdanı bağla.');
        return;
      }
      if (!signMessage) {
        setLog('Bu cüzdan signMessage desteklemiyor.');
        return;
      }

      // 1) Nonce al
      const nonceRes = await fetch(`/api/admin/auth/nonce?wallet=${walletBase58}`, { cache: 'no-store' });
      const nonceJson = await nonceRes.json();
      if (!nonceJson?.success) {
        setLog(`Nonce hatası: ${nonceJson?.error || 'unknown'}`);
        return;
      }
      const message: string = nonceJson.message;

      // 2) Mesajı imzala
      const encoded = new TextEncoder().encode(message);
      const signature = await signMessage(encoded);
      const signatureB58 = bs58.encode(signature);

      // 3) Verify → JWT
      const verifyRes = await fetch('/api/admin/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ wallet: walletBase58, signature: signatureB58 })
      });
      const verifyJson = await verifyRes.json();
      if (!verifyJson?.success) {
        setLog(`Verify hatası: ${verifyJson?.error || 'unknown'}`);
        return;
      }

      const t = verifyJson.token as string;
      setToken(t);
      setLog('Giriş başarılı. Token alındı.');
      localStorage.setItem('coincarnation_admin_token', t);
      router.replace('/admin/tokens');
    } catch (e: any) {
      setLog(`Hata: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
}, [connected, signMessage, walletBase58, router]);

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', padding: 24, border: '1px solid #eee', borderRadius: 12 }}>
      <h2 style={{ marginBottom: 12 }}>Admin Login</h2>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Cüzdanını bağla → nonce al → mesajı imzala → JWT al.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <WalletMultiButton />
        <button
          onClick={handleLogin}
          disabled={loading || !connected}
          style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #ccc', background: connected ? '#111' : '#888', color: '#fff', cursor: connected ? 'pointer' : 'not-allowed' }}
        >
          {loading ? 'İmzalanıyor…' : 'Giriş Yap'}
        </button>
      </div>

      <div style={{ fontSize: 13, color: '#444', whiteSpace: 'pre-wrap' }}>
        <div><strong>Cüzdan:</strong> {walletBase58 || '—'}</div>
        <div style={{ marginTop: 8 }}><strong>Durum:</strong> {log || '—'}</div>
        {token && (
          <div style={{ marginTop: 12 }}>
            <strong>JWT:</strong>
            <textarea readOnly value={token} style={{ width: '100%', height: 120, marginTop: 6 }} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  const endpoint = useMemo(() => 'https://api.mainnet-beta.solana.com', []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <LoginCard />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
