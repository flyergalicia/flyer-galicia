import { type ReactNode, useState } from "react";
import { useToast } from "../toast/toast-context.ts";
import { DesignDeskAttachContext, DesignDeskContext } from "./design-desk.ts";
import { createDesignDeskHub } from "./design-desk-hub.ts";

const EDITOR_NOT_THERE = "No se pudo abrir el armador. Revisá la conexión y probá de nuevo.";

interface DesignDeskHostProps {
  /** Says that the editor has to be on the page, even if its tab is not the one chosen. */
  readonly onNeedEditor: () => void;
  /** For a test: how long it waits for it. */
  readonly waitMs?: number;
  readonly children: ReactNode;
}

export function DesignDeskHost({ onNeedEditor, waitMs, children }: DesignDeskHostProps) {
  const { show } = useToast();
  const [hub] = useState(() =>
    createDesignDeskHub({
      openEditor: onNeedEditor,
      onEditorNotThere: () => {
        show(EDITOR_NOT_THERE);
      },
      ...(waitMs === undefined ? {} : { waitMs }),
    }),
  );
  return (
    <DesignDeskContext.Provider value={hub}>
      <DesignDeskAttachContext.Provider value={hub.attach}>
        {children}
      </DesignDeskAttachContext.Provider>
    </DesignDeskContext.Provider>
  );
}
