import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// Örn: sabit admin cüzdan kontrolü (isteğe bağlı daha sonra JWT ile güçlendirebiliriz)
const ADMIN_WALLETS = ['ADMIN_WALLET_1', 'ADMIN_WALLET_2']; // burada gerçek cüzdan adresleri olmalı

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mint, status, redlist_date, admin_wallet } = body;

    if (!mint || !status || !admin_wallet) {
      return NextResponse.json(
        { success: false, error: 'mint, status, and admin_wallet are required.' },
        { status: 400 }
      );
    }

    if (!ADMIN_WALLETS.includes(admin_wallet)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized admin wallet.' },
        { status: 403 }
      );
    }

    if (!['blacklist', 'redlist', 'whitelist', 'deadcoin'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status value.' },
        { status: 400 }
      );
    }

    // Update query
    await sql`
      UPDATE tokens
      SET 
        status = ${status},
        redlist_date = ${status === 'redlist' ? redlist_date : null}
      WHERE mint = ${mint}
    `;

    return NextResponse.json({
      success: true,
      message: `Token ${mint} status updated to ${status}`
    });

  } catch (error) {
    console.error('❌ Admin token status update error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
