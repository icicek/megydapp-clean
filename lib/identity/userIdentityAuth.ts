// lib/identity/userIdentityAuth.ts

import type { PublicKey } from '@solana/web3.js';

type SignMessageFn = (
  message: Uint8Array
) => Promise<Uint8Array>;

type DirectWalletProvider = {
  publicKey?: {
    toBase58?: () => string;
  };
  isConnected?: boolean;
  connect?: (
    options?: { onlyIfTrusted?: boolean }
  ) => Promise<unknown>;
  signMessage?: (
    message: Uint8Array,
    encoding?: string
  ) => Promise<
    Uint8Array | { signature: Uint8Array }
  >;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
};

function toBase64(bytes: Uint8Array): string {
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

async function readJsonResponse(
  response: Response
): Promise<ApiResponse | null> {
  try {
    const data: unknown = await response.json();

    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      return null;
    }

    return data as ApiResponse;
  } catch {
    return null;
  }
}

function getApiError(
  data: ApiResponse | null,
  fallback: string
): string {
  return typeof data?.error === 'string' &&
    data.error.trim()
    ? data.error
    : fallback;
}

async function signWithDirectProvider(params: {
  message: Uint8Array;
  walletAddress: string;
  walletName?: string;
}): Promise<Uint8Array | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const anyWindow = window as unknown as {
    solana?: DirectWalletProvider;
    phantom?: {
      solana?: DirectWalletProvider;
    };
    backpack?: {
      solana?: DirectWalletProvider;
    };
    solflare?: DirectWalletProvider;
  };

  const lowerName =
    params.walletName?.toLowerCase() ?? '';

  let provider: DirectWalletProvider | undefined;

  if (lowerName.includes('phantom')) {
    provider = anyWindow.phantom?.solana;
  } else if (lowerName.includes('backpack')) {
    provider = anyWindow.backpack?.solana;
  } else if (lowerName.includes('solflare')) {
    provider = anyWindow.solflare;
  } else {
    provider = anyWindow.solana;
  }

  if (!provider?.signMessage) {
    console.info(
      '[identity] No matching direct provider found:',
      params.walletName
    );

    return null;
  }

  try {
    let providerWallet =
      provider.publicKey?.toBase58?.();

    if (!providerWallet && provider.connect) {
      console.info(
        '[identity] Direct provider not connected. Requesting provider connect:',
        params.walletName
      );

      await provider.connect({
        onlyIfTrusted: false,
      });

      providerWallet =
        provider.publicKey?.toBase58?.();
    }

    if (
      providerWallet &&
      providerWallet !== params.walletAddress
    ) {
      console.warn(
        '[identity] Direct provider wallet mismatch:',
        {
          providerWallet,
          expectedWallet: params.walletAddress,
          walletName: params.walletName,
        }
      );

      return null;
    }

    console.info(
      '[identity] Trying direct provider signature:',
      params.walletName
    );

    const result = await provider.signMessage(
      params.message,
      'utf8'
    );

    if (result instanceof Uint8Array) {
      return result;
    }

    if (
      result &&
      typeof result === 'object' &&
      'signature' in result &&
      result.signature instanceof Uint8Array
    ) {
      return result.signature;
    }

    console.warn(
      '[identity] Direct provider returned an unsupported signature format.'
    );

    return null;
  } catch (error) {
    console.warn(
      '[identity] Direct provider signature failed:',
      error
    );

    return null;
  }
}

async function signIdentityMessage(params: {
  message: string;
  walletAddress: string;
  signMessage: SignMessageFn;
  walletName?: string;
}): Promise<Uint8Array> {
  const encodedMessage = new TextEncoder().encode(
    params.message
  );

  try {
    const directSignature =
      await signWithDirectProvider({
        message: encodedMessage,
        walletAddress: params.walletAddress,
        walletName: params.walletName,
      });

    if (directSignature) {
      return directSignature;
    }

    return await params.signMessage(encodedMessage);
  } catch (error) {
    console.warn(
      '[identity] Wallet signMessage failed:',
      error
    );

    throw new Error(
      'Wallet signature request failed. Please reconnect your wallet and approve the message signature.'
    );
  }
}

