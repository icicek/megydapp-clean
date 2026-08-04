// app/api/_lib/solana/serverRpc.ts

import {
    Connection,
    type Commitment,
  } from '@solana/web3.js';
  
  const DEFAULT_COMMITMENT: Commitment = 'confirmed';
  
  function getServerSolanaRpcUrl(): string {
    const rpcUrl =
      process.env.SOLANA_RPC_URL?.trim();
  
    if (!rpcUrl) {
      throw new Error(
        'Missing env: SOLANA_RPC_URL'
      );
    }
  
    return rpcUrl;
  }
  
  let cachedConnection: Connection | null = null;
  
  export function getServerSolanaConnection(): Connection {
    if (!cachedConnection) {
      cachedConnection = new Connection(
        getServerSolanaRpcUrl(),
        DEFAULT_COMMITMENT
      );
    }
  
    return cachedConnection;
  }
  
  export function getServerSolanaRpcUrlForJsonRpc(): string {
    return getServerSolanaRpcUrl();
  }