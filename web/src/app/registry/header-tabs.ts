// The tabs of the header as each person has them: what the header draws and what the search of
// screens lists. One source for both.
import { type ScreenTitles, titleOf } from "@/shared/domain/screen-titles.ts";
import type { ViewRules } from "./view-rules.ts";
import { type AppView, viewById } from "./views.ts";

export interface HeaderTab {
  readonly id: string;
  readonly title: string;
  readonly isRenameable: boolean;
}

export function tabTitle({ title }: AppView, titles: ScreenTitles): string {
  return "fixed" in title ? title.fixed : titleOf(titles, title.key);
}

/** The tabs someone sees, in that order, with the names they have now. */
export function headerTabsOf(
  order: readonly string[],
  rules: ViewRules,
  titles: ScreenTitles,
): readonly HeaderTab[] {
  return order.flatMap((id) => {
    const view = viewById(id);
    if (!view?.visible(rules)) return [];
    return [{ id, title: tabTitle(view, titles), isRenameable: "key" in view.title }];
  });
}
