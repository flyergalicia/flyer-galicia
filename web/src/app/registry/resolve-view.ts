import { isFlyerTabId } from "@/shared/domain/flyer-options.ts";
import { orderTabs } from "@/shared/domain/screen-titles.ts";
import type { ViewRules } from "./view-rules.ts";
import { APP_VIEWS, viewById } from "./views.ts";

const MAIN_FLYER_TAB = "flyer";
const HUNTER_VIEW = "hunter";
const LEADER_VIEW = "gestiones";

function outsideTheFlyerEditor({ isHunter, isLeader }: ViewRules, id: string): string {
  if (isHunter) return HUNTER_VIEW;
  return isLeader ? LEADER_VIEW : id;
}

/** Where somebody ends up when they ask for a screen: the one they asked for, if they have it. */
export function resolveView(requested: string, rules: ViewRules): string {
  const view = viewById(requested);
  if (view && !isFlyerTabId(view.id) && view.visible(rules)) return view.id;
  const wanted = view && isFlyerTabId(view.id) && view.visible(rules) ? view.id : MAIN_FLYER_TAB;
  return outsideTheFlyerEditor(rules, wanted);
}

export function tabOrder(order: readonly string[] | null): string[] {
  return orderTabs(
    APP_VIEWS.map(({ id }) => id),
    order,
  );
}

/** The first of the tabs someone sees, in the order the administrator left them. */
export function firstView(rules: ViewRules, order: readonly string[] | null): string {
  const first = tabOrder(order).find((id) => viewById(id)?.visible(rules));
  return resolveView(first ?? MAIN_FLYER_TAB, rules);
}
