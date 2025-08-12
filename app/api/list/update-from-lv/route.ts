import { NextResponse } from 'next/server';
import {
  addWalkingDead,
  removeWalkingDead,
  suggestDeadcoin,
  getStatus,
} from '../_store';

export async function POST(req: Request) {
  try {
    const { mint, volume, liquidity, category } = await req.json();

    if (!mint || !category) {
      return NextResponse.json({ error: 'mint and category are required' }, { status: 400 });
    }

    // Blacklist/Redlist’i bu endpoint yönetmez — manuel süreç.
    // Sağlıklı → walking_dead’ten çıkar
    if (category === 'healthy') {
      removeWalkingDead(mint);
    }

    // Walking dead → listeye ekle
    if (category === 'walking_dead') {
      addWalkingDead(mint);
    }

    // L/V “deadcoin” → direkt deadcoin yapmıyoruz; önce öneri (oy lazım)
    if (category === 'deadcoin') {
      suggestDeadcoin(mint);
    }

    return NextResponse.json({
      ok: true,
      currentStatus: getStatus(mint),
      received: { mint, volume, liquidity, category },
    });
  } catch (e) {
    console.error('❌ update-from-lv error:', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
