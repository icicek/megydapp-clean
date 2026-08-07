// app/api/utils/fetchTokenMetadata.ts

function sanitizeSym(
  value: string | null | undefined
) {
  if (!value) {
    return null;
  }

  const normalized =
    value
      .toUpperCase()
      .replace(
        /[^A-Z0-9.$_/-]/g,
        ''
      )
      .slice(0, 16);

  return normalized || null;
}

function getBaseUrl(): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configuredUrl) {
    try {
      return new URL(
        configuredUrl
      ).origin;
    } catch {
      // Fall through to deployment/local fallback.
    }
  }

  const vercelUrl =
    process.env.VERCEL_URL?.trim();

  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return 'http://localhost:3000';
}

export async function fetchTokenMetadata(
  mintAddress: string
): Promise<{
  symbol: string;
  name: string;
  logoURI?: string | null;
} | null> {
  const fallback =
    mintAddress
      .slice(0, 6)
      .toUpperCase();

  try {
    const baseUrl =
      getBaseUrl();

    const response =
      await fetch(
        `${baseUrl}/api/symbol?mint=${encodeURIComponent(
          mintAddress
        )}`,
        {
          cache: 'no-store',
          headers: {
            accept: 'application/json',
          },
        }
      );

    if (!response.ok) {
      return {
        symbol: fallback,
        name: fallback,
        logoURI: null,
      };
    }

    const json =
      await response.json();

    const symbol =
      typeof json?.symbol === 'string' &&
      json.symbol.trim()
        ? sanitizeSym(
            json.symbol.trim()
          ) || fallback
        : fallback;

    const name =
      typeof json?.name === 'string' &&
      json.name.trim()
        ? json.name.trim()
        : symbol;

    const logoURI =
      typeof json?.logoURI === 'string' &&
      json.logoURI.trim()
        ? json.logoURI.trim()
        : null;

    return {
      symbol,
      name,
      logoURI,
    };
  } catch {
    return {
      symbol: fallback,
      name: fallback,
      logoURI: null,
    };
  }
}