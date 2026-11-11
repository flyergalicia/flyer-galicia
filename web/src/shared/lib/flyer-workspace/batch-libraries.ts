// What a batch needs before it starts: the libraries of the PDF and of the ZIP. While they come down
// the batch already counts as running, so nothing can take its rows away.
import { useCallback } from "react";
import { bringBatchLibraries } from "@/shared/flyer-engine/index.ts";
import { createLibraryLoader, type LibraryLoader } from "../library-loader.ts";
import { useToast } from "../toast/toast-context.ts";

const PREPARING = "Preparando el ZIP…";
const COULD_NOT_PREPARE = "No se pudo preparar el ZIP. Revisá la conexión y probá de nuevo.";

export const BATCH_LIBRARIES: LibraryLoader<unknown> = createLibraryLoader(bringBatchLibraries);

/** It says whether they are here, and if they are not, whoever asked has nothing else to do. */
export function useBatchLibraries(library: LibraryLoader<unknown> = BATCH_LIBRARIES) {
  const { show } = useToast();
  return useCallback(async (): Promise<boolean> => {
    if (!library.isReady()) show(PREPARING);
    try {
      await library.load();
      return true;
    } catch {
      show(COULD_NOT_PREPARE);
      return false;
    }
  }, [library, show]);
}
