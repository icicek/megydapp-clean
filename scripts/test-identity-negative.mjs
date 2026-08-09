import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';

const BASE_URL = 'https://coincarnation.com';

/*
 * Generate a completely fresh local wallet.
 *
 * This private key is never printed, stored or sent anywhere.
 * The wallet does not need SOL because this test performs
 * message signing only — no blockchain transaction occurs.
 */
const keypair = Keypair.generate();
const walletAddress = keypair.publicKey.toBase58();

console.log('Temporary test wallet:', walletAddress);

/* --------------------------------------------------------- */
/* 1. Request a SIGN_IN nonce                                */
/* --------------------------------------------------------- */

const nonceResponse = await fetch(
  `${BASE_URL}/api/auth/nonce`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      walletAddress,
      intent: 'sign_in',
    }),
  }
);

const nonceData = await nonceResponse.json();

console.log(
  'Nonce response:',
  nonceResponse.status,
  nonceData
);

if (
  !nonceResponse.ok ||
  !nonceData?.ok ||
  !nonceData?.nonce ||
  !nonceData?.message
) {
  throw new Error(
    'Failed to obtain authentication nonce.'
  );
}

/* --------------------------------------------------------- */
/* 2. Sign exactly the message returned by the server        */
/* --------------------------------------------------------- */

const messageBytes = new TextEncoder().encode(
  nonceData.message
);

const signatureBytes = nacl.sign.detached(
  messageBytes,
  keypair.secretKey
);

const signatureBase64 =
  Buffer.from(signatureBytes).toString('base64');

/* --------------------------------------------------------- */
/* 3. Attempt SIGN_IN with an unlinked wallet                */
/* --------------------------------------------------------- */

const verifyResponse = await fetch(
  `${BASE_URL}/api/auth/verify`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      walletAddress,
      nonce: nonceData.nonce,
      signature: signatureBase64,
      intent: 'sign_in',
    }),
  }
);

const verifyData = await verifyResponse.json();

console.log(
  'Verify response:',
  verifyResponse.status,
  verifyData
);

/* --------------------------------------------------------- */
/* 4. Assert the production guard                            */
/* --------------------------------------------------------- */

if (
  verifyResponse.status !== 409 ||
  verifyData?.code !== 'WALLET_NOT_LINKED'
) {
  console.error(
    '❌ SECURITY TEST FAILED'
  );

  process.exit(1);
}

console.log('');
console.log(
  '✅ SECURITY TEST PASSED'
);
console.log(
  'Unlinked wallet + sign_in was rejected with WALLET_NOT_LINKED.'
);
console.log(
  'No Identity was silently created.'
);