/**
 * Supabase generated types.
 *
 * PLACEHOLDER — the database schema is designed and migrated in Phase 1
 * (CLAUDE.md §13). Until then there are no tables, so this file declares the
 * shape Supabase's generator produces for an empty `public` schema. That keeps
 * the Supabase clients generically typed today without pretending tables exist.
 *
 * From Phase 1 onward this file is REGENERATED, never hand-edited:
 *   npm run db:types
 * (i.e. `supabase gen types typescript --linked > src/shared/types/database.ts`)
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
