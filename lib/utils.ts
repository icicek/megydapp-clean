// Solana token listesini fetch eden helper
export async function fetchSolanaTokenList() {
  const res = await fetch(
    'https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json'
  );
  const data = await res.json();
  return data.tokens;
}

// className birleştirici
export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ');
}
