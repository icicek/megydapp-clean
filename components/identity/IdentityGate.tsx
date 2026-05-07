//components/identity/IdentityGate.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
    getUserIdentityStatus,
    signInWithWalletIdentity,
    type UserIdentityStatus,
} from '@/lib/identity/userIdentityAuth';
import { recordIdentityFingerprint } from '@/lib/identity/fingerprint';

type IdentityGateProps = {
    children: React.ReactNode;
    title?: string;
    description?: string;
    onVerified?: () => void | Promise<void>;
};

export default function IdentityGate({
    children,
    title = 'Verify your Coincarnation Identity',
    description = 'Connect and sign a wallet message to activate your human identity layer. This does not move funds or authorize a transaction.',
    onVerified,
}: IdentityGateProps) {
    const { connected, publicKey, signMessage, wallet } = useWallet();
    const { setVisible } = useWalletModal();

    const [status, setStatus] = useState<UserIdentityStatus>({
        authenticated: false,
        identity: null,
    });

    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [notice, setNotice] = useState('');

    const readiness = useMemo(() => {
        const identity = status.identity;

        if (!connected) {
            return {
                ready: false,
                reason: 'Wallet connection required',
                detail: 'Connect your wallet before verifying your Coincarnation Identity.',
            };
        }

        if (!identity) {
            return {
                ready: false,
                reason: 'Identity verification required',
                detail: 'Sign a wallet message to prove ownership and create your identity record.',
            };
        }

        if (!identity.walletVerified) {
            return {
                ready: false,
                reason: 'Wallet signature required',
                detail: 'Your wallet must be verified with a signed message.',
            };
        }

        if (!identity.fingerprintRecorded) {
            return {
                ready: false,
                reason: 'Device signal pending',
                detail: 'A lightweight device/session signal is needed for abuse protection.',
            };
        }

        if (identity.riskScore >= 50) {
            return {
                ready: false,
                reason: 'Manual review required',
                detail: 'This identity has elevated risk signals and may need review before claiming.',
            };
        }

        if (identity.status !== 'active') {
            return {
                ready: false,
                reason: 'Identity not active',
                detail: 'This identity is not currently active.',
            };
        }

        return {
            ready: true,
            reason: 'Identity claim-ready',
            detail: 'Your wallet and device signal are verified.',
        };
    }, [connected, status.identity]);

    async function refreshStatus() {
        const nextStatus = await getUserIdentityStatus();
        setStatus(nextStatus);
    }

    useEffect(() => {
        let alive = true;

        async function run() {
            try {
                const nextStatus = await getUserIdentityStatus();

                if (alive) {
                    setStatus(nextStatus);
                }
            } catch {
                if (alive) {
                    setNotice('Unable to read identity status.');
                }
            } finally {
                if (alive) {
                    setLoading(false);
                }
            }
        }

        void run();

        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        if (!connected || !publicKey) return;

        void refreshStatus();
    }, [connected, publicKey]);

    async function handleVerifyIdentity() {
        try {
            if (!connected || !publicKey) {
                setNotice('Connect your wallet before verifying your identity.');
                return;
            }

            if (status.identity?.claimReady) {
                setNotice('Identity is already verified and claim-ready.');
                return;
            }

            setVerifying(true);
            setNotice('Preparing identity verification...');

            await signInWithWalletIdentity({
                publicKey,
                signMessage,
                walletName: wallet?.adapter?.name,
            });
            
            await recordIdentityFingerprint(publicKey.toBase58());
            await refreshStatus();
            
            if (onVerified) {
                await onVerified();
            }
            
            setNotice('Identity verified successfully. Fingerprint recorded.');
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Identity verification failed.';

            setNotice(message);
        } finally {
            setVerifying(false);
        }
    }

    if (loading) {
        return (
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-white shadow-[0_0_35px_rgba(255,255,255,0.04)]">
                <div className="h-2 w-28 animate-pulse rounded-full bg-cyan-300/30" />
                <div className="mt-4 h-7 w-64 animate-pulse rounded-xl bg-white/10" />
                <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded-xl bg-white/10" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded-xl bg-white/10" />
            </section>
        );
    }

    if (status.identity?.claimReady) {
        return <>{children}</>;
    }

    return (
        <section className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.06] p-6 text-white shadow-[0_0_35px_rgba(34,211,238,0.08)]">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-200/80">
                Identity Layer
            </p>

            <h2 className="mt-3 text-2xl font-black tracking-tight">{title}</h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
                {description}
            </p>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/40">
                    Current status
                </p>

                <p className="mt-2 text-lg font-black text-cyan-100">
                    {readiness.reason}
                </p>

                <p className="mt-1 text-sm leading-6 text-white/55">
                    {readiness.detail}
                </p>
            </div>

            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-white/45">Wallet</p>
                    <p className="mt-1 font-semibold">
                        {connected ? 'Connected' : 'Not connected'}
                    </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-white/45">Wallet adapter</p>
                    <p className="mt-1 font-semibold">
                        {wallet?.adapter?.name || 'Unknown'}
                    </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-white/45">Wallet signature</p>
                    <p className="mt-1 font-semibold">
                        {status.identity?.walletVerified ? 'Verified' : 'Required'}
                    </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-white/45">Device signal</p>
                    <p className="mt-1 font-semibold">
                        {status.identity?.fingerprintRecorded ? 'Recorded' : 'Pending'}
                    </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-white/45">X identity</p>
                    <p className="mt-1 font-semibold">
                        {status.identity?.xLinked ? 'Linked' : 'Optional'}
                    </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-white/45">Human confidence</p>
                    <p className="mt-1 font-semibold">
                        {status.identity?.humanConfidenceScore ?? 0}
                    </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-white/45">Risk score</p>
                    <p className="mt-1 font-semibold">
                        {status.identity?.riskScore ?? 0}
                    </p>
                </div>
            </div>

            {notice && (
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-cyan-100">
                    {notice}
                </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {!connected ? (
                    <button
                        type="button"
                        onClick={() => setVisible(true)}
                        className="rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-200"
                    >
                        Connect Wallet
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleVerifyIdentity}
                        disabled={verifying || Boolean(status.identity?.claimReady)}
                        className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-black transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {verifying
                            ? 'Verifying...'
                            : status.identity?.claimReady
                                ? 'Identity Already Verified'
                                : 'Verify Identity'}
                    </button>
                )}
            </div>

            <p className="mt-4 text-xs leading-5 text-white/40">
                Signing this message only proves wallet ownership. It does not approve a
                transaction, transfer tokens, or give spending permission.
            </p>
        </section>
    );
}