import { Address, Chain, Hex, parseUnits } from 'viem';
import { ERC20_ABI } from '@/lib/evm/erc20';

type BaseCtx = {
  chain: Chain;
  account: Address;
  walletClient: any; // viem WalletClient
  publicClient: any; // viem PublicClient
};

export async function sendNativeTransfer(
  ctx: BaseCtx & { to: Address; amount: string } // amount in ETH (human)
): Promise<{ hash: Hex }> {
  const value = parseUnits(ctx.amount, 18);
  const hash = await ctx.walletClient.sendTransaction({
    account: ctx.account,
    chain: ctx.chain,
    to: ctx.to,
    value,
  });
  return { hash };
}

export async function sendErc20Transfer(
  ctx: BaseCtx & { token: Address; to: Address; amount: string; decimals: number }
): Promise<{ hash: Hex }> {
  const value = parseUnits(ctx.amount, ctx.decimals);

  // simulate first (gas safety + revert reason)
  await ctx.publicClient.simulateContract({
    account: ctx.account,
    chain: ctx.chain,
    address: ctx.token,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [ctx.to, value],
  });

  const hash = await ctx.walletClient.writeContract({
    account: ctx.account,
    chain: ctx.chain,
    address: ctx.token,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [ctx.to, value],
  });

  return { hash };
}
