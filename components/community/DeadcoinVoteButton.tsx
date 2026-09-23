// components/community/DeadcoinVoteButton.tsx

'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  signInWithWalletIdentity,
  checkIdentityLinkCode,
  linkWalletWithIdentityCode,
} from '@/lib/identity/userIdentityAuth';

/**
 * Must remain exactly aligned with /api/vote:
 *
 * "coincarnation:vote:deadcoin\nmint:<MINT>\nwallet:<WALLET>\nts:<UNIX>"
 */
function buildMessage(mint: string, wallet: string, ts: number) {
  return `coincarnation:vote:deadcoin\nmint:${mint}\nwallet:${wallet}\nts:${ts}`;
}

type VoteResponse = {
  success: boolean;
  votesYes?: number;
  threshold?: number;
  applied?: boolean;
  blocked?: boolean;
  blockedBy?: string | null;
  alreadyVoted?: boolean;
  myVote?: boolean | null;
  identityScope?: string | null;
  identityError?: string | null;
  error?: string;
  status?: string | null;
  decision?: {
    zone?: string;
    highLiq?: boolean;
    voteEligible?: boolean;
  };
};

type FeedbackState =
  | {
    type: 'success' | 'error' | 'info';
    message: string;
  }
  | null;

export default function DeadcoinVoteButton({
  mint,
  onVoted,
  label = 'Vote Deadcoin',
  className = '',
}: {
  mint: string;
  onVoted?: (res: VoteResponse) => void;
  label?: string;
  className?: string;
}) {
  const { publicKey, signMessage, wallet } = useWallet();

  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [status, setStatus] = useState<VoteResponse | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityNeedsCreation, setIdentityNeedsCreation] = useState(false);
  const [identityLinkMode, setIdentityLinkMode] = useState(false);
  const [identityLinkCode, setIdentityLinkCode] = useState('');
  const [identityLinking, setIdentityLinking] = useState(false);

  useEffect(() => {
    let alive = true;

    async function fetchVoteStatus() {
      if (!mint || !publicKey) {
        if (alive) {
          setStatus(null);
          setFeedback(null);
          setStatusLoading(false);
        }
        return;
      }

      try {
        setStatusLoading(true);

        const walletAddress = publicKey.toBase58();

        const res = await fetch(
          `/api/vote/status?mint=${encodeURIComponent(
            mint
          )}&wallet=${encodeURIComponent(walletAddress)}`,
          { cache: 'no-store' }
        );

        const json: VoteResponse = await res.json().catch(() => ({
          success: false,
          error: 'status_parse_failed',
        }));

        if (!alive) return;

        if (res.ok && json?.success) {
          setStatus(json);

          if (json.identityError) {
            setFeedback({
              type: 'info',
              message:
                'A verified Coincarnation identity is required to participate in community voting.',
            });
          } else if (json.alreadyVoted && json.myVote === true) {
            setFeedback({
              type: 'success',
              message: 'Your Deadcoin vote is already recorded.',
            });
          } else {
            setFeedback(null);
          }
        } else {
          setStatus(null);
          setFeedback({
            type: 'error',
            message: 'Community vote status could not be loaded.',
          });
        }
      } catch {
        if (!alive) return;

        setStatus(null);
        setFeedback({
          type: 'error',
          message: 'Community vote status could not be loaded.',
        });
      } finally {
        if (alive) {
          setStatusLoading(false);
        }
      }
    }

    void fetchVoteStatus();

    return () => {
      alive = false;
    };
  }, [mint, publicKey]);

  async function refreshVoteStatus() {
    if (!mint || !publicKey) return;

    const walletAddress = publicKey.toBase58();

    const res = await fetch(
      `/api/vote/status?mint=${encodeURIComponent(
        mint
      )}&wallet=${encodeURIComponent(walletAddress)}`,
      { cache: 'no-store' }
    );

    const json: VoteResponse = await res.json().catch(() => ({
      success: false,
      error: 'status_parse_failed',
    }));

    if (!res.ok || !json?.success) {
      throw new Error(
        json?.error || 'Community vote status could not be refreshed.'
      );
    }

    setStatus(json);

    if (json.identityError) {
      setFeedback({
        type: 'info',
        message:
          'A verified Coincarnation Identity is required to participate in community voting.',
      });
    } else {
      setIdentityNeedsCreation(false);
      setFeedback({
        type: 'success',
        message: 'Coincarnation Identity ready. You can now cast your vote.',
      });
    }
  }

  async function handleIdentityAccess() {
    if (identityLoading) return;

    if (!publicKey) {
      setFeedback({
        type: 'info',
        message: 'Connect your wallet to continue.',
      });
      return;
    }

    if (!signMessage) {
      setFeedback({
        type: 'error',
        message: 'Your connected wallet does not support message signing.',
      });
      return;
    }

    const operationWallet = publicKey.toBase58();

    try {
      setIdentityLoading(true);
      setFeedback({
        type: 'info',
        message: 'Checking whether this wallet already has a Coincarnation Identity...',
      });

      const res = await fetch('/api/auth/wallet-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          walletAddress: operationWallet,
        }),
      });

      const result = (await res.json().catch(() => null)) as
        | {
          ok?: boolean;
          linked?: boolean;
          error?: string;
        }
        | null;

      if (!res.ok || !result?.ok) {
        throw new Error(
          result?.error || 'Failed to check wallet Identity status.'
        );
      }

      if (publicKey.toBase58() !== operationWallet) {
        throw new Error(
          'The connected wallet changed during Identity verification.'
        );
      }

      if (!result.linked) {
        setIdentityNeedsCreation(true);
        setFeedback({
          type: 'info',
          message:
            'This wallet does not have a Coincarnation Identity yet. Create one to participate in community voting.',
        });
        return;
      }

      setFeedback({
        type: 'info',
        message: 'Please approve the wallet signature to open your Identity...',
      });

      await signInWithWalletIdentity({
        publicKey,
        signMessage,
        walletName: wallet?.adapter?.name,
        intent: 'sign_in',
      });

      await refreshVoteStatus();
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to prepare Coincarnation Identity.',
      });
    } finally {
      setIdentityLoading(false);
    }
  }

  async function handleCreateIdentityForVote() {
    if (identityLoading) return;

    if (!publicKey || !signMessage) {
      setFeedback({
        type: 'error',
        message: 'Connect a wallet that supports message signing.',
      });
      return;
    }

    const operationWallet = publicKey.toBase58();

    try {
      setIdentityLoading(true);

      setFeedback({
        type: 'info',
        message: 'Please approve the wallet signature to create your Identity...',
      });

      await signInWithWalletIdentity({
        publicKey,
        signMessage,
        walletName: wallet?.adapter?.name,
        intent: 'create_identity',
      });

      if (publicKey.toBase58() !== operationWallet) {
        throw new Error(
          'The connected wallet changed during Identity creation.'
        );
      }

      setIdentityNeedsCreation(false);

      await refreshVoteStatus();
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to create Coincarnation Identity.',
      });
    } finally {
      setIdentityLoading(false);
    }
  }

  async function handleLinkExistingIdentityForVote() {
    if (identityLinking) return;

    if (!publicKey) {
      setFeedback({
        type: 'info',
        message: 'Connect your wallet to continue.',
      });
      return;
    }

    if (!signMessage) {
      setFeedback({
        type: 'error',
        message: 'Your connected wallet does not support message signing.',
      });
      return;
    }

    const operationWallet = publicKey.toBase58();
    const code = identityLinkCode.trim().toUpperCase();

    if (!code) {
      setFeedback({
        type: 'info',
        message: 'Enter your Identity Link Code.',
      });
      return;
    }

    try {
      setIdentityLinking(true);

      setFeedback({
        type: 'info',
        message: 'Checking this wallet and Identity Link Code...',
      });

      const checkResult = await checkIdentityLinkCode({
        walletAddress: operationWallet,
        code,
      });

      if (!checkResult.available) {
        if (checkResult.reason === 'wallet_already_linked') {
          setFeedback({
            type: 'info',
            message:
              'This wallet already belongs to a Coincarnation Identity. Continue with that Identity instead.',
          });
          return;
        }

        if (checkResult.reason === 'invalid_code') {
          setFeedback({
            type: 'error',
            message:
              'Enter a valid Identity Link Code in the format MEGY-12345678.',
          });
          return;
        }

        setFeedback({
          type: 'error',
          message:
            'This Identity Link Code has expired or has already been used. Generate a new code from a wallet already linked to the Identity.',
        });
        return;
      }

      if (publicKey.toBase58() !== operationWallet) {
        throw new Error(
          'The connected wallet changed during Identity linking.'
        );
      }

      setFeedback({
        type: 'info',
        message:
          'Please approve the wallet signature to link this wallet to your existing Identity...',
      });

      await linkWalletWithIdentityCode({
        publicKey,
        signMessage,
        walletName: wallet?.adapter?.name,
        code,
      });

      if (publicKey.toBase58() !== operationWallet) {
        throw new Error(
          'The connected wallet changed during Identity linking.'
        );
      }

      setIdentityLinkCode('');
      setIdentityLinkMode(false);
      setIdentityNeedsCreation(false);

      await refreshVoteStatus();

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to link this wallet to the Identity.';

      const normalizedMessage = message.toLowerCase();

      if (
        normalizedMessage.includes('already linked to an identity') ||
        normalizedMessage.includes('already belongs to an identity')
      ) {
        setFeedback({
          type: 'info',
          message:
            'This wallet already belongs to another Coincarnation Identity. Wallet transfers between identities are not currently supported.',
        });
        return;
      }

      if (
        normalizedMessage.includes('expired') ||
        normalizedMessage.includes('already used')
      ) {
        setFeedback({
          type: 'error',
          message:
            'This Identity Link Code has expired or has already been used. Generate a new code from a wallet already linked to the Identity.',
        });
        return;
      }

      if (normalizedMessage.includes('invalid wallet signature')) {
        setFeedback({
          type: 'error',
          message:
            'The wallet signature could not be verified. Please try again and approve the signature with the connected wallet.',
        });
        return;
      }

      setFeedback({
        type: 'error',
        message,
      });
    } finally {
      setIdentityLinking(false);
    }
  }

  async function handleVote() {
    if (loading) return;

    setFeedback(null);

    if (!publicKey) {
      setFeedback({
        type: 'info',
        message: 'Connect your wallet to participate in the community vote.',
      });
      return;
    }

    if (!signMessage) {
      setFeedback({
        type: 'error',
        message: 'Your connected wallet does not support message signing.',
      });
      return;
    }

    const voterWallet = publicKey.toBase58();
    const ts = Math.floor(Date.now() / 1000);
    const message = buildMessage(mint, voterWallet, ts);

    try {
      setLoading(true);

      /*
       * The signature proves control of the connected wallet.
       * The server independently rebuilds and verifies this message.
       */
      const sigBytes = await signMessage(
        new TextEncoder().encode(message)
      );

      const bs58 = (await import('bs58')).default;
      const signature = bs58.encode(sigBytes);

      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mint,
          voterWallet,
          voteYes: true,
          ts,
          message,
          signature,
        }),
      });

      const json: VoteResponse = await res.json().catch(() => ({
        success: false,
        error: 'vote_response_parse_failed',
      }));

      if (!res.ok || !json.success) {
        if (json.error === 'vote_not_eligible') {
          setFeedback({
            type: 'info',
            message:
              'This asset is no longer in the Community Review Zone.',
          });
          return;
        }

        if (json.error === 'vote_eligibility_unavailable') {
          setFeedback({
            type: 'error',
            message:
              'Vote eligibility could not be verified. Please try again later.',
          });
          return;
        }

        if (json.error === 'holder_check_unavailable') {
          setFeedback({
            type: 'error',
            message:
              'Token ownership could not be verified right now. Please try again later.',
          });
          return;
        }

        if (json.error === 'token_holder_required') {
          setFeedback({
            type: 'info',
            message:
              'The connected wallet must currently hold this asset to participate in the vote.',
          });
          return;
        }

        if (
          json.error === 'identity_required' ||
          json.error === 'identity_not_found' ||
          json.error === 'wallet_not_linked'
        ) {
          setFeedback({
            type: 'info',
            message:
              'A verified Coincarnation identity is required to participate in community voting.',
          });
          return;
        }

        if (json.error === 'Invalid signature') {
          setFeedback({
            type: 'error',
            message: 'The wallet signature could not be verified.',
          });
          return;
        }

        if (json.error === 'Stale timestamp') {
          setFeedback({
            type: 'error',
            message:
              'The voting request expired. Please submit your vote again.',
          });
          return;
        }

        setFeedback({
          type: 'error',
          message: json.error || 'Your vote could not be recorded.',
        });
        return;
      }

      const nextStatus: VoteResponse = {
        ...json,
        alreadyVoted: true,
        myVote: true,
      };

      setStatus(nextStatus);
      onVoted?.(json);

      if (json.blocked) {
        setFeedback({
          type: 'info',
          message: `Your vote was recorded, but this asset is currently locked as ${json.blockedBy ?? 'restricted'
            }.`,
        });
        return;
      }

      if (json.applied) {
        setFeedback({
          type: 'success',
          message:
            'Community threshold reached. This asset is now recognized as a Deadcoin.',
        });
        return;
      }

      setFeedback({
        type: 'success',
        message: 'Your Deadcoin vote has been recorded.',
      });
    } catch (error: any) {
      /*
       * Wallets commonly reject signMessage with provider-specific errors.
       * Do not expose those raw messages directly in the UI.
       */
      const rawMessage =
        typeof error?.message === 'string'
          ? error.message.toLowerCase()
          : '';

      const rejected =
        rawMessage.includes('reject') ||
        rawMessage.includes('cancel') ||
        rawMessage.includes('declin');

      setFeedback({
        type: rejected ? 'info' : 'error',
        message: rejected
          ? 'The wallet signature request was cancelled.'
          : 'Your vote could not be completed. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }

  const alreadyVoted =
    Boolean(status?.alreadyVoted) && status?.myVote === true;

  const votesYes =
    typeof status?.votesYes === 'number' ? status.votesYes : null;

  const threshold =
    typeof status?.threshold === 'number' ? status.threshold : null;

  const thresholdReached =
    status?.applied === true ||
    (votesYes !== null &&
      threshold !== null &&
      threshold > 0 &&
      votesYes >= threshold);

  const identityUnavailable = Boolean(status?.identityError);

  const voteButtonDisabled =
    loading ||
    identityLoading ||
    statusLoading ||
    alreadyVoted ||
    thresholdReached;

  const voteButtonText = loading
    ? 'Waiting for signature…'
    : statusLoading
      ? 'Checking vote status…'
      : thresholdReached
        ? 'Community threshold reached'
        : alreadyVoted
          ? 'Vote recorded'
          : label;

  const identityButtonText = identityLoading
    ? 'Preparing Identity…'
    : identityNeedsCreation
      ? 'Create Identity to Vote'
      : 'Continue with Identity';

  return (
    <div className="w-full">
      {publicKey && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-400">
          <span>
            Voting with {wallet?.adapter?.name ?? 'wallet'}
          </span>

          <span
            className="font-mono text-zinc-500"
            title={publicKey.toBase58()}
          >
            {publicKey.toBase58().slice(0, 6)}…
            {publicKey.toBase58().slice(-4)}
          </span>
        </div>
      )}

      <div className="mb-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center">
        {statusLoading ? (
          <div className="text-xs text-zinc-400">
            Checking community vote…
          </div>
        ) : votesYes !== null && threshold !== null ? (
          <>
            <div className="text-lg font-black tracking-tight text-white">
              {votesYes} / {threshold}
            </div>

            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">
              YES votes
            </div>

            {!thresholdReached && threshold > votesYes && (
              <div className="mt-2 text-[11px] text-zinc-400">
                {threshold - votesYes}{' '}
                {threshold - votesYes === 1 ? 'more vote' : 'more votes'}{' '}
                needed for Community Deadcoin recognition.
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-zinc-400">
            Community vote status will appear here.
          </div>
        )}
      </div>

      {identityUnavailable ? (
        <div className="space-y-3">
          {!identityNeedsCreation ? (
            <>
              <button
                type="button"
                onClick={handleIdentityAccess}
                disabled={identityLoading || statusLoading}
                className={[
                  'inline-flex min-h-[42px] w-full items-center justify-center rounded-xl',
                  'border border-cyan-300/25 bg-cyan-400/[0.10]',
                  'px-4 py-2.5 text-sm font-bold text-cyan-100',
                  'transition-all duration-200',
                  'hover:border-cyan-300/40 hover:bg-cyan-400/[0.16]',
                  'active:scale-[0.98]',
                  'disabled:cursor-not-allowed disabled:opacity-55',
                  className,
                ].join(' ')}
              >
                <span className="mr-1.5" aria-hidden="true">
                  🔐
                </span>

                {identityLoading
                  ? 'Checking Identity…'
                  : 'Continue with Identity'}
              </button>

              <p className="text-[11px] leading-4 text-zinc-400">
                Community voting requires a verified Coincarnation Identity.
                Continue to verify the Identity connected to this wallet.
              </p>
            </>
          ) : identityLinkMode ? (
            <>
              <div className="rounded-xl border border-cyan-400/15 bg-cyan-500/[0.04] p-3">
                <label
                  htmlFor={`identity-link-code-${mint}`}
                  className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/80"
                >
                  Identity Link Code
                </label>

                <input
                  id={`identity-link-code-${mint}`}
                  type="text"
                  value={identityLinkCode}
                  onChange={(event) =>
                    setIdentityLinkCode(event.target.value.toUpperCase())
                  }
                  placeholder="MEGY-12345678"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={identityLinking}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-sm uppercase tracking-wider text-white outline-none transition focus:border-cyan-300/40 focus:ring-1 focus:ring-cyan-300/20 disabled:opacity-60"
                />

                <p className="mt-2 text-[10px] leading-4 text-zinc-500">
                  Generate this code from a wallet already connected to your
                  existing Coincarnation Identity.
                </p>
              </div>

              <button
                type="button"
                onClick={handleLinkExistingIdentityForVote}
                disabled={
                  identityLinking ||
                  !identityLinkCode.trim()
                }
                className={[
                  'inline-flex min-h-[42px] w-full items-center justify-center rounded-xl',
                  'border border-cyan-300/25 bg-cyan-400/[0.10]',
                  'px-4 py-2.5 text-sm font-bold text-cyan-100',
                  'transition-all duration-200',
                  'hover:border-cyan-300/40 hover:bg-cyan-400/[0.16]',
                  'active:scale-[0.98]',
                  'disabled:cursor-not-allowed disabled:opacity-55',
                ].join(' ')}
              >
                <span className="mr-1.5" aria-hidden="true">
                  🔗
                </span>

                {identityLinking
                  ? 'Linking Wallet…'
                  : 'Link Wallet'}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (identityLinking) return;

                  setIdentityLinkMode(false);
                  setIdentityLinkCode('');
                  setFeedback({
                    type: 'info',
                    message:
                      'Choose whether to create a new Identity or link this wallet to an existing one.',
                  });
                }}
                disabled={identityLinking}
                className="w-full px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
                <p className="text-[11px] leading-5 text-zinc-300">
                  This wallet is not connected to a Coincarnation Identity yet.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCreateIdentityForVote}
                disabled={identityLoading}
                className={[
                  'inline-flex min-h-[42px] w-full items-center justify-center rounded-xl',
                  'border border-cyan-300/25 bg-cyan-400/[0.10]',
                  'px-4 py-2.5 text-sm font-bold text-cyan-100',
                  'transition-all duration-200',
                  'hover:border-cyan-300/40 hover:bg-cyan-400/[0.16]',
                  'active:scale-[0.98]',
                  'disabled:cursor-not-allowed disabled:opacity-55',
                  className,
                ].join(' ')}
              >
                <span className="mr-1.5" aria-hidden="true">
                  ✦
                </span>

                {identityLoading
                  ? 'Creating Identity…'
                  : 'Create New Identity'}
              </button>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                  or
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <button
                type="button"
                onClick={() => {
                  setIdentityLinkMode(true);
                  setFeedback({
                    type: 'info',
                    message:
                      'Enter a Link Code generated from your existing Coincarnation Identity.',
                  });
                }}
                disabled={identityLoading}
                className={[
                  'inline-flex min-h-[42px] w-full items-center justify-center rounded-xl',
                  'border border-white/10 bg-white/[0.035]',
                  'px-4 py-2.5 text-sm font-semibold text-zinc-200',
                  'transition-all duration-200',
                  'hover:border-cyan-300/25 hover:bg-white/[0.06] hover:text-white',
                  'active:scale-[0.98]',
                  'disabled:cursor-not-allowed disabled:opacity-55',
                ].join(' ')}
              >
                <span className="mr-1.5" aria-hidden="true">
                  🔗
                </span>

                Link Existing Identity
              </button>

              <p className="text-[10px] leading-4 text-zinc-500">
                Already have a Coincarnation Identity? Link this wallet instead
                of creating another one.
              </p>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleVote}
          disabled={voteButtonDisabled}
          className={[
            'inline-flex min-h-[42px] items-center justify-center rounded-xl',
            'border border-amber-300/25 bg-amber-400/[0.10]',
            'px-4 py-2.5 text-sm font-bold text-amber-100',
            'transition-all duration-200',
            'hover:border-amber-300/40 hover:bg-amber-400/[0.16]',
            'active:scale-[0.98]',
            'disabled:cursor-not-allowed disabled:opacity-55',
            className,
          ].join(' ')}
        >
          {alreadyVoted || thresholdReached ? (
            <span className="mr-1.5" aria-hidden="true">
              ✓
            </span>
          ) : (
            <span className="mr-1.5" aria-hidden="true">
              🗳️
            </span>
          )}

          {voteButtonText}
        </button>
      )}

      {!publicKey && (
        <p className="mt-2 text-[11px] leading-4 text-zinc-400">
          Connect your wallet to participate in the Community Deadcoin vote.
        </p>
      )}

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={[
            'mt-3 rounded-xl border px-3 py-2 text-[11px] leading-5',
            feedback.type === 'success'
              ? 'border-emerald-400/20 bg-emerald-500/[0.07] text-emerald-200'
              : feedback.type === 'error'
                ? 'border-rose-400/20 bg-rose-500/[0.07] text-rose-200'
                : 'border-cyan-400/20 bg-cyan-500/[0.06] text-cyan-100',
          ].join(' ')}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}