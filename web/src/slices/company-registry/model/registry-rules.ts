import { useMemo } from "react";
import type { DestinationRules, Options } from "@/shared/domain/company-registry/index.ts";
import { titleOf } from "@/shared/domain/screen-titles.ts";
import { useCashbackConfigs } from "@/shared/lib/app-config/cashback-query.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useScreenTitles } from "@/shared/lib/app-config/screen-titles-query.ts";
import { useFlyerGeneration } from "@/shared/lib/company-registry/flyer-generation-port.ts";
import { usePermissions } from "@/shared/session/index.ts";

export interface RegistryContext {
  readonly options: Options;
  readonly cashbackNames: readonly string[];
}

/** What a company needs from the rest of the app to be read: the flyers and the cashback names. */
export function useRegistryContext(): RegistryContext {
  const { options } = useFlyerOptions();
  const { names } = useCashbackConfigs();
  return useMemo(() => ({ options, cashbackNames: names }), [options, names]);
}

const NOBODY_KNOWS = (): undefined => undefined;

/** Which flyer each company comes out in, for this profile. */
export function useDestinationRules(): DestinationRules {
  const { options, cashbackNames } = useRegistryContext();
  const { titles } = useScreenTitles();
  const { can } = usePermissions();
  const generation = useFlyerGeneration();
  return useMemo(
    () => ({
      options,
      cashbackNames,
      can,
      tabLabel: (tab) => titleOf(titles, tab),
      hasFlyer: generation?.hasFlyer ?? NOBODY_KNOWS,
    }),
    [options, cashbackNames, can, titles, generation],
  );
}
