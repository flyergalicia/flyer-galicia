import { useMemo } from "react";
import type { DestinationRules } from "@/shared/domain/company-registry/index.ts";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useDestinationRules } from "@/slices/company-registry/index.ts";

/**
 * Which flyer each company comes out in, knowing what this editor knows: the options it opened, and
 * what the check found out about the others. The automatic choice never sends anybody to an option
 * known to have no flyer.
 */
export function useFlyerRules(): DestinationRules {
  const rules = useDestinationRules();
  const workspace = useFlyerWorkspace();
  return useMemo(
    () => ({
      ...rules,
      hasFlyer: (option) => workspace.hasFlyer(option) ?? rules.hasFlyer(option),
    }),
    [rules, workspace],
  );
}
