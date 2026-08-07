// app/api/_lib/db.ts

import { neon } from '@neondatabase/serverless';

import {
  getDatabaseUrl,
} from '@/app/api/_lib/database-url';

export const sql =
  neon(
    getDatabaseUrl()
  );