const { Client, neonConfig } = require('@neondatabase/serverless');
const crypto = require('crypto');

neonConfig.webSocketConstructor = require('ws');

const EXPECTED_BRANCH = 'br-ancient-smoke-a45imj2x';

const { processReferralEntitlement } =
  require('./app/api/_lib/referral-entitlements.ts');

const clients = [];
let testIds = [];
let refereeId = null;
let refereeWallet = null;
let setupCommitted = false;
let testPassed = false;
let cleanupPassed = false;

async function connect() {
  const client = new Client(process.env.DATABASE_URL);

  await client.connect();
  clients.push(client);

  const result = await client.query(
    "SELECT current_setting('neon.branch_id', true) AS id"
  );

  if (result.rows[0]?.id !== EXPECTED_BRANCH) {
    throw new Error('YANLIS NEON BRANCH! TEST DURDURULDU.');
  }

  return client;
}

async function runAward(client) {
  await client.query('BEGIN');

  try {
    await client.query("SET LOCAL lock_timeout = '10s'");

    const result = await processReferralEntitlement(
      client,
      refereeId
    );

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function cleanup() {
  if (!setupCommitted || testIds.length !== 2) {
    return;
  }

  const client = await connect();

  await client.query('BEGIN');

  try {
    const awards = await client.query(
      `DELETE FROM referral_identity_awards
       WHERE referred_scope = $1
       RETURNING corepoint_event_id`,
      ['identity:' + refereeId]
    );

    const eventIds = awards.rows
      .map(row => row.corepoint_event_id)
      .filter(id => id != null);

    if (eventIds.length > 0) {
      await client.query(
        `DELETE FROM corepoint_events
         WHERE id = ANY($1::bigint[])`,
        [eventIds]
      );
    }

    await client.query(
      `DELETE FROM referral_entitlements
       WHERE identity_id = $1`,
      [refereeId]
    );

    await client.query(
      `DELETE FROM identities
       WHERE id = ANY($1::uuid[])`,
      [testIds]
    );

    await client.query('COMMIT');

    const result = await client.query(
      `SELECT
        (SELECT COUNT(*)::int FROM identities
         WHERE id = ANY($1::uuid[])) AS identities,
        (SELECT COUNT(*)::int FROM referral_entitlements
         WHERE identity_id = $2) AS entitlements,
        (SELECT COUNT(*)::int FROM referral_identity_awards
         WHERE referred_scope = $3) AS awards,
        (SELECT COUNT(*)::int FROM corepoint_events
         WHERE type = 'referral_signup'
         AND ref_wallet = $4) AS events`,
      [testIds, refereeId, 'identity:' + refereeId, refereeWallet]
    );

    console.log('Temizlik sonucu:', result.rows[0]);

    cleanupPassed = Object.values(result.rows[0])
      .every(value => value === 0);

    if (!cleanupPassed) {
      throw new Error('TEST KAYITLARI TAM TEMIZLENEMEDI');
    }

    console.log('TEST KAYITLARI TEMIZLENDI.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function main() {
  try {
    const setup = await connect();
    const firstClient = await connect();
    const secondClient = await connect();

    console.log('1. Test branch dogrulandi.');

    const suffix = crypto.randomUUID().replace(/-/g, '');
    const referrerWallet = 'ConcurrentReferrer_' + suffix;
    refereeWallet = 'ConcurrentReferee_' + suffix;

    await setup.query('BEGIN');

    try {
      const referrer = await setup.query(
        `INSERT INTO identities (primary_wallet_address)
         VALUES ($1) RETURNING id`,
        [referrerWallet]
      );

      const referee = await setup.query(
        `INSERT INTO identities (primary_wallet_address)
         VALUES ($1) RETURNING id`,
        [refereeWallet]
      );

      testIds = [referrer.rows[0].id, referee.rows[0].id];
      refereeId = testIds[1];

      await setup.query(
        `INSERT INTO identity_wallets
         (identity_id, wallet_address, chain, is_primary)
         VALUES ($1,$2,'solana',true),
                ($3,$4,'solana',true)`,
        [testIds[0], referrerWallet, testIds[1], refereeWallet]
      );

      await setup.query(
        `INSERT INTO referral_entitlements
         (identity_id, referee_wallet, referrer_wallet, referral_code)
         VALUES ($1,$2,$3,'CONCURRENT_TEST')`,
        [refereeId, refereeWallet, referrerWallet]
      );

      await setup.query('COMMIT');
      setupCommitted = true;
    } catch (error) {
      await setup.query('ROLLBACK').catch(() => {});
      throw error;
    }

    console.log('2. Gecici kayitlar olusturuldu.');

    const results = await Promise.allSettled([
      runAward(firstClient),
      runAward(secondClient)
    ]);

    console.log('3. Birinci istek:', results[0]);
    console.log('4. Ikinci istek:', results[1]);

    if (results.some(result => result.status !== 'fulfilled')) {
      throw new Error('ESZAMANLI ISTEKLERDEN BIRI BASARISIZ');
    }

    const values = results.map(result => result.value);

    const amounts = values
      .map(result => result.awarded)
      .sort((a, b) => a - b);

    const verification = await setup.query(
      `SELECT
        (SELECT COUNT(*)::int FROM referral_identity_awards
         WHERE referred_scope = $1) AS awards,
        (SELECT COUNT(*)::int FROM corepoint_events
         WHERE type = 'referral_signup'
         AND ref_wallet = $2) AS events,
        (SELECT COALESCE(SUM(points),0)::int FROM corepoint_events
         WHERE type = 'referral_signup'
         AND ref_wallet = $2) AS points,
        (SELECT status FROM referral_entitlements
         WHERE identity_id = $3) AS status`,
      ['identity:' + refereeId, refereeWallet, refereeId]
    );

    const v = verification.rows[0];
    console.log('5. Veritabani sonucu:', v);

    if (
      amounts[0] !== 0 ||
      amounts[1] !== 1000 ||
      v.awards !== 1 ||
      v.events !== 1 ||
      v.points !== 1000 ||
      v.status !== 'awarded'
    ) {
      throw new Error('ESZAMANLILIK TESTI BASARISIZ');
    }

    testPassed = true;
    console.log('6. ESZAMANLILIK TESTI BASARILI.');
  } catch (error) {
    console.error('TEST HATASI:', error.message);
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      console.error('TEMIZLIK HATASI:', error.message);
      process.exitCode = 1;
    }

    await Promise.all(
      clients.map(client => client.end().catch(() => {}))
    );

    if (testPassed && cleanupPassed) {
      console.log('SONUC: TEST 8 TAMAMEN BASARILI.');
    } else {
      console.log('SONUC: KONTROL GEREKIYOR.');
      process.exitCode = 1;
    }
  }
}

main();
