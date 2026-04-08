// app/api/_lib/db.ts
import { neon } from '@neondatabase/serverless';

const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error('Missing env: NEON_DATABASE_URL or DATABASE_URL');
}

export const sql = neon(url);