import { useCallback, useRef } from "react";
import type { LibraryLoader } from "./library-loader.ts";
import { SHEET_LIBRARY, type SheetApi } from "./sheet-library.ts";
import { useToast } from "./toast/toast-context.ts";

const PREPARING = "Preparando el Excel…";
const COULD_NOT_PREPARE = "No se pudo preparar el Excel. Revisá la conexión y probá de nuevo.";
const SOMETHING_WENT_WRONG = "Algo salió mal. Probá de nuevo.";

/**
 * For a button that needs the library: while it comes down, a second press does not ask for it
 * again. Returns whether the work could run, for whoever has something to put back.
 */
export function useSheetLibrary(library: LibraryLoader<SheetApi> = SHEET_LIBRARY) {
  const { show } = useToast();
  const waiting = useRef(false);
  const bring = useCallback(async (): Promise<SheetApi | null> => {
    if (!library.isReady()) show(PREPARING);
    waiting.current = true;
    try {
      return await library.load();
    } catch {
      show(COULD_NOT_PREPARE);
      return null;
    } finally {
      waiting.current = false;
    }
  }, [library, show]);
  return useCallback(
    async (work: (api: SheetApi) => void | Promise<void>): Promise<boolean> => {
      if (waiting.current) return false;
      const api = await bring();
      if (!api) return false;
      try {
        await work(api);
        return true;
      } catch {
        show(SOMETHING_WENT_WRONG);
        return false;
      }
    },
    [bring, show],
  );
}
