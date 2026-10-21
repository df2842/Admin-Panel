/**
 * Detects "that table/function doesn't exist yet" errors from PostgREST, so
 * pages can show a setup notice (run the SQL migration) instead of crashing.
 *   42P01     undefined_table (Postgres)
 *   42883     undefined_function (Postgres)
 *   PGRST205  table not found in the schema cache
 *   PGRST202  function not found in the schema cache
 *   PGRST200  relationship not found (an embedded table is missing)
 */
const MISSING_CODES = new Set(["42P01", "42883", "PGRST205", "PGRST202", "PGRST200"]);

export function isMissingSchema(error: { code?: string | null } | null | undefined): boolean {
  return !!error?.code && MISSING_CODES.has(error.code);
}

/** The migration file each feature needs. */
export const MIGRATIONS = {
  week6: "supabase/week6-admin.sql",
  week7: "supabase/week7-domain.sql",
} as const;
