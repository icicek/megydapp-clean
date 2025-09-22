// /lib/evm/providers.ts
export type EvmBrand = 'metamask' | 'rabby' | 'trust' | 'walletconnect' | 'injected';

function allInjected(): any[] {
  const w = window as any;
  if (!w?.ethereum) return [];
  const arr = Array.isArray(w.ethereum.providers) ? w.ethereum.providers : [w.ethereum];
  return arr.filter(Boolean);
}

export function pickInjectedProvider(brand: EvmBrand = 'injected'): any | null {
  const arr = allInjected();
  if (!arr.length) return null;

  const by = (pred: (p: any) => boolean) => arr.find((p) => {
    try { return !!pred(p); } catch { return false; }
  });

  switch (brand) {
    case 'metamask':
      // Brave Wallet bazen isMetaMask= true → filtrele
      return by((p) => p.isMetaMask && !p.isBraveWallet) || by((p) => p.isMetaMask) || arr[0];
    case 'rabby':
      return by((p) => p.isRabby) || arr[0];
    case 'trust':
      return by((p) => p.isTrust || p.isTrustWallet) || arr[0];
    case 'walletconnect':
      // Burada gerçek WalletConnect modal akışı farklı; injected yoksa arr[0]
      return arr[0];
    default:
      return arr[0];
  }
}

export function overrideGlobalEthereum(provider: any) {
  const w = window as any;
  if (!provider) return;
  if (!w.__ethereumOriginal) w.__ethereumOriginal = w.ethereum;
  w.ethereum = provider;
}

export function restoreGlobalEthereum() {
  const w = window as any;
  if (w.__ethereumOriginal) {
    w.ethereum = w.__ethereumOriginal;
    delete w.__ethereumOriginal;
  }
}
