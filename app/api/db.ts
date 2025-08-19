// app/api/db.ts
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);
export default sql;
