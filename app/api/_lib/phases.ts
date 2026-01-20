// app/api/_lib/phases.ts
import { sql } from '@/app/api/_lib/db';

export async function getLatestFinalizedPhaseId(): Promise<number | null> {
  const rows = await sql`
    SELECT id
    FROM phases
    WHERE snapshot_taken_at IS NOT NULL
      AND LOWER(COALESCE(status_v2, '')) = 'finalized'
    ORDER BY snapshot_taken_at DESC
    LIMIT 1
  `;
  const phase = (rows as any[])[0];
  return phase?.id ? Number(phase.id) : null;
}
