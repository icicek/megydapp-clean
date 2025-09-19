export function getDestAddressForChainId(chainId: number): `0x${string}` {
    // Expected envs (frontend-safe since sending from client):
    // NEXT_PUBLIC_DEST_ETH, NEXT_PUBLIC_DEST_BSC, NEXT_PUBLIC_DEST_POLY, NEXT_PUBLIC_DEST_BASE, NEXT_PUBLIC_DEST_ARB
    let addr: string | undefined;
    if (chainId === 1) addr = process.env.NEXT_PUBLIC_DEST_ETH;
    else if (chainId === 56) addr = process.env.NEXT_PUBLIC_DEST_BSC;
    else if (chainId === 137) addr = process.env.NEXT_PUBLIC_DEST_POLY;
    else if (chainId === 8453) addr = process.env.NEXT_PUBLIC_DEST_BASE;
    else if (chainId === 42161) addr = process.env.NEXT_PUBLIC_DEST_ARB;
  
    if (!addr) throw new Error(`Destination address not configured for chainId=${chainId}`);
    if (!addr.startsWith('0x') || addr.length !== 42) throw new Error(`Invalid destination address: ${addr}`);
    return addr as `0x${string}`;
  }
  