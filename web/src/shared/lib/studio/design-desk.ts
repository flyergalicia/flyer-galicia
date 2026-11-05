// What Estudio asks of the flyer editor, which is another slice: opening a design as a tab, closing it,
// and applying a saved set of brands. The app puts the host around the shell, and the editor, once it
// is on the page, says it is there.
import { createContext, useContext, useEffect } from "react";
import type { Cut, LogoChange } from "@/shared/flyer-engine/index.ts";

/** A design as it comes out of the table. */
export interface StoredDesign {
  readonly id: string;
  readonly name: string;
  readonly company: string;
  readonly option: number;
  readonly mine: boolean;
  readonly status: string;
  /** A copy the administrator sent: it can be used without having its flyer. */
  readonly shared: boolean;
  readonly baseName: string;
  readonly changes: readonly LogoChange[];
  readonly uploads: Readonly<Record<string, string>>;
  readonly cuts: readonly Cut[];
  readonly legal: string | null;
}

export interface DesignDeskWorks {
  /**
   * Opens it as a tab beside its flyer. `load` brings what is saved: if something else is chosen
   * meanwhile, it does not open.
   */
  readonly openDesign: (load: () => Promise<StoredDesign>) => Promise<void>;
  /** A design was deleted: its tab goes away. */
  readonly closeDesign: (id: string) => void;
  /** "Aplicar en el flyer", on the flyer on screen. */
  readonly applySavedSet: (id: string) => Promise<void>;
  /** "Ir al flyer publicado". */
  readonly showFlyer: (option: number) => Promise<void>;
}

export const DesignDeskContext = createContext<DesignDeskWorks | null>(null);

/** Where the editor says it is there; a test of the editor alone has nobody to tell. */
export const DesignDeskAttachContext = createContext<
  ((works: DesignDeskWorks) => () => void) | null
>(null);

export function useDesignDesk(): DesignDeskWorks {
  const desk = useContext(DesignDeskContext);
  if (!desk) throw new Error("useDesignDesk needs a DesignDeskHost above it");
  return desk;
}

export function useAttachDesignDesk(works: DesignDeskWorks): void {
  const attach = useContext(DesignDeskAttachContext);
  useEffect(() => attach?.(works), [attach, works]);
}
