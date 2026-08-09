//scripts/scripts/test-identity-negative.mjs

/**
 * Production Identity security regression tests.
 *
 * Verifies:
 * 1. sign_in cannot silently create an Identity.
 * 2. signed auth intent cannot be tampered with.
 *
 * IMPORTANT:
 * This script never submits a correctly signed create_identity request,
 * so it does not intentionally create test identities.
 */

import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';

const BASE_URL = 'https://coincarnation.com';

function signMessage(message, keypair) {
  const messageBytes = new TextEncoder().encode(message);

  const signatureBytes = nacl.sign.detached(
    messageBytes,
    keypair.secretKey
  );

  return Buffer.from(signatureBytes).toString('base64');
}

async function requestNonce(walletAddress, intent) {
  const response = await fetch(
    `${BASE_URL}/api/auth/nonce`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress,
        intent,
      }),
    }
  );

  const data = await response.json();

  console.log(
    `Nonce response (${intent}):`,
    response.status,
    data
  );

  if (
    !response.ok ||
    !data?.ok ||
    !data?.nonce ||
    !data?.message
  ) {
    throw new Error(
      `Failed to obtain ${intent} authentication nonce.`
    );
  }

  return data;
}

async function verify({
  walletAddress,
  nonce,
  signature,
  intent,
}) {
  const response = await fetch(
    `${BASE_URL}/api/auth/verify`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress,
        nonce,
        signature,
        intent,
      }),
    }
  );

  const data = await response.json();

  console.log(
    `Verify response (${intent}):`,
    response.status,
    data
  );

  return {
    response,
    data,
  };
}

/* ========================================================= */
/* TEST 1                                                    */
/* Unlinked wallet + valid sign_in signature must NOT        */
/* create a new Identity.                                    */
/* ========================================================= */

console.log('');
console.log(
  '============================================================'
);
console.log(
  'TEST 1 — Unlinked wallet cannot silently create an Identity'
);
console.log(
  '============================================================'
);

{
  const keypair = Keypair.generate();
  const walletAddress =
    keypair.publicKey.toBase58();

  console.log(
    'Temporary test wallet:',
    walletAddress
  );

  const nonceData =
    await requestNonce(
      walletAddress,
      'sign_in'
    );

  const signature =
    signMessage(
      nonceData.message,
      keypair
    );

  const {
    response,
    data,
  } = await verify({
    walletAddress,
    nonce: nonceData.nonce,
    signature,
    intent: 'sign_in',
  });

  if (
    response.status !== 409 ||
    data?.code !== 'WALLET_NOT_LINKED'
  ) {
    console.error('');
    console.error(
      '❌ TEST 1 FAILED'
    );
    console.error(
      'Expected 409 WALLET_NOT_LINKED.'
    );

    process.exit(1);
  }

  console.log('');
  console.log(
    '✅ TEST 1 PASSED'
  );
  console.log(
    'Unlinked wallet + sign_in was rejected.'
  );
  console.log(
    'No Identity was silently created.'
  );
}

/* ========================================================= */
/* TEST 2                                                    */
/* A signature created for sign_in must NOT be reusable      */
/* as create_identity by changing only the request body.     */
/* ========================================================= */

console.log('');
console.log(
  '============================================================'
);
console.log(
  'TEST 2 — Signed auth intent cannot be tampered with'
);
console.log(
  '============================================================'
);

{
  const keypair = Keypair.generate();
  const walletAddress =
    keypair.publicKey.toBase58();

  console.log(
    'Temporary test wallet:',
    walletAddress
  );

  /*
   * Request a challenge specifically for sign_in.
   */
  const nonceData =
    await requestNonce(
      walletAddress,
      'sign_in'
    );

  /*
   * Sign the exact server message:
   *
   * Intent: sign_in
   */
  const signature =
    signMessage(
      nonceData.message,
      keypair
    );

  /*
   * Tamper with the request body.
   *
   * The signature belongs to:
   *   Intent: sign_in
   *
   * but verification claims:
   *   Intent: create_identity
   *
   * The server must reconstruct a different message and reject
   * the signature.
   */
  const {
    response,
    data,
  } = await verify({
    walletAddress,
    nonce: nonceData.nonce,
    signature,
    intent: 'create_identity',
  });

  if (
    response.status !== 401 ||
    data?.error !== 'Invalid wallet signature.'
  ) {
    console.error('');
    console.error(
      '❌ TEST 2 FAILED'
    );
    console.error(
      'Expected 401 Invalid wallet signature.'
    );

    process.exit(1);
  }

  console.log('');
  console.log(
    '✅ TEST 2 PASSED'
  );
  console.log(
    'A sign_in signature could not be reused as create_identity.'
  );
  console.log(
    'The authentication intent is cryptographically bound to the signature.'
  );
}

/* ========================================================= */
/* FINAL                                                     */
/* ========================================================= */

console.log('');
console.log(
  '============================================================'
);
console.log(
  '✅ ALL IDENTITY SECURITY TESTS PASSED'
);
console.log(
  '============================================================'
);
console.log(
  '1. No silent Identity creation from sign_in.'
);
console.log(
  '2. Auth intent tampering is rejected cryptographically.'
);