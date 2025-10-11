'use client';

import { useEffect, useState } from 'react';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { useRouter } from 'next/navigation';
import { popEphemeralSecret } from '@/lib/wallet/direct/phantom';

function decodePayload(
  phantomPub58: string,
  data58: string,
  nonce58: string,
  ephSecretKey: Uint8Array
) {
  const phantomPub = bs58.decode(phantomPub58); // 32 bytes
  const data = bs58.decode(data58);
  const nonce = bs58.decode(nonce58);

  const opened = nacl.box.open(data, nonce, phantomPub, ephSecretKey);
  if (!opened) throw new Error('decrypt_failed');
  const json = new TextDecoder().decode(opened);
  return JSON.parse(json); // { public_key: <base58>, session: <string>, ... }
}

export default function PhantomCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'working'|'ok'|'error'>('working');
  const [message, setMessage] = useState<string>('Decrypting…');

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const phantomPub = url.searchParams.get('phantom_encryption_public_key');
        const data = url.searchParams.get('data');
        const nonce = url.searchParams.get('nonce');
        const state = url.searchParams.get('state') || '';

        if (!phantomPub || !data || !nonce) throw new Error('missing_params');

        const ephSecret = state ? popEphemeralSecret(state) : null;
        if (!ephSecret) throw new Error('missing_ephemeral_secret');

        const payload = decodePayload(phantomPub, data, nonce, ephSecret);
        localStorage.setItem('phantom_public_key', payload.public_key);
        localStorage.setItem('phantom_session', payload.session);

        setStatus('ok');
        setMessage('Connected via Direct Connect. Redirecting…');
        setTimeout(() => {
          router.replace('/');
        }, 800);
      } catch (e: any) {
        console.error(e);
        setStatus('error');
        setMessage(e?.message || 'Failed to decode callback');
      }
    })();
  }, [router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6 text-white max-w-md w-[92vw]">
        <div className="text-lg font-semibold mb-2">
          Phantom Direct Connect
        </div>
        <div className={`text-sm ${status === 'error' ? 'text-red-300' : 'text-gray-200'}`}>
          {message}
        </div>
        {status === 'error' && (
          <button
            onClick={() => location.replace('/')}
            className="mt-3 text-sm underline"
          >
            Go home
          </button>
        )}
      </div>
    </div>
  );
}
