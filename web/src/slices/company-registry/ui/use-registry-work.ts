import { useCallback, useState } from "react";
import { type Ask, useAsk } from "@/shared/lib/ask/use-ask.tsx";
import { useFlyerGeneration } from "@/shared/lib/company-registry/flyer-generation-port.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useAdvisorsDraft } from "../model/advisors-draft.ts";
import { useCompanyEditor } from "../model/company-editor.ts";

const LEAVE_EDITOR = "¿Salir del editor de empresas?\n\nLos cambios sin guardar se pierden.";
const LEAVE_ADVISORS = "Tenés cambios sin guardar en tus asesores.\n\nSi salís ahora se pierden.";

/**
 * What is being done on Mis empresas and Mis asesores, wherever they are shown (Base de datos, or
 * Data of the panel), and the question before leaving it: `_bdLeaveOk`.
 */
export function useRegistryWork() {
  const { show } = useToast();
  const generation = useFlyerGeneration();
  const [editor, dispatchEditor] = useCompanyEditor();
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [draft, dispatchDraft] = useAdvisorsDraft();
  const { ask, question } = useAsk();

  /** Asks about what would be lost, and goes on to what the person wanted once they accept. */
  const leave = useCallback(
    (then: () => void) => {
      if (generation?.isGenerating()) {
        show("Esperá a que termine de generar los flyers");
        return;
      }
      const askAboutAdvisors = () => {
        if (!draft.dirty) {
          then();
          return;
        }
        ask({
          message: LEAVE_ADVISORS,
          confirmLabel: "Salir sin guardar",
          cancelLabel: "Seguir editando",
          onYes: () => {
            dispatchDraft({ type: "forget" });
            then();
          },
        });
      };
      if (!editor.rows?.length) {
        if (editor.rows) dispatchEditor({ type: "close" });
        askAboutAdvisors();
        return;
      }
      ask({
        message: LEAVE_EDITOR,
        confirmLabel: "Salir sin guardar",
        cancelLabel: "Seguir editando",
        onYes: () => {
          dispatchEditor({ type: "close" });
          askAboutAdvisors();
        },
      });
    },
    [ask, dispatchDraft, dispatchEditor, draft.dirty, editor.rows, generation, show],
  );

  return {
    editor,
    dispatchEditor,
    generatorOpen,
    setGeneratorOpen,
    draft,
    dispatchDraft,
    ask: ask satisfies Ask,
    question,
    leave,
  };
}

export type RegistryWork = ReturnType<typeof useRegistryWork>;
