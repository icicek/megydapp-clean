'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import IdentityGate from '@/components/identity/IdentityGate';
import {
    getUserIdentitySession,
    getUserIdentityStatus,
    logoutUserIdentity,
    linkWalletToCurrentIdentity,
    type UserIdentitySession,
    type UserIdentityStatus,
} from '@/lib/identity/userIdentityAuth';

type LinkedIdentityWallet = {
    walletAddress: string;
    chain: string;
    isPrimary: boolean;
    verifiedAt: string | null;
    lastSeenAt: string | null;
    createdAt: string | null;
};

export default function IdentityTestPage() {
    const { connected, publicKey, signMessage, wallet } = useWallet();
    const { setVisible } = useWalletModal();

    const [session, setSession] = useState<UserIdentitySession>({
        authenticated: false,
    });
    const [identityStatus, setIdentityStatus] = useState<UserIdentityStatus>({
        authenticated: false,
        identity: null,
    });
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState('');
    const [linkedWallets, setLinkedWallets] = useState<LinkedIdentityWallet[]>([]);

    async function refreshSession() {
        const nextSession = await getUserIdentitySession();
        const nextStatus = await getUserIdentityStatus();

        setSession(nextSession);
        setIdentityStatus(nextStatus);

        if (nextSession.authenticated) {
            await refreshLinkedWallets();
        } else {
            setLinkedWallets([]);
        }
    }

    async function refreshLinkedWallets() {
        try {
            const res = await fetch('/api/auth/wallets', {
                method: 'GET',
                credentials: 'include',
            });

            const data = await res.json();

            if (!res.ok || !data.ok) {
                setLinkedWallets([]);
                return;
            }

            setLinkedWallets(Array.isArray(data.wallets) ? data.wallets : []);
        } catch {
            setLinkedWallets([]);
        }
    }

    useEffect(() => {
        void refreshSession();
    }, []);

    useEffect(() => {
        if (!connected || !publicKey) return;

        void refreshSession();
    }, [connected, publicKey]);

    async function handleLogout() {
        try {
            setLoading(true);
            setNotice('Logging out...');

            await logoutUserIdentity();

            setNotice('Identity session cleared.');
            await refreshSession();
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Logout failed.';

            setNotice(message);
        } finally {
            setLoading(false);
        }
    }

    async function handleLinkCurrentWallet() {
        try {
            setLoading(true);
            setNotice('Linking wallet to current identity...');

            await linkWalletToCurrentIdentity({
                publicKey,
                signMessage,
                walletName: wallet?.adapter?.name,
            });

            setNotice('Wallet linked to current identity.');
            await refreshSession();
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Wallet linking failed.';

            setNotice(message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-black px-5 py-10 text-white">
            <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/80">
                    Coincarnation Identity Layer
                </p>

                <h1 className="mt-3 text-3xl font-black tracking-tight">
                    Identity Test
                </h1>

                <p className="mt-3 text-sm leading-6 text-white/65">
                    This page tests user wallet signature authentication only. It does not
                    touch admin authentication.
                </p>

                <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
                    <p>
                        <span className="text-white/45">Wallet connected:</span>{' '}
                        <span className="font-semibold">{connected ? 'Yes' : 'No'}</span>
                    </p>

                    <p>
                        <span className="text-white/45">Wallet:</span>{' '}
                        <span className="font-mono text-xs">
                            {publicKey?.toBase58() || 'Not connected'}
                        </span>
                    </p>

                    <p>
                        <span className="text-white/45">Identity session:</span>{' '}
                        <span className="font-semibold">
                            {session.authenticated ? 'Authenticated' : 'Not authenticated'}
                        </span>
                    </p>

                    {session.identity && (
                        <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                            <p className="text-emerald-200">
                                Identity ID:{' '}
                                <span className="font-mono text-xs">{session.identity.id}</span>
                            </p>

                            <p className="mt-2 text-emerald-200">
                                Human confidence:{' '}
                                <span className="font-bold">
                                    {session.identity.humanConfidenceScore}
                                </span>
                            </p>

                            <p className="mt-2 text-emerald-200">
                                Risk score:{' '}
                                <span className="font-bold">{session.identity.riskScore}</span>
                            </p>
                        </div>
                    )}
                    {identityStatus.identity && (
                        <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-cyan-100">
                            <p className="font-bold">Identity Status</p>

                            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                                <p>Wallet verified: {identityStatus.identity.walletVerified ? 'Yes' : 'No'}</p>
                                <p>Fingerprint recorded: {identityStatus.identity.fingerprintRecorded ? 'Yes' : 'No'}</p>
                                <p>X linked: {identityStatus.identity.xLinked ? 'Yes' : 'No'}</p>
                                <p>Claim ready: {identityStatus.identity.claimReady ? 'Yes' : 'No'}</p>
                                <p>Linked wallets: {identityStatus.identity.linkedWalletCount}</p>
                            </div>
                        </div>
                    )}
                    {linkedWallets.length > 0 && (
                        <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/10 p-4 text-violet-100">
                            <p className="font-bold">Linked Wallets</p>

                            <div className="mt-3 space-y-2">
                                {linkedWallets.map((item) => (
                                    <div
                                        key={`${item.chain}-${item.walletAddress}`}
                                        className="rounded-xl border border-white/10 bg-black/25 p-3"
                                    >
                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                            <p className="font-mono text-[11px] text-white/80 break-all">
                                                {item.walletAddress}
                                            </p>

                                            <div className="flex gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
                                                {item.isPrimary && (
                                                    <span className="rounded-full bg-emerald-300 px-2 py-1 text-black">
                                                        Primary
                                                    </span>
                                                )}

                                                <span className="rounded-full bg-white/10 px-2 py-1 text-white/70">
                                                    {item.chain}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {notice && (
                    <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">
                        {notice}
                    </div>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <button
                        type="button"
                        onClick={() => setVisible(true)}
                        className="rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-200"
                    >
                        {connected ? 'Switch Wallet' : 'Connect Wallet'}
                    </button>

                    {connected && session.authenticated && (
                        <button
                            type="button"
                            onClick={handleLinkCurrentWallet}
                            disabled={loading}
                            className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-black transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Link Current Wallet
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleLogout}
                        disabled={loading}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Logout Identity
                    </button>
                </div>
                <div className="mt-8">
                    <IdentityGate
                        key={`${session.authenticated}-${identityStatus.identity?.claimReady ? 'ready' : 'not-ready'}-${publicKey?.toBase58() || 'no-wallet'}`}
                        onVerified={refreshSession}
                    >
                        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6">
                            <p className="text-lg font-black text-emerald-100">
                                Protected Identity Content
                            </p>
                            <p className="mt-2 text-sm text-emerald-100/70">
                                You can see this because your Coincarnation Identity is claim-ready.
                            </p>
                        </div>
                    </IdentityGate>
                </div>
            </div>
        </main>
    );
}