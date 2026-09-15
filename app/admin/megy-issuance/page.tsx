//app/admin/megy-issuance/page.tsx

'use client';

import { useCallback, useEffect, useState } from 'react';

const CARD =
  'rounded-2xl border border-white/10 bg-[#0b0f18] p-5 shadow-sm';

type BucketKey =
  | 'coincarnation'
  | 'partnershipsEcosystemGrowth'
  | 'fairFutureFundReserve'
  | 'liquidity'
  | 'teamContributors';

type BucketMintType =
  | 'coincarnation'
  | 'partnerships_ecosystem_growth'
  | 'fair_future_fund_reserve'
  | 'liquidity'
  | 'team_contributors';

type BucketDestination = {
  mintType: BucketMintType;
  label: string;
  destinationWallet: string;
};

type LedgerBucket = {
  mintType: BucketMintType;
  label: string;
  destinationWallet: string;
  authorizedBase: string;
  mintedBase: string;
  remainingBase: string;
};

type IssuanceLedger = {
  issuanceLedgerId: string;
  phaseId: string;
  phaseNo: number | null;
  phaseName: string | null;
  finalizedAt: string | null;
  tokenomicsVersion: string | null;
  issuanceStatus: string | null;

  buckets: Record<BucketKey, LedgerBucket>;

  totals: {
    ecosystemAuthorizedBase: string;
    authorizedBase: string;
    mintedBase: string;
    remainingBase: string;
  };
};

type MintEvent = {
  id: string;
  issuanceLedgerId: string;
  mintType: string;
  amountBase: string;
  mintAddress: string;
  destinationWallet: string;
  txSignature: string;
  network: string | null;
  createdBy: string | null;
  note: string | null;
  createdAt: string | null;
};

type OverviewResponse = {
  success: boolean;

  megy: {
    network: string;
    program: string;
    mintAddress: string;
    decimals: number;
    mintAuthority: string;
    feePayer: {
      wallet: string;
      mode: string;
    };
  };

  operator: {
    adminWallet: string;
  };

  bucketDestinations: Record<
    BucketKey,
    BucketDestination
  >;

  ledgers: IssuanceLedger[];
  recentMintEvents: MintEvent[];

  error?: string;
};

const BUCKET_ORDER: Array<{
  key: BucketKey;
  label: string;
}> = [
  {
    key: 'coincarnation',
    label: 'Coincarnation Rewards',
  },
  {
    key: 'partnershipsEcosystemGrowth',
    label: 'Partnerships & Ecosystem Growth',
  },
  {
    key: 'fairFutureFundReserve',
    label: 'Fair Future Fund Reserve',
  },
  {
    key: 'liquidity',
    label: 'Liquidity',
  },
  {
    key: 'teamContributors',
    label: 'Team & Contributors',
  },
];

function shortAddress(
  value?: string | null
): string {
  const v = String(value ?? '').trim();

  if (!v) return '-';
  if (v.length <= 16) return v;

  return `${v.slice(0, 7)}…${v.slice(-7)}`;
}

function formatDate(
  value?: string | null
): string {
  if (!value) return '-';

  try {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString();
  } catch {
    return String(value);
  }
}

function formatBaseUnits(
  value: unknown,
  decimals = 9
): string {
  const raw = String(value ?? '0').trim();

  if (!/^-?\d+$/.test(raw)) return '-';

  try {
    const negative = raw.startsWith('-');

    const digits = negative
      ? raw.slice(1)
      : raw;

    if (decimals === 0) {
      const formatted =
        BigInt(digits || '0').toLocaleString();

      return negative
        ? `-${formatted}`
        : formatted;
    }

    const padded = digits.padStart(
      decimals + 1,
      '0'
    );

    const whole =
      padded.slice(0, -decimals) || '0';

    const fraction = padded
      .slice(-decimals)
      .replace(/0+$/, '');

    const wholeFormatted =
      BigInt(whole).toLocaleString();

    const result =
      fraction.length > 0
        ? `${wholeFormatted}.${fraction}`
        : wholeFormatted;

    return negative
      ? `-${result}`
      : result;
  } catch {
    return '-';
  }
}

