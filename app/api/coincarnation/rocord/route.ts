// ✅ File: app/api/coincarnation/record/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
    try {
      const body = await req.json();
      const {
        wallet_address,
        token_symbol,
        token_contract,
        token_amount,
        usd_value,
        transaction_signature,
        network,
        user_agent,
      } = body;
  
      const timestamp = new Date().toISOString();
  
      // 1. KATILIMCIYI INSERT ET (varsa yoksa)
      await sql`
        INSERT INTO participants (wallet_address)
        VALUES (${wallet_address})
        ON CONFLICT (wallet_address) DO NOTHING;
      `;
  
      // 2. KATKILARI INSERT ET
      await sql`
        INSERT INTO contributions (
          wallet_address,
          token_symbol,
          token_contract,
          network,
          token_amount,
          usd_value,
          transaction_signiture,
          user_agent,
          timestamp
        ) VALUES (
          ${wallet_address},
          ${token_symbol},
          ${token_contract},
          ${network},
          ${token_amount},
          ${usd_value},
          ${transaction_signature},
          ${user_agent},
          ${timestamp}
        );
      `;
  
      // 3. KATILIMCI NUMARASINI DÖN
      const result = await sql`
        SELECT id FROM participants WHERE wallet_address = ${wallet_address}
      `;
      const number = result[0]?.id ?? 0;
  
      return NextResponse.json({ number });
    } catch (error) {
      console.error('Record API Error:', error);
      return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
  }
  