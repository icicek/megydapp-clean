export const ERC20_ABI = [
    { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
    { type: 'function', name: 'symbol',   stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
    { type: 'function', name: 'name',     stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
    { type: 'function', name: 'balanceOf',stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  ] as const;
  