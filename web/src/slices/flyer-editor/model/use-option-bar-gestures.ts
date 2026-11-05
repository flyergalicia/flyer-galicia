// What an administrator does on the flyer bar, and nobody can do by accident: holding one and dragging
// it changes the order; four presses in a row on the same one, its name. Everybody gets the result.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { type FlyerOption, optionColor, optionLabel } from "@/shared/domain/flyer-options.ts";
import { FLYER_OPTIONS_QUERY_KEY } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { type DropSide, useHoldReorder } from "@/shared/lib/use-hold-reorder.ts";
import { useSession } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { type ListEntry, saveFlyerList } from "../api/flyer-bar.ts";
import { orderAfterMoving } from "./option-bar.ts";

const OPTION_SELECTOR = "button[data-option]";
const PRESSES_TO_RENAME = 4;
const PRESSES_WINDOW_MS = 1600;

function entryOf(options: readonly FlyerOption[], option: number, orden: number): ListEntry {
  return {
    n: option,
    nombre: optionLabel(options, option),
    color: optionColor(options, option),
    solapa: options.find(({ n }) => n === option)?.solapa ?? "flyer",
    orden,
  };
}

function moved(order: readonly number[], lifted: number, over: number, side: DropSide): number[] {
  const rest = order.filter((option) => option !== lifted);
  const at = rest.indexOf(over) + (side === "after" ? 1 : 0);
  return [...rest.slice(0, at), lifted, ...rest.slice(at)];
}

export function useOptionBarGestures(options: readonly FlyerOption[], inSight: readonly number[]) {
  const { bucket } = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const session = useSession();
  // Also while looking at the app as another profile sees it: the bar stays that of an administrator.
  const isAdmin = session.status === "signed-in" && session.isAdmin;
  const container = useRef<HTMLDivElement>(null);
  const [dragged, setDragged] = useState<readonly number[] | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const presses = useRef({ option: 0, count: 0, at: 0 });
  const order = dragged ?? inSight;

  const saveList = useCallback(
    async (entries: readonly ListEntry[], done: string) => {
      const saved = await saveFlyerList(bucket, entries);
      if (!saved.ok) {
        show(`Error al guardar las opciones: ${saved.error}`);
        return;
      }
      queryClient.setQueryData(FLYER_OPTIONS_QUERY_KEY, saved.value);
      show(done);
    },
    [bucket, queryClient, show],
  );

  const reorder = useHoldReorder({
    enabled: isAdmin,
    container,
    itemSelector: OPTION_SELECTOR,
    idOf: (item) => item.dataset.option ?? "",
    onLift: () => {
      presses.current.count = 0;
      show("Arrastrá para cambiar el orden y soltá");
    },
    onMove: (lifted, over, side) => {
      setDragged(moved(order, Number(lifted), Number(over), side));
    },
    onDrop: () => {
      setDragged(null);
      const all = options.map(({ n }) => n);
      const next = orderAfterMoving(all, order);
      if (next.join() === all.join()) return;
      void saveList(
        next.map((option, position) => entryOf(options, option, position)),
        "Orden de las opciones guardado",
      );
    },
  });

  /** Goes with the press on each flyer: four in a row on the same one open its name. */
  const countPress = useCallback(
    (option: number) => {
      if (!isAdmin) return;
      const now = Date.now();
      const current = presses.current;
      const isTheSame = current.option === option && now - current.at <= PRESSES_WINDOW_MS;
      const count = isTheSame ? current.count + 1 : 1;
      presses.current = { option, count: count >= PRESSES_TO_RENAME ? 0 : count, at: now };
      if (count >= PRESSES_TO_RENAME) setRenaming(option);
    },
    [isAdmin],
  );

  const finishRenaming = useCallback(
    (option: number, typed: string | null) => {
      setRenaming(null);
      const name = (typed ?? "").replace(/[<>]/g, "").trim();
      if (!name || name === optionLabel(options, option)) return;
      void saveList(
        options.map(({ n }, position) => ({
          ...entryOf(options, n, position),
          ...(n === option ? { nombre: name } : {}),
        })),
        `Opción renombrada: ${name}`,
      );
    },
    [options, saveList],
  );

  return { container, reorder, order, renaming, countPress, finishRenaming };
}
