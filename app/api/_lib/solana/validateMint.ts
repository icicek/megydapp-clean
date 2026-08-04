// app/api/_lib/solana/validateMint.ts

import { PublicKey } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

import {
  getServerSolanaConnection,
} from '@/app/api/_lib/solana/serverRpc';

export async function validateMintAddress(
  mint: string
): Promise<{
  ok: boolean;
  error?: string;
}> {
  let publicKey: PublicKey;

  try {
    publicKey = new PublicKey(mint);
  } catch {
    return {
      ok: false,
      error: 'Invalid public key format',
    };
  }

  try {
    const connection =
      getServerSolanaConnection();

    const accountInfo =
      await connection.getAccountInfo(
        publicKey,
        'confirmed'
      );

    if (!accountInfo) {
      return {
        ok: false,
        error: 'Mint account not found on-chain',
      };
    }

    const owner =
      accountInfo.owner.toBase58();

    const isTokenProgram =
      owner === TOKEN_PROGRAM_ID.toBase58() ||
      owner === TOKEN_2022_PROGRAM_ID.toBase58();

    if (!isTokenProgram) {
      return {
        ok: false,
        error:
          'Address exists but is not a token mint account',
      };
    }

    return {
      ok: true,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Mint validation failed',
    };
  }
}