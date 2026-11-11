// "Aplicar": it reads what the set holds and looks for where each thing goes. For Estudio too.
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { failureText, readSavedSetContent } from "../api/saved-sets.ts";
import { useLogoEditorActions } from "./editor-context.ts";

const SEARCHING = "Buscando dónde va cada cosa…";

export function useApplySet() {
  const editor = useLogoEditorActions();
  const backend = useBackend();
  const toast = useToast();
  return async (id: string) => {
    const art = editor.currentArt();
    if (!art) {
      toast.show("Abrí primero el flyer donde querés aplicarlas.");
      return;
    }
    editor.closeSavedSets();
    if (editor.getState().placement) editor.placement.finish(true);
    toast.show(SEARCHING);
    try {
      const { name, data } = await readSavedSetContent(backend, id);
      toast.hide(SEARCHING);
      if (editor.currentArt() !== art) return;
      if (!data) {
        toast.show("Esa combinación está vacía.");
        return;
      }
      await editor.placement.apply(id, name, data);
    } catch (cause) {
      toast.hide(SEARCHING);
      toast.show(`No se pudo leer la combinación: ${failureText(cause)}`);
    }
  };
}
