// What the flyer bar writes: the favorite goes in the account of the person, and the names and the
// order of the flyers, in the list everybody reads (shared/lib/app-config: Estudio writes it too).
import type { Backend } from "@/shared/supabase/index.ts";

export { type ListEntry, saveFlyerList } from "@/shared/lib/app-config/flyer-list-store.ts";

/** It says whether it was saved. */
export async function saveFavorites(
  db: Backend["db"],
  personId: string,
  favorites: readonly number[],
): Promise<boolean> {
  const { error } = await db
    .from("profiles")
    .update({ flyer_fav: [...favorites] })
    .eq("id", personId);
  return !error;
}
