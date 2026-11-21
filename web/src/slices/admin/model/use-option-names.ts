// How Config → Flyer names each option: its name, its color, its tab and the name of the tab.
import { useMemo } from "react";
import {
  type FlyerTab,
  optionColor,
  optionLabel,
  optionTab,
} from "@/shared/domain/flyer-options.ts";
import { titleOf } from "@/shared/domain/screen-titles.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useScreenTitles } from "@/shared/lib/app-config/screen-titles-query.ts";

export interface OptionNames {
  readonly label: (option: number) => string;
  readonly color: (option: number) => string;
  readonly tab: (option: number) => FlyerTab;
  readonly tabLabel: (tab: FlyerTab) => string;
}

export function useOptionNames(): OptionNames {
  const { options } = useFlyerOptions();
  const { titles } = useScreenTitles();
  return useMemo(
    () => ({
      label: (option) => optionLabel(options, option),
      color: (option) => optionColor(options, option),
      tab: (option) => optionTab(options, option),
      tabLabel: (tab) => titleOf(titles, tab),
    }),
    [options, titles],
  );
}
