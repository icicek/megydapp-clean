import { NextResponse } from 'next/server';
import { assertAllowedRedirect } from '@/app/api/_lib/url';

// GET /api/wallet/connect/phantom?redirect_link=...&app_url=...&dapp_encryption_public_key=...&state=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const redirect = searchParams.get('redirect_link');
  const appUrl   = searchParams.get('app_url') || 'https://coincarnation.com';
  const dappPub  = searchParams.get('dapp_encryption_public_key'); // base58/hex ok
  const state    = searchParams.get('state') || ''; // optional but recommended

  try {
    if (redirect) assertAllowedRedirect(redirect);
    if (appUrl)   assertAllowedRedirect(appUrl);
    if (!dappPub) throw new Error('missing dapp_encryption_public_key');

    const ul = new URL('https://phantom.app/ul/v1/connect');
    ul.searchParams.set('app_url', appUrl);
    ul.searchParams.set('redirect_link', redirect || appUrl);
    ul.searchParams.set('dapp_encryption_public_key', dappPub);
    if (state) ul.searchParams.set('state', state);
    // ul.searchParams.set('cluster', 'mainnet-beta'); // optional

    return NextResponse.json({ ok: true, url: ul.toString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'bad_request' }, { status: 400 });
  }
}
