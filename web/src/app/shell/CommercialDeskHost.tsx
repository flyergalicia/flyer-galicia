// Who answers "Registrar gestión" of the screen of the Hunter: its window comes with the code of
// Gestiones, when it is asked for, and whatever it opens after that goes to the tab.
import { type ComponentType, type ReactNode, useCallback, useState } from "react";
import {
  CommercialDeskContext,
  createCommercialDesk,
  type RegisterableCompany,
} from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import type { RegisterActionWindowProps } from "@/slices/commercial-actions/index.ts";
import { loadRegisterWindow } from "../registry/views.ts";

const COULD_NOT_LOAD = "No se pudo cargar Gestiones. Revisá la conexión e intentá de nuevo.";

interface OpenWindow {
  readonly company: RegisterableCompany;
  readonly Window: ComponentType<RegisterActionWindowProps>;
}

export function CommercialDeskHost({
  goTo,
  children,
}: {
  readonly goTo: (tabId: string) => void;
  readonly children: ReactNode;
}) {
  const { show } = useToast();
  const [open, setOpen] = useState<OpenWindow | null>(null);
  const [desk] = useState(() =>
    createCommercialDesk({
      goTo,
      onRegister: (company) => {
        loadRegisterWindow().then(
          (Window) => {
            setOpen({ company, Window });
          },
          () => {
            show(COULD_NOT_LOAD);
          },
        );
      },
    }),
  );
  const close = useCallback(() => {
    setOpen(null);
  }, []);
  return (
    <CommercialDeskContext.Provider value={desk}>
      {children}
      {open && (
        <open.Window
          company={open.company}
          onClose={close}
          onOpenAction={(id, complete) => {
            desk.openAction({ id, complete });
          }}
        />
      )}
    </CommercialDeskContext.Provider>
  );
}
