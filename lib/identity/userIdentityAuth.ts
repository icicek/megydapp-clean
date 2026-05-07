//lib/identity/userIdentityAuth.ts
import type { PublicKey } from '@solana/web3.js';

type SignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;

type DirectWalletProvider = {
    publicKey?: { toBase58?: () => string };
    isConnected?: boolean;
    connect?: (options?: { onlyIfTrusted?: boolean }) => Promise<unknown>;
    signMessage?: (
        message: Uint8Array,
        encoding?: string
    ) => Promise<Uint8Array | { signature: Uint8Array }>;
};

export type UserIdentitySession = {
    authenticated: boolean;
    identity?: {
        id: string;
        primaryWalletAddress: string | null;
        walletAddress: string;
        humanConfidenceScore: number;
        riskScore: number;
        status: string;
    };
};

function toBase64(bytes: Uint8Array) {
    let binary = '';

    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary);
}

async function signWithDirectProvider(params: {
    message: Uint8Array;
    walletAddress: string;
    walletName?: string;
}) {
    if (typeof window === 'undefined') return null;

    const anyWindow = window as unknown as {
        solana?: DirectWalletProvider;
        phantom?: { solana?: DirectWalletProvider };
        backpack?: { solana?: DirectWalletProvider };
        solflare?: DirectWalletProvider;
    };

    const lowerName = params.walletName?.toLowerCase() || '';

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
        console.info('[identity] No matching direct provider found:', params.walletName);
        return null;
    }

    try {
        let providerWallet = provider.publicKey?.toBase58?.();

        if (!providerWallet && provider.connect) {
            console.info('[identity] Direct provider not connected. Requesting provider connect:', params.walletName);
            await provider.connect({ onlyIfTrusted: false });
            providerWallet = provider.publicKey?.toBase58?.();
        }

        if (providerWallet && providerWallet !== params.walletAddress) {
            console.warn('[identity] Direct provider wallet mismatch:', {
                providerWallet,
                expectedWallet: params.walletAddress,
                walletName: params.walletName,
            });

            return null;
        }

        console.info('[identity] Trying direct provider signature:', params.walletName);

        const result = await provider.signMessage(params.message, 'utf8');

        if (result instanceof Uint8Array) {
            return result;
        }

        if ('signature' in result && result.signature instanceof Uint8Array) {
            return result.signature;
        }

        return null;
    } catch (error) {
        console.warn('[identity] Direct provider signature failed:', error);
        return null;
    }
}

export async function getUserIdentitySession(): Promise<UserIdentitySession> {
    const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
    });

    const data = await res.json();

    if (!res.ok || !data.ok || !data.authenticated) {
        return { authenticated: false };
    }

    return {
        authenticated: true,
        identity: data.identity,
    };
}

export async function signInWithWalletIdentity(params: {
    publicKey: PublicKey | null;
    signMessage?: SignMessageFn;
    walletName?: string;
}) {
    const { publicKey, signMessage, walletName } = params;

    if (!publicKey) {
        throw new Error('Wallet is not connected.');
    }

    if (!signMessage) {
        throw new Error('This wallet does not support message signing.');
    }

    const walletAddress = publicKey.toBase58();

    console.info('[identity] Step 1: requesting nonce', walletAddress);

    const nonceRes = await fetch('/api/auth/nonce', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ walletAddress }),
    });

    const nonceData = await nonceRes.json();

    if (!nonceRes.ok || !nonceData.ok || !nonceData.message || !nonceData.nonce) {
        throw new Error(nonceData.error || 'Failed to create identity challenge.');
    }

    console.info('[identity] Step 2: nonce received');
    console.info('[identity] Step 3: requesting wallet signature');

    let signatureBytes: Uint8Array;

    try {
        const encodedMessage = new TextEncoder().encode(nonceData.message);

        const directSignature = await signWithDirectProvider({
            message: encodedMessage,
            walletAddress,
            walletName,
        });

        if (directSignature) {
            signatureBytes = directSignature;
        } else {
            signatureBytes = await signMessage(encodedMessage);
        }
    } catch (error) {
        console.warn('[identity] Wallet signMessage failed:', error);

        throw new Error(
            'Wallet signature request failed. Please reconnect your wallet and approve the message signature.'
        );
    }

    console.info('[identity] Step 4: wallet signature received');

    const signature = toBase64(signatureBytes);

    console.info('[identity] Step 5: verifying signature on backend');

    const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
            walletAddress,
            nonce: nonceData.nonce,
            signature,
        }),
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.ok) {
        throw new Error(verifyData.error || 'Failed to verify identity signature.');
    }

    console.info('[identity] Step 6: identity verified');

    return verifyData;
}

export async function logoutUserIdentity() {
    const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to logout identity session.');
    }

    return data;
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

export async function getUserIdentityStatus(): Promise<UserIdentityStatus> {
    const res = await fetch('/api/auth/status', {
        method: 'GET',
        credentials: 'include',
    });

    const data = await res.json();

    if (!res.ok || !data.ok || !data.authenticated) {
        return {
            authenticated: false,
            identity: null,
        };
    }

    return {
        authenticated: true,
        identity: data.identity,
    };
}

export async function linkWalletToCurrentIdentity(params: {
    publicKey: PublicKey | null;
    signMessage?: SignMessageFn;
    walletName?: string;
}) {
    const { publicKey, signMessage, walletName } = params;

    if (!publicKey) {
        throw new Error('Wallet is not connected.');
    }

    if (!signMessage) {
        throw new Error('This wallet does not support message signing.');
    }

    const walletAddress = publicKey.toBase58();

    console.info('[identity-link] Step 1: requesting link-wallet nonce', walletAddress);

    const nonceRes = await fetch('/api/auth/link-wallet/nonce', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ walletAddress }),
    });

    const nonceData = await nonceRes.json();

    if (!nonceRes.ok || !nonceData.ok || !nonceData.message || !nonceData.nonce) {
        throw new Error(nonceData.error || 'Failed to create wallet link challenge.');
    }

    console.info('[identity-link] Step 2: link nonce received');
    console.info('[identity-link] Step 3: requesting wallet signature');

    let signatureBytes: Uint8Array;

    try {
        const encodedMessage = new TextEncoder().encode(nonceData.message);

        const directSignature = await signWithDirectProvider({
            message: encodedMessage,
            walletAddress,
            walletName,
        });

        if (directSignature) {
            signatureBytes = directSignature;
        } else {
            signatureBytes = await signMessage(encodedMessage);
        }
    } catch (error) {
        console.warn('[identity-link] Wallet signMessage failed:', error);

        throw new Error(
            'Wallet signature request failed. Please reconnect your wallet and approve the message signature.'
        );
    }

    console.info('[identity-link] Step 4: wallet signature received');

    const signature = toBase64(signatureBytes);

    console.info('[identity-link] Step 5: verifying wallet link on backend');

    const verifyRes = await fetch('/api/auth/link-wallet/verify', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
            walletAddress,
            nonce: nonceData.nonce,
            signature,
        }),
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.ok) {
        throw new Error(verifyData.error || 'Failed to link wallet.');
    }

    console.info('[identity-link] Step 6: wallet linked');

    return verifyData;
}