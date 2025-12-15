// app/api/_lib/classification-cache.ts
import { invalidateTokenThresholdsCache } from '@/app/api/_lib/token-thresholds';

/**
 * Central cache invalidation for token classification-related caches.
 * Best-effort in serverless. Safe to call often.
 */

export function invalidateClassificationCaches(opts: { thresholds?: boolean } = {}) {
  if (opts.thresholds !== false) {
    invalidateTokenThresholdsCache();
  }

  // Future:
  // - invalidate in-memory classify results cache
  // - invalidate /api/status cache if you have one
  // Keep this file as the single "invalidate entrypoint".
}
