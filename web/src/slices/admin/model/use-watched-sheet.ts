// Config → Marcas vigiladas: the lists of `_vigilar.json` against the catalog of promotions, and
// taking one out (in line with Buscar and Estudio, reading the file again first).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { usePromotionCatalog } from "@/shared/lib/promotions/catalog-query.ts";
import { changeWatchedBrands } from "@/shared/lib/promotions/watched-brands-store.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { readWatchedFile, WATCHED_SHEET_KEY } from "../api/config-files.ts";
import { messageOf } from "../api/read-error.ts";
import { type WatchedSection, watchedSections, withoutWatched } from "./watched-sheet.ts";

export interface WatchedSheet {
  /** Null while it is read, or if it could not be. */
  readonly sections: readonly WatchedSection[] | null;
  /** What could not be read: the list, or the catalog that says how each brand stands. */
  readonly failure: { readonly what: string; readonly detail: string } | null;
  readonly retry: () => void;
  readonly remove: (option: string, key: string) => Promise<void>;
}

export function useWatchedSheet(): WatchedSheet {
  const { bucket } = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const catalog = usePromotionCatalog();
  const read = useQuery({
    queryKey: WATCHED_SHEET_KEY,
    queryFn: () => readWatchedFile(bucket),
    staleTime: 0,
  });
  const all = catalog.data?.all;
  const catalogFailure = catalog.isError ? messageOf(catalog.error) : (catalog.data?.failure ?? "");
  const sections = useMemo(
    () => (read.data && all && !catalogFailure ? watchedSections(read.data, all) : null),
    [read.data, all, catalogFailure],
  );

  const failure = read.isError
    ? { what: "No se pudo leer la lista de marcas vigiladas", detail: read.error.message }
    : catalogFailure
      ? { what: "No se pudo leer el catálogo de promociones", detail: catalogFailure }
      : null;

  return {
    sections,
    failure,
    retry: () => {
      if (read.isError) void read.refetch();
      else void catalog.refetch();
    },
    // One after the other, as today: each change reads the file again before writing it.
    remove: async (option, key) => {
      try {
        const saved = await changeWatchedBrands(bucket, (file) =>
          withoutWatched(file, option, key),
        );
        queryClient.setQueryData(WATCHED_SHEET_KEY, saved);
        show("Listo: esa marca ya no se vigila.");
      } catch (cause) {
        show(`No se pudo: ${messageOf(cause)}`);
      }
    },
  };
}
