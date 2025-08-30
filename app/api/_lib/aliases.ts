// app/api/_lib/aliases.ts
import { sql } from '@/app/api/_lib/db';

export type AliasRow = {
  alias_mint: string;
  canonical_mint: string;
  note: string | null;
  created_at: string;
};

export async function getCanonicalMint(aliasMint: string): Promise<string | null> {
  const rows = (await sql`
    SELECT canonical_mint
    FROM token_aliases
    WHERE alias_mint = ${aliasMint}
    LIMIT 1
  `) as unknown as Array<{ canonical_mint: string }>;
  return rows[0]?.canonical_mint ?? null;
}

export async function listAliases(q = '', limit = 100, offset = 0): Promise<AliasRow[]> {
  const pattern = q ? `%${q}%` : null;
  const rows = (await sql`
    SELECT alias_mint, canonical_mint, note, created_at
    FROM token_aliases
    WHERE (${pattern ?? null}::text IS NULL
           OR alias_mint ILIKE ${pattern}
           OR canonical_mint ILIKE ${pattern})
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `) as unknown as AliasRow[];
  return rows;
}

export async function upsertAlias(
  aliasMint: string,
  canonicalMint: string,
  note?: string | null
): Promise<void> {
  await sql`
    INSERT INTO token_aliases (alias_mint, canonical_mint, note)
    VALUES (${aliasMint}, ${canonicalMint}, ${note ?? null})
    ON CONFLICT (alias_mint) DO UPDATE
      SET canonical_mint = EXCLUDED.canonical_mint,
          note = EXCLUDED.note
  `;
}

export async function deleteAlias(aliasMint: string): Promise<void> {
  await sql`DELETE FROM token_aliases WHERE alias_mint = ${aliasMint}`;
}
