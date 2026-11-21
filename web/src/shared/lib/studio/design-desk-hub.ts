// The one that answers Estudio. It knows of the editor when the editor is on the page; if it is not,
// it asks for it and waits.
import type { DesignDeskWorks } from "./design-desk.ts";

const WAITING_FOR_THE_EDITOR_MS = 30_000;

export interface DesignDeskHub extends DesignDeskWorks {
  readonly attach: (works: DesignDeskWorks) => () => void;
}

export interface DesignDeskHubOptions {
  /** Estudio can be open while the editor has never been on the page. */
  readonly openEditor: () => void;
  readonly onEditorNotThere: () => void;
  readonly waitMs?: number;
}

export function createDesignDeskHub({
  openEditor,
  onEditorNotThere,
  waitMs = WAITING_FOR_THE_EDITOR_MS,
}: DesignDeskHubOptions): DesignDeskHub {
  let works: DesignDeskWorks | null = null;
  let onArrival: (() => void) | null = null;

  const editor = (): Promise<DesignDeskWorks | null> => {
    if (works) return Promise.resolve(works);
    openEditor();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        onArrival = null;
        onEditorNotThere();
        resolve(null);
      }, waitMs);
      onArrival = () => {
        clearTimeout(timer);
        onArrival = null;
        resolve(works);
      };
    });
  };

  return {
    openDesign: async (load) => {
      await (await editor())?.openDesign(load);
    },
    closeDesign: (id) => {
      works?.closeDesign(id);
    },
    applySavedSet: async (id) => {
      await (await editor())?.applySavedSet(id);
    },
    showFlyer: async (option) => {
      await (await editor())?.showFlyer(option);
    },
    attach: (next) => {
      works = next;
      onArrival?.();
      return () => {
        if (works === next) works = null;
      };
    },
  };
}
