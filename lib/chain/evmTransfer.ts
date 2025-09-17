// lib/chain/evmTransfer.ts
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseUnits,
  type Chain as ViemChain,
  // type Hex  <-- BUNU SİL
} from 'viem';
import { erc20Abi } from 'viem';
import { mainnet, bsc, polygon, base } from 'viem/chains';
import type { Chain } from '@/lib/chain/types';

// Yerel Hex tipi (viem ile aynı literal format)
type Hex = `0x${string}`;

function chainToViem(chain: Chain): ViemChain {
  switch (chain) {
    case 'ethereum':
      return mainnet;
    case 'bsc':
      return bsc;
    case 'polygon':
      return polygon;
    case 'base':
      return base;
    default:
      throw new Error(`Chain ${chain} is not an EVM network`);
  }
}

function rpcUrlFor(chain: Chain): string | undefined {
  switch (chain) {
    case 'ethereum':
      return process.env.NEXT_PUBLIC_ETH_RPC;
    case 'bsc':
      return process.env.NEXT_PUBLIC_BSC_RPC;
    case 'polygon':
      return process.env.NEXT_PUBLIC_POLYGON_RPC;
    case 'base':
      return process.env.NEXT_PUBLIC_BASE_RPC;
    default:
      return undefined;
  }
}

function getWalletClient(chain: Chain) {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No EVM provider detected');
  }
  const viemChain = chainToViem(chain);
  return createWalletClient({
    chain: viemChain,
    transport: custom((window as any).ethereum),
  });
}

function getPublicClient(chain: Chain) {
  const viemChain = chainToViem(chain);
  const rpc = rpcUrlFor(chain);
  return createPublicClient({
    chain: viemChain,
    transport: rpc ? http(rpc) : http(),
  });
}

/** Send the native coin (ETH/BNB/MATIC/BASE) */
export async function sendNative(
  {
    to,
    amount,
    decimals,
    chain,
  }: {
    to: `0x${string}`;
    amount: number | string; // human-readable
    decimals: number; // usually 18
    chain: Chain;
  }
): Promise<Hex> {
  const wallet = getWalletClient(chain);
  // requestAddresses: wallet'ın adres iznini ister (connect)
  const [account] = await wallet.requestAddresses();
  const value = parseUnits(amount.toString(), decimals);

  const hash = await wallet.sendTransaction({
    to,
    account,
    value,
  });

  // İstersen receipt bekle:
  // const pub = getPublicClient(chain);
  // await pub.waitForTransactionReceipt({ hash });

  return hash;
}

/** Send ERC-20 tokens via transfer(to, amount) */
export async function sendErc20(
  {
    token,
    to,
    amount,
    decimals,
    chain,
  }: {
    token: `0x${string}`; // ERC-20 contract address
    to: `0x${string}`;
    amount: number | string; // human-readable
    decimals: number;
    chain: Chain;
  }
): Promise<Hex> {
  const wallet = getWalletClient(chain);
  const [account] = await wallet.requestAddresses();
  const value = parseUnits(amount.toString(), decimals);

  const hash = await wallet.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, value],
    account,
  });

  // const pub = getPublicClient(chain);
  // await pub.waitForTransactionReceipt({ hash });

  return hash;
}