export async function signInWithWalletIdentity(
  params: {
    publicKey: PublicKey | null;
    signMessage?: SignMessageFn;
    walletName?: string;
  }
) {
  const {
    publicKey,
    signMessage,
    walletName,
  } = params;

  if (!publicKey) {
    throw new Error('Wallet is not connected.');
  }

  if (!signMessage) {
    throw new Error(
      'This wallet does not support message signing.'
    );
  }

  const walletAddress = publicKey.toBase58();

  console.info(
    '[identity] Step 1: requesting nonce',
    walletAddress
  );

  const nonceRes = await fetch('/api/auth/nonce', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({
      walletAddress,
    }),
  });

  const nonceData =
    await readJsonResponse(nonceRes);

  if (
    !nonceRes.ok ||
    nonceData?.ok !== true ||
    typeof nonceData.message !== 'string' ||
    typeof nonceData.nonce !== 'string'
  ) {
    throw new Error(
      getApiError(
        nonceData,
        'Failed to create identity challenge.'
      )
    );
  }

  console.info(
    '[identity] Step 2: nonce received'
  );

  console.info(
    '[identity] Step 3: requesting wallet signature'
  );

  const signatureBytes =
    await signIdentityMessage({
      message: nonceData.message,
      walletAddress,
      signMessage,
      walletName,
    });

  console.info(
    '[identity] Step 4: wallet signature received'
  );

  const signature = toBase64(signatureBytes);

  console.info(
    '[identity] Step 5: verifying signature on backend'
  );

  const verifyRes = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({
      walletAddress,
      nonce: nonceData.nonce,
      signature,
    }),
  });

  const verifyData =
    await readJsonResponse(verifyRes);

  if (
    !verifyRes.ok ||
    verifyData?.ok !== true
  ) {
    throw new Error(
      getApiError(
        verifyData,
        'Failed to verify identity signature.'
      )
    );
  }

  console.info(
    '[identity] Step 6: identity verified'
  );

  return verifyData;
}

export type UserIdentityStatus = {
  authenticated: boolean;
  identity: null | {
    id: string;
    primaryWalletAddress: string | null;
    walletAddress: string;
    humanConfidenceScore: number;
    riskScore: number;
    status: string;
    walletVerified: boolean;
    fingerprintRecorded: boolean;
    xLinked: boolean;
    claimReady: boolean;
    linkedWalletCount: number;
  };
};

