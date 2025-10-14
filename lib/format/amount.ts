// lib/format/amount.ts
export function formatUiAmount(uiAmountString: string, maxFraction = 6) {
    // "0.000000" gibi string'i kısalt
    if (!uiAmountString) return '—';
    const [int, frac = ''] = uiAmountString.split('.');
    if (!frac) return int;
    const trimmed = frac.replace(/0+$/, '');
    const limited = trimmed.slice(0, maxFraction);
    return limited ? `${int}.${limited}` : int;
  }
  