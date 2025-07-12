export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { generateReferralCode } from '@/app/api/utils/generateReferralCode';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
  console.log('✅ /api/coincarnation/record API called');

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
      referral_code,
    } = body;

    const timestamp = new Date().toISOString();
    console.log('📦 Incoming data:', body);

    // 🚨 1. USD değeri kontrolü
    if (usd_value === 0 && token_symbol?.toUpperCase() === 'SOL') {
      console.error('❌ FATAL: SOL token reported with 0 USD value. Rejecting.');
      return NextResponse.json(
        { success: false, error: 'SOL cannot have zero USD value. Try again later.' },
        { status: 400 }
      );
    }

    // 💀 2. Deadcoin kontrolü
    const isDeadcoin = usd_value === 0;

    const existing = await sql`
      SELECT * FROM participants WHERE wallet_address = ${wallet_address}
    `;

    let userReferralCode: string;
    let referrerWallet: string | null = null;

    if (existing.length === 0) {
      userReferralCode = generateReferralCode();

      if (referral_code) {
        const ref = await sql`
          SELECT wallet_address FROM participants WHERE referral_code = ${referral_code}
        `;
        if (ref.length > 0 && ref[0].wallet_address !== wallet_address) {
          referrerWallet = ref[0].wallet_address;
          console.log('🔁 referrerWallet matched:', referrerWallet);
        } else {
          console.log('⚠️ referral_code invalid or self-referencing');
        }
      }

      await sql`
        INSERT INTO participants (wallet_address, referral_code, referrer_wallet)
        VALUES (${wallet_address}, ${userReferralCode}, ${referrerWallet})
      `;
    } else {
      userReferralCode = existing[0].referral_code;

      if (!userReferralCode) {
        userReferralCode = generateReferralCode();
        await sql`
          UPDATE participants
          SET referral_code = ${userReferralCode}
          WHERE wallet_address = ${wallet_address}
        `;
      }
    }

    console.log('📤 Contribution insert payload:', {
      wallet_address,
      token_symbol,
      token_contract,
      network,
      token_amount,
      usd_value,
      transaction_signature,
      user_agent,
      timestamp,
      referral_code: userReferralCode,
      referrer_wallet: referrerWallet,
      is_deadcoin: isDeadcoin,
    });

    try {
      const insertResult = await sql`
        INSERT INTO contributions (
          wallet_address,
          token_symbol,
          token_contract,
          network,
          token_amount,
          usd_value,
          transaction_signature,
          user_agent,
          timestamp,
          referral_code,
          referrer_wallet
        ) VALUES (
          ${wallet_address},
          ${token_symbol},
          ${token_contract},
          ${network},
          ${token_amount},
          ${usd_value},
          ${transaction_signature},
          ${user_agent},
          ${timestamp},
          ${userReferralCode},
          ${referrerWallet}
        ) RETURNING *;
      `;
      console.log('✅ INSERT result (with RETURNING):', insertResult);
    } catch (insertError: any) {
      console.error('❌ Contribution INSERT failed:', insertError);
    }

    const result = await sql`
      SELECT id FROM participants WHERE wallet_address = ${wallet_address}
    `;
    const number = result[0]?.id ?? 0;

    return NextResponse.json({
      success: true,
      number,
      referral_code: userReferralCode,
      message: '✅ Coincarnation recorded successfully',
      is_deadcoin: isDeadcoin,
    });
  } catch (error: any) {
    console.error('❌ Record API Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Unknown server error' },
      { status: 500 }
    );
  }
}
