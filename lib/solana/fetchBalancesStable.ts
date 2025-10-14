// lib/solana/fetchBalancesStable.ts
import { Connection, PublicKey } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

export type TokenBalance = {
  mint: string;
  amountRaw: string;          // u64 as string
  decimals: number;
  uiAmountString: string;     // safe for UI
  tokenAccount: string;
  programId: 'token' | 'token2022';
};

type Result = {
  balances: TokenBalance[];
  nativeSolLamports: number;
};

export async function fetchBalancesStable(
  connection: Connection,
  owner: PublicKey,
): Promise<Result> {
  const [solLamports, classic, v2022] = await Promise.all([
    connection.getBalance(owner, 'confirmed').catch(() => 0),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }).catch(() => ({ value: [] as any[] })),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }).catch(() => ({ value: [] as any[] })),
  ]);

  const parse = (accs: any[], program: 'token' | 'token2022'): TokenBalance[] => {
    const out: TokenBalance[] = [];
    for (const { pubkey, account } of accs) {
      try {
        const info = account?.data?.parsed?.info;
        const mint = info?.mint as string;
        const amount = info?.tokenAmount;
        const uiAmountString: string | undefined = amount?.uiAmountString ?? amount?.uiAmount?.toString?.();
        const decimals: number | undefined = amount?.decimals;
        if (!mint || !amount?.amount || decimals == null || !uiAmountString) continue;

        out.push({
          mint,
          amountRaw: String(amount.amount),
          decimals,
          uiAmountString: String(uiAmountString),
          tokenAccount: String(pubkey),
          programId: program,
        });
      } catch {
        // skip this account
      }
    }
    return out;
  };

  const list = [...parse(classic.value, 'token'), ...parse(v2022.value, 'token2022')];

  return {
    balances: list,
    nativeSolLamports: solLamports,
  };
}
