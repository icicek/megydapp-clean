// lib/share/textBuilders.ts
export function buildCoincarneText(params: {
    symbol: string;
    amount?: number | string;
    participantNumber?: number;
  }) {
    const { symbol, amount, participantNumber } = params;
    const amt = amount ? String(amount) : '';
    const num = typeof participantNumber === 'number' ? ` #${participantNumber}` : '';
    const base = amt
      ? `🚀 I just Coincarne'd ${amt} $${symbol} for $MEGY.`
      : `🚀 I just Coincarne'd my $${symbol} for $MEGY.`;
    return `${base}\n👻 Coincarnator${num}`.trim();
  }
  
  export function buildTxItemText(params: {
    symbol: string;
    amount?: number | string;
    sigShort?: string;
  }) {
    const { symbol, amount, sigShort } = params;
    let line = `🧾 Coincarnation: ${amount ? amount + ' ' : ''}$${symbol}`;
    if (sigShort) line += ` (tx: ${sigShort})`;
    line += `\n⚡️ The crypto resurrection has begun.`;
    return line;
  }
  
  export function buildRankText(params: { rank: number; total?: number }) {
    const { rank, total } = params;
    const of = total ? ` / ${total}` : '';
    return `🏆 I'm ranked #${rank}${of} on the #Coincarnation Leaderboard.`;
  }
  