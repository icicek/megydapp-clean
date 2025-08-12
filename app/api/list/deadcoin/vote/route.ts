import { NextResponse } from 'next/server';

// Geçici in-memory veri (deployment sonrası resetlenir, DB eklenmeli)
let deadcoinVotes: Record<string, { yes: number; no: number }> = {};
let DeadcoinList = new Set<string>();

export async function POST(req: Request) {
  try {
    const { mint, vote } = await req.json();

    if (!mint || !['yes', 'no'].includes(vote)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    // Oyları takip et
    if (!deadcoinVotes[mint]) {
      deadcoinVotes[mint] = { yes: 0, no: 0 };
    }

    if (vote === 'yes') {
      deadcoinVotes[mint].yes += 1;
    } else {
      deadcoinVotes[mint].no += 1;
    }

    // Eğer 3 veya daha fazla "yes" varsa Deadcoin listesine ekle
    if (deadcoinVotes[mint].yes >= 3) {
      DeadcoinList.add(mint);
    }

    return NextResponse.json({
      mint,
      votes: deadcoinVotes[mint],
      isDeadcoin: DeadcoinList.has(mint),
    });
  } catch (err) {
    console.error('❌ Error recording deadcoin vote:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
