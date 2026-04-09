// app/api/utils/fetchTokenMetadata.ts
export async function fetchTokenMetadata(
  mintAddress: string
): Promise<{ symbol: string; name: string; logoURI?: string | null } | null> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const r = await fetch(
      `${baseUrl}/api/symbol?mint=${encodeURIComponent(mintAddress)}`,
      {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      }
    );

    if (!r.ok) {
      return {
        symbol: mintAddress.slice(0, 6).toUpperCase(),
        name: mintAddress.slice(0, 6).toUpperCase(),
        logoURI: null,
      };
    }

    const j = await r.json();

    const symbol =
      typeof j?.symbol === 'string' && j.symbol.trim()
        ? j.symbol.trim()
        : mintAddress.slice(0, 6).toUpperCase();

    const name =
      typeof j?.name === 'string' && j.name.trim()
        ? j.name.trim()
        : symbol;

    const logoURI =
      typeof j?.logoURI === 'string' && j.logoURI.trim()
        ? j.logoURI.trim()
        : null;

    return { symbol, name, logoURI };
  } catch {
    return {
      symbol: mintAddress.slice(0, 6).toUpperCase(),
      name: mintAddress.slice(0, 6).toUpperCase(),
      logoURI: null,
    };
  }
}