export function isValuableAsset(usdPrice: number, threshold = 0.01): boolean {
    return usdPrice >= threshold;
  }
  
  export function isStablecoin(usdPrice: number): boolean {
    return usdPrice >= 0.99 && usdPrice <= 1.01;
  }
  