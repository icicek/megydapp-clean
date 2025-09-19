// Minimal, safe defaults (you can extend later)
// Addresses are canonical wrapped/native stables on each chain.
export type ListedToken = {
    address: `0x${string}`;
    symbol: string;
    name: string;
    decimals: number;
  };
  
  export const NATIVE_BY_CHAIN: Record<number, { symbol: string; name: string }> = {
    1:   { symbol: 'ETH',  name: 'Ether' },
    56:  { symbol: 'BNB',  name: 'BNB' },
    137: { symbol: 'MATIC',name: 'Matic' },
    8453:{ symbol: 'ETH',  name: 'Ether' },
    42161:{ symbol: 'ETH', name: 'Ether' },
  };
  
  export const TOKEN_LIST: Record<number, ListedToken[]> = {
    // Ethereum
    1: [
      { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
      { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin',   decimals: 6 },
      { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
      { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI',  name: 'Dai Stablecoin', decimals: 18 },
      { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
    ],
    // BSC
    56: [
      { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether USD', decimals: 18 },
      { address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', symbol: 'USDC', name: 'USD Coin',   decimals: 18 },
      { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', symbol: 'ETH',  name: 'Ethereum (BSC)', decimals: 18 },
      { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB', name: 'Wrapped BNB', decimals: 18 },
    ],
    // Polygon
    137: [
      { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', symbol: 'USDC', name: 'USD Coin (PoS)', decimals: 6 },
      { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', name: 'Tether USD (PoS)', decimals: 6 },
      { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
      { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', symbol: 'WMATIC', name: 'Wrapped MATIC', decimals: 18 },
    ],
    // Base
    8453: [
      { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    ],
    // Arbitrum
    42161: [
      { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
      { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    ],
  };
  