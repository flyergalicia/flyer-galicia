// Since 045 the database does not let a time be stepped on: only the administrator or the leader of
// that hunter can save anyway. The others are stopped here with the notice of who is free.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { readHunterDay } from "../api/actions.ts";
import type { TakenTime } from "../api/rows.ts";
import { dateLabel, overlaps, timeRange } from "./formatting.ts";
import type { Questions } from "./use-questions.tsx";
import { canForce, nameOf, type Who } from "./who.ts";

export const HUNTER_DAY_KEY = ["commercial-actions", "hunter-day"] as const;

export interface SchedulingAttempt {
  readonly tipo?: string;
  readonly estado?: string;
  readonly fecha: string;
  readonly hora_desde?: string | null;
  readonly hora_hasta?: string | null;
}

export function takenText(taken: Pick<TakenTime, "hora_desde" | "hora_hasta" | "empresa">): string {
  const company = taken.empresa ? `en ${taken.empresa}` : "(otra acción)";
  return `${timeRange(taken) || "sin horario"} ${company}`;
}

/** With no hunter, no time, nothing cancelled and no data list, there is nothing to stop. */
export function needsNoCheck(hunter: string | null, attempt: SchedulingAttempt): boolean {
  const { hora_desde: from, fecha, estado, tipo } = attempt;
  return !hunter || !from || !fecha || estado === "cancelada" || tipo === "datos";
}

export interface OverlapCheckOptions {
  readonly who: Who;
  readonly askYes: Questions["askYes"];
  /** There is a field of hunters: another one can be chosen. */
  readonly canChooseAnother: boolean;
}

/** True: it can be saved. Without a network it is not stopped here: the database still does. */
export function useOverlapCheck({ who, askYes, canChooseAnother }: OverlapCheckOptions) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  return useCallback(
    async (
      hunter: string | null,
      attempt: SchedulingAttempt,
      exclude: string | null = null,
    ): Promise<boolean> => {
      if (needsNoCheck(hunter, attempt)) return true;
      const assigned = hunter ?? "";
      let day: readonly TakenTime[];
      try {
        day = await readHunterDay(backend, assigned, attempt.fecha);
      } catch {
        return true;
      }
      const crossing = day.filter(
        (taken) => taken.id !== exclude && taken.tipo !== "datos" && overlaps(taken, attempt),
      );
      if (crossing.length === 0) return true;
      const whose =
        hunter === who.me
          ? "Ya tenés algo a esa hora"
          : `${nameOf(who, hunter)} ya tiene algo a esa hora`;
      const text = `${crossing.map((taken) => takenText(taken)).join(", ")}, el ${dateLabel(attempt.fecha)}`;
      if (canForce(who, hunter)) {
        return askYes({
          title: whose,
          text: `${text}. ¿Guardar igual?`,
          confirmLabel: "Guardar igual",
          cancelLabel: "Cambiar el horario",
          isSafe: true,
        });
      }
      show(
        `${whose} (${text}). Cambiá el horario${canChooseAnother ? " o elegí otro hunter" : ""}.`,
      );
      void queryClient.invalidateQueries({ queryKey: HUNTER_DAY_KEY });
      return false;
    },
    [askYes, backend, canChooseAnother, queryClient, show, who],
  );
}
