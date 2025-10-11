// app/wallet/callback/[provider]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { useRouter } from 'next/navigation';
import type { Provider } from '@/lib/wallet/direct/direct';
import { popEphemeralSecret } from '@/lib/wallet/direct/direct';
import { logEvent } from '@/lib/analytics';

function decodePayload(
  walletPub58: string,
  data58: string,
  nonce58: string,
  ephSecretKey: Uint8Array
) {
  const walletPub = bs58.decode(walletPub58); // 32 bytes
  const data = bs58.decode(data58);
  const nonce = bs58.decode(nonce58);

  const opened = nacl.box.open(data, nonce, walletPub, ephSecretKey);
  if (!opened) throw new Error('decrypt_failed');
  const json = new TextDecoder().decode(opened);
  return JSON.parse(json); // { public_key, session, ... }
}

function pickEncryptionKeyParam(provider: Provider, sp: URLSearchParams) {
  // cüzdana göre değişebilir; esnek tara:
  return (
    sp.get(`${provider}_encryption_public_key`) ||
    sp.get('wallet_encryption_public_key') ||
    sp.get('encryption_public_key') ||
    sp.get('phantom_encryption_public_key') || // backward compat
    ''
  );
}

export default function WalletCallbackPage({ params }: { params: { provider: Provider } }) {
  const provider = params.provider;
  const router = useRouter();
  const [status, setStatus] = useState<'working'|'ok'|'error'>('working');
  const [message, setMessage] = useState<string>('Decrypting…');

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const sp = url.searchParams;

        const encPub = pickEncryptionKeyParam(provider, sp);
        const data   = sp.get('data');
        const nonce  = sp.get('nonce');
        const state  = sp.get('state') || '';

        if (!encPub || !data || !nonce) throw new Error('missing_params');

        const ephSecret = state ? popEphemeralSecret(provider, state) : null;
        if (!ephSecret) throw new Error('missing_ephemeral_secret');

        const payload = decodePayload(encPub, data, nonce, ephSecret);
        localStorage.setItem(`${provider}_public_key`, payload.public_key);
        localStorage.setItem(`${provider}_session`, payload.session);

        logEvent('direct_connect_done', { ok: true, provider });
        setStatus('ok');
        setMessage('Connected. Redirecting…');
        setTimeout(() => router.replace('/'), 800);
      } catch (e: any) {
        console.error(e);
        logEvent('direct_connect_done', { ok: false, provider, error: e?.message || String(e) });
        setStatus('error');
        setMessage(e?.message || 'Failed to decode callback');
      }
    })();
  }, [provider, router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6 text-white max-w-md w-[92vw]">
        <div className="text-lg font-semibold mb-2">Direct Connect — {provider}</div>
        <div className={`text-sm ${status === 'error' ? 'text-red-300' : 'text-gray-200'}`}>{message}</div>
        {status === 'error' && (
          <button onClick={() => location.replace('/')} className="mt-3 text-sm underline">
            Go home
          </button>
        )}
      </div>
    </div>
  );
}
