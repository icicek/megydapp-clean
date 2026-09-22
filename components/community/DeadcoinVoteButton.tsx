// components/community/DeadcoinVoteButton.tsx

'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

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
          message: `Your vote was recorded, but this asset is currently locked as ${
            json.blockedBy ?? 'restricted'
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

  const buttonDisabled =
    loading ||
    statusLoading ||
    alreadyVoted ||
    thresholdReached ||
    identityUnavailable;

  const buttonText = loading
    ? 'Waiting for signature…'
    : statusLoading
      ? 'Checking vote status…'
      : thresholdReached
        ? 'Community threshold reached'
        : alreadyVoted
          ? 'Vote recorded'
          : label;

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

      <button
        type="button"
        onClick={handleVote}
        disabled={buttonDisabled}
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

        {buttonText}
      </button>

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