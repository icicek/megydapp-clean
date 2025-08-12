import { saveTokenToList } from './saveTokenToList';

// Simülasyon olarak hacim ve likidite verilerini API’den alıyoruz.
// Burada Raydium, Jupiter veya CMC API’lerini kullanabilirsin.
async function fetchLiquidityAndVolume(mintAddress: string) {
  try {
    const response = await fetch(
      `/api/proxy/liquidity-volume?mint=${mintAddress}`,
      { cache: 'no-store' }
    );
    if (!response.ok) throw new Error('Failed to fetch liquidity/volume');
    const data = await response.json();

    return {
      liquidity: data.liquidity ?? 0,
      volume24h: data.volume24h ?? 0,
    };
  } catch (err) {
    console.error(`Liquidity/Volume fetch error for ${mintAddress}:`, err);
    return { liquidity: 0, volume24h: 0 };
  }
}

// Ana kontrol fonksiyonu (arka planda çalışacak)
export async function checkTokenLiquidityAndVolume(
  mintAddress: string
): Promise<void> {
  const { liquidity, volume24h } = await fetchLiquidityAndVolume(mintAddress);

  // Eşik değerler (daha sonra ayarlanabilir)
  const minLiquidity = 5000; // USD
  const minVolume24h = 1000; // USD

  if (liquidity < minLiquidity) {
    console.log(
      `[Liquidity Check] Token ${mintAddress} düşük likidite listesine ekleniyor...`
    );
    await saveTokenToList(mintAddress, 'lowLiquidity');
  }

  if (volume24h < minVolume24h) {
    console.log(
      `[Volume Check] Token ${mintAddress} düşük hacim listesine ekleniyor...`
    );
    await saveTokenToList(mintAddress, 'lowVolume');
  }
}
