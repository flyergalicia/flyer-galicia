// To a flyer before doing something with it (`_fgWithOpt`). If another one is chosen while it loads,
// it goes back to it: otherwise a batch or a download would come out on the picture of the other one.
import { useCallback } from "react";
import { optionLabel, optionNumber } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { type LoadedOption, useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { useLogoEditorActions } from "@/slices/logo-editor/index.ts";

const ROUNDS_TO_CATCH_UP = 3;

export function useGoToOption(choose: (option: number) => Promise<LoadedOption>) {
  const workspace = useFlyerWorkspace();
  const editor = useLogoEditorActions();
  const { show } = useToast();
  const { can } = usePermissions();
  const { options } = useFlyerOptions();
  return useCallback(
    async (raw: number) => {
      const option = optionNumber(options, raw);
      const onScreen = () => workspace.getState().slot.option;
      const catchUp = async (rounds: number): Promise<void> => {
        if (rounds === 0 || option === onScreen()) return;
        if (editor.works.chooseFlyer(option)) await choose(option);
        await catchUp(rounds - 1);
      };
      if (can(`opcion_${option}`) && option !== onScreen()) {
        show(`Cambiando a ${optionLabel(options, option)}...`);
        await catchUp(ROUNDS_TO_CATCH_UP);
      } else if (workspace.getState().slot.loading) await choose(option);
    },
    [can, choose, editor, options, show, workspace],
  );
}
