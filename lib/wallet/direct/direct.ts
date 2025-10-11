// lib/wallet/direct/direct.ts
import nacl from 'tweetnacl';
import bs58 from 'bs58';

export type Provider = 'phantom' | 'solflare' | 'backpack';

const EK_PREFIX = (p: Provider) => `dc:ek:${p}:`;
const S_KEY = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function generateEphemeral(provider: Provider) {
  const kp = nacl.box.keyPair();
  const pub = bs58.encode(kp.publicKey);
  const sec = bs58.encode(kp.secretKey);
  const state = S_KEY();
  sessionStorage.setItem(EK_PREFIX(provider) + state, sec);
  return { state, dappPublicKeyBase58: pub };
}

export function popEphemeralSecret(provider: Provider, state: string) {
  const k = EK_PREFIX(provider) + state;
  const sec = sessionStorage.getItem(k);
  if (!sec) return null;
  sessionStorage.removeItem(k);
  return bs58.decode(sec);
}

export async function openDirectConnect(
  provider: Provider,
  opts: { appUrl: string; redirectLink: string; cluster?: string }
) {
  const { state, dappPublicKeyBase58 } = generateEphemeral(provider);

  const url = new URL(`/api/wallet/connect/${provider}`, window.location.origin);
  url.searchParams.set('app_url', opts.appUrl);
  url.searchParams.set('redirect_link', opts.redirectLink);
  url.searchParams.set('dapp_encryption_public_key', dappPublicKeyBase58);
  url.searchParams.set('state', state);
  if (opts.cluster) url.searchParams.set('cluster', opts.cluster);

  const res = await fetch(url.toString(), { cache: 'no-store' });
  const js = await res.json();
  if (!js.ok) throw new Error(js.error || 'connect_build_failed');

  window.location.href = js.url as string; // must be called inside a user gesture
}
