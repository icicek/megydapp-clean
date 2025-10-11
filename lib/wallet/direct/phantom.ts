import nacl from 'tweetnacl';
import bs58 from 'bs58';

const EK_PREFIX = 'phantom:ek:'; // sessionStorage key
const S_KEY = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function generateEphemeral() {
  const kp = nacl.box.keyPair();
  const pub = bs58.encode(kp.publicKey);
  const sec = bs58.encode(kp.secretKey);
  // tie to a state token
  const state = S_KEY();
  sessionStorage.setItem(EK_PREFIX + state, sec);
  return { state, dappPublicKeyBase58: pub };
}

export function popEphemeralSecret(state: string) {
  const k = EK_PREFIX + state;
  const sec = sessionStorage.getItem(k);
  if (!sec) return null;
  sessionStorage.removeItem(k);
  return bs58.decode(sec);
}

/** Build guarded connect URL on server and redirect (must be called on a user gesture). */
export async function openPhantomDirectConnect(opts: {
  appUrl: string;
  redirectLink: string; // e.g., https://coincarnation.com/phantom/callback
}) {
  const { state, dappPublicKeyBase58 } = generateEphemeral();

  const url = new URL('/api/wallet/connect/phantom', window.location.origin);
  url.searchParams.set('app_url', opts.appUrl);
  url.searchParams.set('redirect_link', opts.redirectLink);
  url.searchParams.set('dapp_encryption_public_key', dappPublicKeyBase58);
  url.searchParams.set('state', state);

  const res = await fetch(url.toString(), { cache: 'no-store' });
  const js = await res.json();
  if (!js.ok) throw new Error(js.error || 'connect_build_failed');

  window.location.href = js.url as string; // let Phantom app handle the flow
}