function statusClass(
  status?: string | null
): string {
  const normalized = String(
    status ?? ''
  ).toLowerCase();

  if (
    normalized.includes('ready') ||
    normalized.includes('authorized') ||
    normalized.includes('active')
  ) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }

  if (
    normalized.includes('complete') ||
    normalized.includes('fully')
  ) {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  }

  return 'border-white/10 bg-white/5 text-white/70';
}

async function getOverview(): Promise<OverviewResponse> {
  const response = await fetch(
    '/api/admin/megy-issuance/overview',
    {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'X-Requested-With': 'fetch',
      },
    }
  );

  const json =
    (await response
      .json()
      .catch(() => ({}))) as Partial<OverviewResponse>;

  if (!response.ok) {
    throw new Error(
      json?.error || `HTTP ${response.status}`
    );
  }

  if (!json?.success) {
    throw new Error(
      json?.error || 'OVERVIEW_FAILED'
    );
  }

  return json as OverviewResponse;
}

export default function MegyIssuancePage() {
  const [data, setData] =
    useState<OverviewResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const overview = await getOverview();
      setData(overview);
    } catch (e: any) {
      setData(null);

      setError(
        String(
          e?.message ||
            'Failed to load MEGY issuance overview'
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ledgers = data?.ledgers ?? [];
  const events =
    data?.recentMintEvents ?? [];

  const decimals =
    Number.isInteger(data?.megy?.decimals)
      ? data!.megy.decimals
      : 9;

  return (
    <main className="min-h-screen bg-[#090d15] text-white">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">
                MEGY Issuance
              </h1>

              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-200">
                Mainnet
              </span>

              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60">
                Read-only
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-white/60">
              Production MEGY issuance authorization,
              treasury capacity, and on-chain mint
              history. Phase finalization authorizes
              issuance; it does not mint tokens.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-50"
          >
            {loading
              ? 'Refreshing…'
              : 'Refresh'}
          </button>
        </div>

        <div
          className={`${CARD} border-emerald-500/20 bg-emerald-500/10`}
        >
          <div className="text-sm font-semibold text-emerald-100">
            Production issuance security domain
          </div>

          <div className="mt-1 text-xs leading-5 text-emerald-200/80">
            Issuance is authorized only by
            finalized production phases. The MEGY
            Mint Authority remains offline on Ledger
            and no mint authority secret is stored
            by the backend.
          </div>
        </div>

        {error && (
          <div
            className={`${CARD} border-red-500/20 bg-red-500/10`}
          >
            <div className="text-sm font-semibold text-red-100">
              Failed to load issuance overview
            </div>

            <div className="mt-1 text-xs text-red-200/80">
              {error}
            </div>
          </div>
        )}

        {loading && !data && (
          <div
            className={`${CARD} text-sm text-white/60`}
          >
            Loading MEGY issuance state…
          </div>
        )}

        {data && (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className={CARD}>
                <div className="text-xs font-semibold uppercase tracking-wide text-white/40">
                  MEGY Mainnet Mint
                </div>

                <div
                  className="mt-2 break-all font-mono text-sm text-white"
                  title={data.megy.mintAddress}
                >
                  {data.megy.mintAddress}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-white/40">
                      Program
                    </div>

                    <div className="mt-1 text-white/80">
                      {data.megy.program}
                    </div>
                  </div>

                  <div>
                    <div className="text-white/40">
                      Decimals
                    </div>

                    <div className="mt-1 text-white/80">
                      {data.megy.decimals}
                    </div>
                  </div>

                  <div>
                    <div className="text-white/40">
                      Network
                    </div>

                    <div className="mt-1 text-white/80">
                      {data.megy.network}
                    </div>
                  </div>

                  <div>
                    <div className="text-white/40">
                      Issuance ledgers
                    </div>

                    <div className="mt-1 text-white/80">
                      {ledgers.length.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className={CARD}>
                <div className="text-xs font-semibold uppercase tracking-wide text-white/40">
                  Authority
                </div>

                <div className="mt-3 space-y-4 text-xs">
                  <div>
                    <div className="text-white/40">
                      Mint Authority
                    </div>

                    <div
                      className="mt-1 break-all font-mono text-white/80"
                      title={
                        data.megy.mintAuthority
                      }
                    >
                      {data.megy.mintAuthority}
                    </div>
                  </div>

                  <div>
                    <div className="text-white/40">
                      Fee Payer
                    </div>

                    <div
                      className="mt-1 break-all font-mono text-white/80"
                      title={
                        data.megy.feePayer.wallet
                      }
                    >
                      {data.megy.feePayer.wallet}
                    </div>

                    <div className="mt-1 text-[11px] text-white/40">
                      {data.megy.feePayer.mode}
                    </div>
                  </div>

                  <div>
                    <div className="text-white/40">
                      Authorized Admin Session
                    </div>

                    <div
                      className="mt-1 break-all font-mono text-white/80"
                      title={
                        data.operator.adminWallet
                      }
                    >
                      {data.operator.adminWallet}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-3">
                <h2 className="text-lg font-semibold">
                  Treasury Destinations
                </h2>

                <p className="mt-1 text-xs text-white/50">
                  Fixed server-side destinations.
                  These addresses are not supplied by
                  the client.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {BUCKET_ORDER.map((bucket) => {
                  const info =
                    data.bucketDestinations[
                      bucket.key
                    ];

                  return (
                    <div
                      key={bucket.key}
                      className={CARD}
                    >
                      <div className="text-sm font-semibold text-white">
                        {info.label ||
                          bucket.label}
                      </div>

                      <div className="mt-1 text-[11px] text-white/40">
                        {info.mintType}
                      </div>

                      <div
                        className="mt-3 break-all font-mono text-xs text-white/70"
                        title={
                          info.destinationWallet
                        }
                      >
                        {info.destinationWallet}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="mb-3">
                <h2 className="text-lg font-semibold">
                  Production Issuance Ledgers
                </h2>

                <p className="mt-1 text-xs text-white/50">
                  Authorized capacity originates only
                  from finalized production phases.
                </p>
              </div>

              {ledgers.length === 0 ? (
                <div
                  className={`${CARD} border-sky-500/20 bg-sky-500/5`}
                >
                  <div className="text-sm font-semibold text-sky-100">
                    No production issuance authorized
                    yet
                  </div>

                  <div className="mt-1 max-w-2xl text-xs leading-5 text-sky-200/70">
                    No finalized production phase has
                    created a MEGY issuance ledger.
                    This is the expected state before
                    FIRST LIGHT. No mint action is
                    available.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {ledgers.map((ledger) => (
                    <div
                      key={
                        ledger.issuanceLedgerId
                      }
                      className={CARD}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-semibold">
                            Phase #
                            {ledger.phaseNo ?? '-'}
                            {ledger.phaseName
                              ? ` — ${ledger.phaseName}`
                              : ''}
                          </div>

                          <div className="mt-1 text-xs text-white/45">
                            Ledger{' '}
                            {
                              ledger.issuanceLedgerId
                            }{' '}
                            • Phase ID{' '}
                            {ledger.phaseId}
                          </div>

                          <div className="mt-1 text-[11px] text-white/40">
                            Finalized:{' '}
                            {formatDate(
                              ledger.finalizedAt
                            )}
                            {ledger.tokenomicsVersion
                              ? ` • Tokenomics ${ledger.tokenomicsVersion}`
                              : ''}
                          </div>
                        </div>

                        <span
                          className={[
                            'w-fit rounded-md border px-2 py-1 text-xs font-semibold',
                            statusClass(
                              ledger.issuanceStatus
                            ),
                          ].join(' ')}
                        >
                          {ledger.issuanceStatus ||
                            'authorized'}
                        </span>
                      </div>

                      <div className="mt-5 overflow-x-auto">
                        <table className="min-w-[760px] w-full text-xs">
                          <thead className="text-white/40">
                            <tr>
                              <th className="pb-2 text-left font-medium">
                                Bucket
                              </th>

                              <th className="pb-2 text-right font-medium">
                                Authorized
                              </th>

                              <th className="pb-2 text-right font-medium">
                                Minted
                              </th>

                              <th className="pb-2 text-right font-medium">
                                Remaining
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {BUCKET_ORDER.map(
                              (bucket) => {
                                const values =
                                  ledger.buckets[
                                    bucket.key
                                  ];

                                return (
                                  <tr
                                    key={
                                      bucket.key
                                    }
                                    className="border-t border-white/10"
                                  >
                                    <td className="py-3 pr-4 text-white/75">
                                      {
                                        values.label
                                      }
                                    </td>

                                    <td className="px-4 py-3 text-right font-mono text-white/70">
                                      {formatBaseUnits(
                                        values.authorizedBase,
                                        decimals
                                      )}
                                    </td>

                                    <td className="px-4 py-3 text-right font-mono text-white/70">
                                      {formatBaseUnits(
                                        values.mintedBase,
                                        decimals
                                      )}
                                    </td>

                                    <td className="py-3 pl-4 text-right font-mono font-semibold text-emerald-200">
                                      {formatBaseUnits(
                                        values.remainingBase,
                                        decimals
                                      )}
                                    </td>
                                  </tr>
                                );
                              }
                            )}
                          </tbody>

                          <tfoot className="border-t border-white/20">
                            <tr>
                              <td className="pt-3 pr-4 font-semibold text-white">
                                Total
                              </td>

                              <td className="px-4 pt-3 text-right font-mono font-semibold text-white">
                                {formatBaseUnits(
                                  ledger.totals
                                    .authorizedBase,
                                  decimals
                                )}
                              </td>

                              <td className="px-4 pt-3 text-right font-mono font-semibold text-white">
                                {formatBaseUnits(
                                  ledger.totals
                                    .mintedBase,
                                  decimals
                                )}
                              </td>

                              <td className="pt-3 pl-4 text-right font-mono font-semibold text-emerald-200">
                                {formatBaseUnits(
                                  ledger.totals
                                    .remainingBase,
                                  decimals
                                )}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-3">
                <h2 className="text-lg font-semibold">
                  Recent Mint Events
                </h2>

                <p className="mt-1 text-xs text-white/50">
                  Append-only issuance audit history.
                </p>
              </div>

              {events.length === 0 ? (
                <div
                  className={`${CARD} text-sm text-white/55`}
                >
                  No MEGY issuance events recorded
                  yet.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f18]">
                  <div className="overflow-x-auto">
                    <table className="min-w-[980px] w-full text-xs">
                      <thead className="bg-white/5 text-white/50">
                        <tr>
                          <th className="px-4 py-3 text-left">
                            Date
                          </th>

                          <th className="px-4 py-3 text-left">
                            Type
                          </th>

                          <th className="px-4 py-3 text-right">
                            Amount
                          </th>

                          <th className="px-4 py-3 text-left">
                            Destination
                          </th>

                          <th className="px-4 py-3 text-left">
                            Transaction
                          </th>

                          <th className="px-4 py-3 text-left">
                            Admin
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {events.map((event) => (
                          <tr
                            key={event.id}
                            className="border-t border-white/10"
                          >
                            <td className="px-4 py-3 text-white/60">
                              {formatDate(
                                event.createdAt
                              )}
                            </td>

                            <td className="px-4 py-3 text-white/75">
                              {event.mintType}
                            </td>

                            <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-200">
                              {formatBaseUnits(
                                event.amountBase,
                                decimals
                              )}
                            </td>

                            <td
                              className="px-4 py-3 font-mono text-white/60"
                              title={
                                event.destinationWallet
                              }
                            >
                              {shortAddress(
                                event.destinationWallet
                              )}
                            </td>

                            <td
                              className="px-4 py-3 font-mono text-white/60"
                              title={
                                event.txSignature
                              }
                            >
                              {shortAddress(
                                event.txSignature
                              )}
                            </td>

                            <td
                              className="px-4 py-3 font-mono text-white/60"
                              title={
                                event.createdBy ?? undefined
                              }
                            >
                              {shortAddress(
                                event.createdBy
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}