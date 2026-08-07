// app/api/_lib/database-url.ts

/**
 * Returns the canonical server-side database connection URL.
 *
 * DATABASE_URL is the only supported database environment
 * variable in production and local development.
 */
export function getDatabaseUrl(): string {
    const databaseUrl =
      process.env.DATABASE_URL?.trim();
  
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL_MISSING'
      );
    }
  
    return databaseUrl;
}