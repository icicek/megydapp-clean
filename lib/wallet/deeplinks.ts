// lib/wallet/deeplinks.ts
export const phantomBrowseLink = (url: string) =>
    `https://phantom.app/ul/v1/browse?url=${encodeURIComponent(url)}`;
  
  export const solflareBrowseLink = (url: string) =>
    `https://solflare.com/ul/v1/browse?url=${encodeURIComponent(url)}`;
  
  export const backpackBrowseLink = (url: string) =>
    `https://backpack.app/ul/v1/browse?url=${encodeURIComponent(url)}`;
  
  // (İleride) direct connect builder (opsiyonel)
  // export const phantomConnectLink = (appUrl, redirect, dappPublicKey) => `https://phantom.app/ul/v1/connect?...`
  