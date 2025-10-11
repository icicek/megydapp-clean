// app/api/wallet/connect/[provider]/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { assertAllowedRedirect } from '@/app/api/_lib/url';

const PROVIDER_BASE: Record<string, string> = {
  phantom:  'https://phantom.app/ul/v1/connect',
  solflare: 'https://solflare.com/ul/v1/connect',
  backpack: 'https://backpack.app/ul/v1/connect',
};

// Not: 2. param ANY. İçeride daraltıyoruz.
export async function GET(req: NextRequest, context: any) {
  const provider = String(context?.params?.provider || '').toLowerCase();
  const base = PROVIDER_BASE[provider];
  if (!base) {
    return NextResponse.json({ ok: false, error: 'unsupported_provider' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const redirect = searchParams.get('redirect_link');
  const appUrl   = searchParams.get('app_url') || 'https://coincarnation.com';
  const dappPub  = searchParams.get('dapp_encryption_public_key');
  const state    = searchParams.get('state') || '';
  const cluster  = searchParams.get('cluster') || ''; // optional

  try {
    if (redirect) assertAllowedRedirect(redirect);
    if (appUrl)   assertAllowedRedirect(appUrl);
    if (!dappPub) throw new Error('missing dapp_encryption_public_key');

    const ul = new URL(base);
    ul.searchParams.set('app_url', appUrl);
    ul.searchParams.set('redirect_link', redirect || appUrl);
    ul.searchParams.set('dapp_encryption_public_key', dappPub);
    if (state)   ul.searchParams.set('state', state);
    if (cluster) ul.searchParams.set('cluster', cluster);

    return NextResponse.json({ ok: true, url: ul.toString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'bad_request' }, { status: 400 });
  }
}
