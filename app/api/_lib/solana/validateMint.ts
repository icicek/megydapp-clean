import { PublicKey, Connection } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

function getRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    process.env.ALCHEMY_SOLANA_RPC ||
    'https://api.mainnet-beta.solana.com'
  );
}

let cachedConnection: Connection | null = null;

function getConnection(): Connection {
  if (!cachedConnection) {
    cachedConnection = new Connection(getRpcUrl(), 'confirmed');
  }
  return cachedConnection;
}

export async function validateMintAddress(mint: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  let pubkey: PublicKey;

  try {
    pubkey = new PublicKey(mint);
  } catch {
    return { ok: false, error: 'Invalid public key format' };
  }

  try {
    const connection = getConnection();
    const info = await connection.getAccountInfo(pubkey, 'confirmed');

    if (!info) {
      return { ok: false, error: 'Mint account not found on-chain' };
    }

    const owner = info.owner.toBase58();

    const isTokenProgram =
      owner === TOKEN_PROGRAM_ID.toBase58() ||
      owner === TOKEN_2022_PROGRAM_ID.toBase58();

    if (!isTokenProgram) {
      return { ok: false, error: 'Address exists but is not a token mint account' };
    }

    return { ok: true };
  } catch (e: any) {
    return {
      ok: false,
      error: String(e?.message || e || 'Mint validation failed'),
    };
  }
}