import { neon } from '@neondatabase/serverless';

// ✅ ENV üzerinden Neon bağlantısı
const sql = neon(process.env.DATABASE_URL!);

// Vote kaydı
export async function recordVote(mint: string, voterWallet: string, voteYes: boolean) {
  // Oy tablosu yoksa oluştur
  await sql`
    CREATE TABLE IF NOT EXISTS deadcoin_votes (
      id SERIAL PRIMARY KEY,
      mint TEXT NOT NULL,
      voter_wallet TEXT NOT NULL,
      vote BOOLEAN NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (mint, voter_wallet)
    )
  `;

  // Oy ekle veya güncelle
  await sql`
    INSERT INTO deadcoin_votes (mint, voter_wallet, vote)
    VALUES (${mint}, ${voterWallet}, ${voteYes})
    ON CONFLICT (mint, voter_wallet)
    DO UPDATE SET vote = EXCLUDED.vote
  `;

  // Oyları say
  const voteCount = await sql`
    SELECT 
      SUM(CASE WHEN vote = true THEN 1 ELSE 0 END) AS yes,
      SUM(CASE WHEN vote = false THEN 1 ELSE 0 END) AS no
    FROM deadcoin_votes
    WHERE mint = ${mint}
  `;

  const yes = parseInt(voteCount[0].yes || '0', 10);
  const no = parseInt(voteCount[0].no || '0', 10);

  // 3+ YES ise deadcoin listesine ekle
  let promoted = false;
  if (yes >= 3) {
    await promoteToDeadcoin(mint);
    promoted = true;
  }

  return { yes, no, promoted };
}

// Deadcoin durumunu getir
export async function getDeadcoinStatus(mint: string) {
  const result = await sql`
    SELECT is_deadcoin FROM deadcoin_list WHERE mint = ${mint}
  `;
  return result.length > 0 ? { isDeadcoin: result[0].is_deadcoin } : { isDeadcoin: false };
}

// LV üzerinden güncelle
export async function updateFromLv(mint: string, isDeadcoin: boolean) {
  await sql`
    CREATE TABLE IF NOT EXISTS deadcoin_list (
      mint TEXT PRIMARY KEY,
      is_deadcoin BOOLEAN DEFAULT false,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    INSERT INTO deadcoin_list (mint, is_deadcoin)
    VALUES (${mint}, ${isDeadcoin})
    ON CONFLICT (mint)
    DO UPDATE SET is_deadcoin = EXCLUDED.is_deadcoin, updated_at = NOW()
  `;

  return { mint, isDeadcoin };
}

// Deadcoin listesine terfi ettirme
export async function promoteToDeadcoin(mint: string) {
  await updateFromLv(mint, true);
}