export async function getUserIdentityStatus():
Promise<UserIdentityStatus> {
  const res = await fetch('/api/auth/status', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  const data = await readJsonResponse(res);

  if (
    !res.ok ||
    data?.ok !== true ||
    data.authenticated !== true ||
    !data.identity ||
    typeof data.identity !== 'object' ||
    Array.isArray(data.identity)
  ) {
    return {
      authenticated: false,
      identity: null,
    };
  }

  return {
    authenticated: true,
    identity:
      data.identity as UserIdentityStatus['identity'],
  };
}

export async function linkWalletToCurrentIdentity(
  params: {
    publicKey: PublicKey | null;
    signMessage?: SignMessageFn;
    walletName?: string;
  }
) {
  const {
    publicKey,
    signMessage,
    walletName,
  } = params;

  if (!publicKey) {
    throw new Error('Wallet is not connected.');
  }

  if (!signMessage) {
    throw new Error(
      'This wallet does not support message signing.'
    );
  }

  const walletAddress = publicKey.toBase58();

  console.info(
    '[identity-link] Step 1: requesting link-wallet nonce',
    walletAddress
  );

  const nonceRes = await fetch(
    '/api/auth/link-wallet/nonce',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({
        walletAddress,
      }),
    }
  );

  const nonceData =
    await readJsonResponse(nonceRes);

  if (
    !nonceRes.ok ||
    nonceData?.ok !== true ||
    typeof nonceData.message !== 'string' ||
    typeof nonceData.nonce !== 'string'
  ) {
    throw new Error(
      getApiError(
        nonceData,
        'Failed to create wallet link challenge.'
      )
    );
  }

  console.info(
    '[identity-link] Step 2: link nonce received'
  );

  console.info(
    '[identity-link] Step 3: requesting wallet signature'
  );

  const signatureBytes =
    await signIdentityMessage({
      message: nonceData.message,
      walletAddress,
      signMessage,
      walletName,
    });

  console.info(
    '[identity-link] Step 4: wallet signature received'
  );

  const signature = toBase64(signatureBytes);

  console.info(
    '[identity-link] Step 5: verifying wallet link on backend'
  );

  const verifyRes = await fetch(
    '/api/auth/link-wallet/verify',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({
        walletAddress,
        nonce: nonceData.nonce,
        signature,
      }),
    }
  );

  const verifyData =
    await readJsonResponse(verifyRes);

  if (
    !verifyRes.ok ||
    verifyData?.ok !== true
  ) {
    throw new Error(
      getApiError(
        verifyData,
        'Failed to link wallet.'
      )
    );
  }

  console.info(
    '[identity-link] Step 6: wallet linked'
  );

  return verifyData;
}

export async function createIdentityLinkCode() {
  const res = await fetch(
    '/api/auth/link-code/create',
    {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    }
  );

  const data = await readJsonResponse(res);

  if (
    !res.ok ||
    data?.ok !== true ||
    typeof data.code !== 'string' ||
    typeof data.expiresAt !== 'string'
  ) {
    throw new Error(
      getApiError(
        data,
        'Failed to create identity link code.'
      )
    );
  }

  return {
    ok: true as const,
    code: data.code,
    expiresAt: data.expiresAt,
  };
}

export async function linkWalletWithIdentityCode(
  params: {
    publicKey: PublicKey | null;
    signMessage?: SignMessageFn;
    walletName?: string;
    code: string;
  }
) {
  const {
    publicKey,
    signMessage,
    walletName,
    code,
  } = params;

  if (!publicKey) {
    throw new Error('Wallet is not connected.');
  }

  if (!signMessage) {
    throw new Error(
      'This wallet does not support message signing.'
    );
  }

  const walletAddress = publicKey.toBase58();
  const normalizedCode =
    code.trim().toUpperCase();

  if (!normalizedCode) {
    throw new Error(
      'Identity link code is required.'
    );
  }

  const message = [
    'Coincarnation Identity Recovery',
    '',
    `Wallet: ${walletAddress}`,
    `Link Code: ${normalizedCode}`,
    '',
    'Sign this message to link this wallet to an existing Coincarnation Identity.',
    'This does not approve a transaction or move funds.',
  ].join('\n');

  console.info(
    '[identity-code] Step 1: requesting wallet signature'
  );

  const signatureBytes =
    await signIdentityMessage({
      message,
      walletAddress,
      signMessage,
      walletName,
    });

  const signature = toBase64(signatureBytes);

  console.info(
    '[identity-code] Step 2: verifying link code on backend'
  );

  const verifyRes = await fetch(
    '/api/auth/link-code/verify',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({
        walletAddress,
        code: normalizedCode,
        signature,
      }),
    }
  );

  const verifyData =
    await readJsonResponse(verifyRes);

  if (
    !verifyRes.ok ||
    verifyData?.ok !== true
  ) {
    throw new Error(
      getApiError(
        verifyData,
        'Failed to link wallet with identity code.'
      )
    );
  }

  console.info(
    '[identity-code] Step 3: wallet linked with identity code'
  );

  return verifyData;
}