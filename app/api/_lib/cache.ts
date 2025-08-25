import NodeCache from 'node-cache';

// optionally override via env
const TTL = parseInt(process.env.STATUS_CACHE_TTL ?? '60', 10);

// Vercel'de dev/hot-reload'da çoklu instance oluşmaması için global singleton
const GLOBAL_KEY = '__coinc_cache__';

declare global {
  // eslint-disable-next-line no-var
  var __coinc_cache__: NodeCache | undefined;
}

export const cache =
  global.__coinc_cache__ ?? (global.__coinc_cache__ = new NodeCache({
    stdTTL: TTL,
    checkperiod: Math.max(10, Math.floor(TTL / 2)),
    useClones: false,
  }));

export const STATUS_TTL = TTL;

export function statusKey(mint: string) {
  return `status:${mint}`;
}
