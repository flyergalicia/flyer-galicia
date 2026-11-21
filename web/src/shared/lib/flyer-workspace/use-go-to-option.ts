// To a flyer before doing something with it (`_fgWithOpt`). If another one is chosen while it loads,
// it goes back to it: otherwise a batch or a download would come out on the picture of the other one.
import { useCallback } from "react";
import { optionLabel, optionNumber } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "../app-config/flyer-options-query.ts";
import { useToast } from "../toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import type { LoadedOption } from "./option-loader.ts";
import { useFlyerWorkspace } from "./workspace-context.ts";

const ROUNDS_TO_CATCH_UP = 3;

const ALWAYS = () => true;

/** `mayLeave`: whoever has something open on the flyer on screen can hold it there. */
export function useGoToOption(
  choose: (option: number) => Promise<LoadedOption>,
  mayLeave: (option: number) => boolean = ALWAYS,
) {
  const workspace = useFlyerWorkspace();
  const { show } = useToast();
  const { can } = usePermissions();
  const { options } = useFlyerOptions();
  return useCallback(
    async (raw: number) => {
      const option = optionNumber(options, raw);
      const onScreen = () => workspace.getState().slot.option;
      const catchUp = async (rounds: number): Promise<void> => {
        if (rounds === 0 || option === onScreen()) return;
        if (mayLeave(option)) await choose(option);
        await catchUp(rounds - 1);
      };
      if (can(`opcion_${option}`) && option !== onScreen()) {
        show(`Cambiando a ${optionLabel(options, option)}...`);
        await catchUp(ROUNDS_TO_CATCH_UP);
      } else if (workspace.getState().slot.loading) await choose(option);
    },
    [can, choose, mayLeave, options, show, workspace],
  );
}
