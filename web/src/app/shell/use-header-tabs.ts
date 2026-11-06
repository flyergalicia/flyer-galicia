import { useCallback, useMemo, useRef, useState } from "react";
import { cleanTitle, type ScreenTitles, titleOf } from "@/shared/domain/screen-titles.ts";
import { useSaveScreenTitles } from "@/shared/lib/app-config/screen-titles-query.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { type DropSide, useHoldReorder } from "@/shared/lib/use-hold-reorder.ts";
import { tabOrder } from "../registry/resolve-view.ts";
import type { ViewRules } from "../registry/view-rules.ts";
import { headerTabsOf } from "../registry/header-tabs.ts";
import { viewById } from "../registry/views.ts";

export type { HeaderTab } from "../registry/header-tabs.ts";

const TAB_SELECTOR = '[role="tab"]';

function moved(order: readonly string[], lifted: string, over: string, side: DropSide): string[] {
  const rest = order.filter((id) => id !== lifted);
  const at = rest.indexOf(over) + (side === "after" ? 1 : 0);
  return [...rest.slice(0, at), lifted, ...rest.slice(at)];
}

function sameOrder(one: readonly string[], other: readonly string[]): boolean {
  return one.join() === other.join();
}

export interface HeaderTabsOptions {
  readonly rules: ViewRules;
  readonly titles: ScreenTitles;
  /** Only an administrator moves them and renames them, and everybody gets it. */
  readonly canEdit: boolean;
}

/** The tabs someone sees, in their order, and what an administrator does to them. */
export function useHeaderTabs({ rules, titles, canEdit }: HeaderTabsOptions) {
  const toast = useToast();
  const save = useSaveScreenTitles();
  const container = useRef<HTMLDivElement>(null);
  const [dragged, setDragged] = useState<readonly string[] | null>(null);
  const saved = useMemo(() => tabOrder(titles.order), [titles.order]);
  const order = dragged ?? saved;

  const reportFailure = useCallback(
    (message: string) => {
      toast.show(`Error al guardar el título: ${message}`);
    },
    [toast],
  );

  const reorder = useHoldReorder({
    enabled: canEdit,
    container,
    itemSelector: TAB_SELECTOR,
    idOf: (item) => item.dataset.tabId ?? "",
    onLift: () => {
      toast.show("Arrastrá para cambiar el orden y soltá");
    },
    onMove: (lifted, over, side) => {
      setDragged(moved(order, lifted, over, side));
    },
    onDrop: () => {
      setDragged(null);
      if (sameOrder(order, saved)) return;
      void save({ ...titles, order }).then((result) => {
        if (result.ok) toast.show("Orden de las solapas guardado");
        else reportFailure(result.error.message);
      });
    },
  });

  const rename = useCallback(
    (id: string, text: string) => {
      const title = viewById(id)?.title;
      const name = cleanTitle(text);
      if (!title || !("key" in title) || !name || name === titleOf(titles, title.key)) return;
      const names = { ...titles.names, [title.key]: name };
      void save({ ...titles, names }).then((result) => {
        if (result.ok) toast.show(`Título guardado: ${name}`);
        else reportFailure(result.error.message);
      });
    },
    [reportFailure, save, titles, toast],
  );

  const tabs = useMemo(() => headerTabsOf(order, rules, titles), [order, rules, titles]);

  return { tabs, container, reorder, rename };
}
