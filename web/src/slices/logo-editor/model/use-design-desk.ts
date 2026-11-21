// What Estudio can ask of the flyer editor, through the app: see shared/lib/studio/design-desk.ts.
import { useMemo } from "react";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { tabOfOption } from "@/shared/lib/flyer-workspace/index.ts";
import { useAttachDesignDesk } from "@/shared/lib/studio/design-desk.ts";
import { useLatest } from "./use-latest.ts";
import { useLogoEditorActions } from "./editor-context.ts";
import { useApplySet } from "./use-apply-set.ts";

interface DesignWorksOptions {
  /** The screen of a tab: that of its flyer, before opening a design. */
  readonly goToTab: (tabId: string) => void;
  /** A flyer of the bar, chosen as a person chooses it. */
  readonly chooseFlyer: (option: number) => void;
}

export function useAttachDesignWorks({ goToTab, chooseFlyer }: DesignWorksOptions): void {
  const editor = useLogoEditorActions();
  const { options } = useFlyerOptions();
  const applySet = useLatest(useApplySet());
  const latest = useLatest({ options, goToTab, chooseFlyer });
  const onScreen = useLatest(editor.workspaceOption).current;
  const works = useMemo(
    () => ({
      openDesign: (load: Parameters<typeof editor.works.openDesign>[0]) =>
        editor.works.openDesign(load, (option) => {
          latest.current.goToTab(tabOfOption(latest.current.options, option));
        }),
      closeDesign: editor.works.closeDesign,
      applySavedSet: (id: string) => {
        latest.current.goToTab(tabOfOption(latest.current.options, onScreen()));
        return applySet.current(id);
      },
      showFlyer: async (option: number) => {
        latest.current.goToTab(tabOfOption(latest.current.options, option));
        latest.current.chooseFlyer(option);
      },
    }),
    [applySet, editor, latest, onScreen],
  );
  useAttachDesignDesk(works);
}
