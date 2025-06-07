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

    // 🔍 1. Bu cüzdan daha önce kayıtlı mı?
    const existing = await sql`
      SELECT * FROM participants WHERE wallet_address = ${wallet_address}
    `;

    let userReferralCode: string;
    let referrerWallet: string | null = null;

    if (existing.length === 0) {
      // ✅ Yeni kullanıcıya benzersiz bir referral_code üret
      userReferralCode = generateReferralCode();

      // Eğer referral_code ile gelen biri varsa, onun wallet adresini bul
      if (referral_code) {
        const ref = await sql`
          SELECT wallet_address FROM participants WHERE referral_code = ${referral_code}
        `;
        referrerWallet = ref[0]?.wallet_address || null;
      }

      // ➕ Yeni kullanıcıyı kaydet
      await sql`
        INSERT INTO participants (wallet_address, referral_code)
        VALUES (${wallet_address}, ${userReferralCode})
      `;
    } else {
      // ✅ Daha önce kayıtlı ise onun referral_code bilgisini al
      userReferralCode = existing[0].referral_code;
    }

    // ➕ Katkıyı kaydet
    await sql`
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
      );
    `;

    // 🎯 Katılımcı numarasını al
    const result = await sql`
      SELECT id FROM participants WHERE wallet_address = ${wallet_address}
    `;
    const number = result[0]?.id ?? 0;

    return NextResponse.json({
      success: true,
      number,
      referral_code: userReferralCode,
      message: '✅ Coincarnation recorded successfully',
    });
  } catch (error: any) {
    console.error('❌ Record API Error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Unknown server error' },
      { status: 500 }
    );
  }
}
