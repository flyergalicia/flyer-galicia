// To a flyer, unless what is open on Cambiar logos holds it on the one on screen.
import { useCallback } from "react";
import {
  type LoadedOption,
  useGoToOption as useGoToFlyer,
} from "@/shared/lib/flyer-workspace/index.ts";
import { useLogoEditorActions } from "@/slices/logo-editor/index.ts";

export function useGoToOption(choose: (option: number) => Promise<LoadedOption>) {
  const editor = useLogoEditorActions();
  const mayLeave = useCallback((option: number) => editor.works.chooseFlyer(option), [editor]);
  return useGoToFlyer(choose, mayLeave);
}
