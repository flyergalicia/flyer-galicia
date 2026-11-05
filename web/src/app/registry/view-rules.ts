import { type FlyerOption, optionsOfTab } from "@/shared/domain/flyer-options.ts";
import type { PermissionKey } from "@/shared/session/index.ts";

/** What decides which screens somebody has. It can change while they are inside. */
export interface ViewRules {
  readonly can: (key: PermissionKey) => boolean;
  readonly isHunter: boolean;
  readonly isLeader: boolean;
  readonly commercialActionsOn: boolean;
  readonly flyerOptions: readonly FlyerOption[];
  /** The administrator shared a design with this person: that alone brings Estudio. */
  readonly hasSharedDesign: boolean;
}

export interface MenuRules extends ViewRules {
  readonly isAdminNow: boolean;
  /** How many things a source of notices says are waiting. */
  readonly waiting: (source: string) => number;
}

/** The tabs of the flyer editor that are not the main one exist if an option of them is on. */
export function hasOptionOfTab(tab: "rubros" | "sueldo", rules: ViewRules): boolean {
  return optionsOfTab(rules.flyerOptions, tab).some((option) => rules.can(`opcion_${option}`));
}

/** Who has no flyer editor: they find a company and download it, or look at their team. */
export function buildsFlyers({ isHunter, isLeader }: ViewRules): boolean {
  return !isHunter && !isLeader;
}
