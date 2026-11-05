// What saving a new action takes: that its time is free, the action, the list of a data list, and the
// other dates of a series, each one on its own so that one that clashes does not stop the others.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { type Backend, useBackend } from "@/shared/supabase/index.ts";
import { insertAction, insertPeopleOfList, insertSeriesDate } from "../api/actions.ts";
import type { ActionRow } from "../api/rows.ts";
import { type DatedAction, daysToNextDate, nextDateOf, restOfSeries } from "./action-form.ts";
import { failureText } from "./failure-text.ts";
import { addDays, dateLabel } from "./formatting.ts";
import type { PastedPerson } from "./people-paste.ts";
import { formatCuil } from "./tax-ids.ts";
import { invalidateActionList } from "./use-actions-data.ts";
import type { Questions } from "./use-questions.tsx";

export interface PendingList {
  readonly actionId: string;
  readonly text: string;
}

export function listAsText(people: readonly PastedPerson[]): string {
  return people
    .map(({ nombre, contacto, cuil, referencia }) =>
      [nombre, contacto ?? "", cuil ? formatCuil(cuil) : (referencia ?? "")].join("\t"),
    )
    .join("\n");
}

export interface SeriesOutcome {
  /** How many of the others were created. */
  readonly created: number;
  readonly failed: readonly { readonly fecha: string; readonly motivo: string }[];
}

/** One at a time: the database compares each one with what the hunter already has. */
function insertInOrder(
  backend: Pick<Backend, "db">,
  rows: readonly DatedAction[],
): Promise<SeriesOutcome> {
  return rows.reduce<Promise<SeriesOutcome>>(
    async (before, row) => {
      const { created, failed } = await before;
      try {
        await insertSeriesDate(backend, row);
        return { created: created + 1, failed };
      } catch (cause) {
        return {
          created,
          failed: [...failed, { fecha: row.fecha, motivo: failureText(cause) }],
        };
      }
    },
    Promise.resolve({ created: 0, failed: [] }),
  );
}

export function useSeriesCreation() {
  const backend = useBackend();
  const { show } = useToast();
  return useCallback(
    async (saved: ActionRow): Promise<SeriesOutcome> => {
      const rows = restOfSeries(saved);
      const { created, failed } = await insertInOrder(backend, rows);
      if (failed.length > 0) {
        const missing = failed.map(({ fecha, motivo }) => `${dateLabel(fecha)} (${motivo})`);
        show(
          `Se crearon ${String(created + 1)} de ${String(rows.length + 1)} fechas. No se pudo: ${missing.join("; ")}. Agregalas a mano desde la agenda.`,
        );
      }
      return { created, failed };
    },
    [backend, show],
  );
}

export type ListOutcome =
  | { readonly saved: true }
  | { readonly saved: false; readonly pending: PendingList };

/** After creating a data list, its people, all of them "A contactar". The list is not lost. */
export function useListSaving() {
  const backend = useBackend();
  const { show } = useToast();
  return useCallback(
    async (action: ActionRow, people: readonly PastedPerson[] | null): Promise<ListOutcome> => {
      if (action.tipo !== "datos" || !people?.length) return { saved: true };
      try {
        await insertPeopleOfList(
          backend,
          people.map(({ nombre, contacto, cuil, referencia }) => ({
            gestion_id: action.id,
            nombre: nombre ?? "",
            contacto,
            cuil,
            referencia,
            estado: "a_contactar",
          })),
        );
        return { saved: true };
      } catch (cause) {
        show(
          `Se creó la base, pero no se pudieron cargar las personas (${failureText(cause)}). Te dejé la lista pegada en la acción: tocá «Agregar» para reintentar.`,
        );
        return { saved: false, pending: { actionId: action.id, text: listAsText(people) } };
      }
    },
    [backend, show],
  );
}

/** "Crear la próxima": the next date of a repeated action, with the same data. */
export function useRepeatAction(
  me: string,
  check: (hunter: string | null, attempt: DatedAction) => Promise<boolean>,
  onCreated: (id: string) => void,
) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { show } = useToast();
  return useCallback(
    async (action: ActionRow) => {
      const { action: next, hunter } = nextDateOf(action, me);
      if (!(await check(hunter, next))) return;
      try {
        const created = await insertAction(backend, next);
        invalidateActionList(queryClient);
        onCreated(created.id);
        show(
          `Creada la próxima fecha: ${dateLabel(next.fecha)}. Mismos datos, prospectos en cero.`,
        );
      } catch (cause) {
        show(`No se pudo crear: ${failureText(cause)}`);
      }
    },
    [backend, check, me, onCreated, queryClient, show],
  );
}

/** When an endless series is completed, it offers to create the next date. */
export function askForNextDate(action: ActionRow, askYes: Questions["askYes"]): Promise<boolean> {
  const every = daysToNextDate(action);
  if (!every) return Promise.resolve(false);
  return askYes({
    title: `¿Creamos la próxima para el ${dateLabel(addDays(action.fecha, every))}?`,
    text: `Se repite cada ${String(every)} días. Queda planificada, con los mismos datos.`,
    confirmLabel: "Crear la próxima",
    cancelLabel: "Ahora no",
    isSafe: true,
  });
}
