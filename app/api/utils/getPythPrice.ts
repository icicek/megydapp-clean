import pythMapping from './pythMapping.json';

export async function getPythPrice(mint: string): Promise<number | null> {
  const feedId = (pythMapping as Record<string, string>)[mint];
  if (!feedId) {
    console.info(`ℹ️ No Pyth price feed mapped for token mint: ${mint}. Skipping Pyth.`);
    return null;
  }

  try {
    const res = await fetch(`https://hermes.pyth.network/v2/price_feed_ids/${feedId}`);
    if (!res.ok) {
      console.error(`❌ Pyth API returned status ${res.status} for mint: ${mint}`);
      return null;
    }

    const data = await res.json();
    const price = data?.price?.price;

    if (price) {
      console.log(`✅ Pyth price for mint ${mint}: ${price}`);
      return price;
    } else {
      console.warn(`⚠️ No price found in Pyth data for mint: ${mint}`);
      return null;
    }
  } catch (e) {
    console.error('❌ Error fetching Pyth price:', e);
    return null;
  }
}
