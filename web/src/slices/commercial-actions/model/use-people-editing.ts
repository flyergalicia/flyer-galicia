// What is done with the people of an action. Going to Alta asks with which package (if it had none);
// going to Descartado, why. The database demands both.
import { useCallback } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { deletePerson, insertPeople, insertPerson, updatePerson } from "../api/actions.ts";
import type { ActionRow, PersonChanges, PersonRow } from "../api/rows.ts";
import { failureText, messageOf } from "./failure-text.ts";
import { DISCARD_REASONS, PACKAGES, PACKAGES_SHORT } from "./labels.ts";
import type { PastedPerson } from "./people-paste.ts";
import { type CuilOrReference, formatCuil } from "./tax-ids.ts";
import type { ActionDetailValue } from "./use-action-detail.ts";
import type { Questions } from "./use-questions.tsx";

export type PersonField = "estado" | "paquete" | "proximo";

function firstState(action: ActionRow): string {
  return action.tipo === "datos" ? "a_contactar" : "prospecto";
}

/** What could not be added stays in the box, to correct it. */
function pastedText(people: readonly PastedPerson[]): string {
  return people
    .map(({ nombre, contacto, cuil, referencia, paquete }) =>
      [
        nombre ?? "",
        contacto ?? "",
        cuil ? formatCuil(cuil) : (referencia ?? ""),
        PACKAGES_SHORT[paquete ?? ""] ?? "",
      ].join("\t"),
    )
    .join("\n");
}

function newPersonProblem(
  name: string,
  { error, cuil }: CuilOrReference,
  people: readonly PersonRow[],
): string | null {
  if (!name) return "Escribí el nombre.";
  if (error) return error;
  return cuil && people.some((person) => person.cuil === cuil)
    ? "Ese CUIL ya está en la lista."
    : null;
}

export interface NewPersonFields {
  readonly name: string;
  readonly contact: string;
  readonly cuilOrReference: CuilOrReference;
  readonly pack: string;
}

export function usePeopleEditing(
  action: ActionRow,
  detail: ActionDetailValue,
  questions: Questions,
) {
  const backend = useBackend();
  const { show } = useToast();
  const { people, setPeople, reloadThread } = detail;
  const { id } = action;
  const { askChoice, askYes } = questions;

  const whatTheChangeAsks = useCallback(
    async (person: PersonRow, field: PersonField, value: string): Promise<PersonChanges | null> => {
      if (field !== "estado") return {};
      if (value === "alta" && !person.paquete) {
        const paquete = await askChoice({
          title: "¿Con qué paquete fue el alta?",
          text: person.nombre,
          choices: PACKAGES,
        });
        return paquete ? { paquete } : null;
      }
      if (value === "descartado" && person.estado !== "descartado") {
        const motivo = await askChoice({
          title: "¿Por qué se descarta?",
          text: person.nombre,
          choices: DISCARD_REASONS,
        });
        return motivo ? { motivo } : null;
      }
      return {};
    },
    [askChoice],
  );

  const afterChange = useCallback(
    async (before: PersonRow, saved: PersonRow, field: PersonField) => {
      if (field !== "estado") return;
      if (saved.estado === "alta" && before.estado !== "alta") {
        const pack = PACKAGES_SHORT[saved.paquete ?? ""] ?? "sin paquete";
        show(`Alta registrada (${pack}). Ya cuenta en el tablero.`);
      }
      if (saved.estado === "alta" || saved.estado === "descartado") await reloadThread();
    },
    [reloadThread, show],
  );

  const change = useCallback(
    async (person: PersonRow, field: PersonField, value: string) => {
      if (field === "paquete" && !value && person.estado === "alta") {
        show("Un alta tiene que decir con qué paquete fue.");
        return;
      }
      const extra = await whatTheChangeAsks(person, field, value);
      if (!extra) return;
      try {
        const saved = await updatePerson(backend, person.id, {
          [field]: field === "estado" ? value : value || null,
          ...extra,
        });
        setPeople((list) => list.map((row) => (row.id === saved.id ? saved : row)));
        await afterChange(person, saved, field);
      } catch (cause) {
        show(`No se pudo guardar: ${failureText(cause)}`);
      }
    },
    [afterChange, backend, setPeople, show, whatTheChangeAsks],
  );

  const remove = useCallback(
    async (person: PersonRow) => {
      const isSure = await askYes({
        title: `¿Quitar a ${person.nombre} de la lista?`,
        confirmLabel: "Quitar",
      });
      if (!isSure) return;
      try {
        await deletePerson(backend, person.id);
        setPeople((list) => list.filter((row) => row.id !== person.id));
      } catch (cause) {
        show(`No se pudo quitar: ${messageOf(cause)}`);
      }
    },
    [askYes, backend, setPeople, show],
  );

  /** It says whether it was added. */
  const add = useCallback(
    async ({ name, contact, cuilOrReference, pack }: NewPersonFields): Promise<boolean> => {
      const problem = newPersonProblem(name, cuilOrReference, people);
      if (problem) {
        show(problem);
        return false;
      }
      const { cuil, referencia } = cuilOrReference;
      try {
        const saved = await insertPerson(backend, {
          gestion_id: id,
          nombre: name,
          contacto: contact || null,
          cuil: cuil ?? null,
          referencia: referencia ?? null,
          paquete: pack || null,
          estado: firstState(action),
        });
        setPeople((list) => [...list, saved]);
        return true;
      } catch (cause) {
        show(`No se pudo agregar: ${failureText(cause)}`);
        return false;
      }
    },
    [action, backend, id, people, setPeople, show],
  );

  /** What goes back to the box: null if it could not be added. */
  const addPasted = useCallback(
    async (parsed: readonly PastedPerson[]): Promise<string | null> => {
      const ready = parsed.filter(({ ok }) => ok);
      const rest = parsed.filter(({ ok }) => !ok);
      try {
        const saved = await insertPeople(
          backend,
          ready.map(({ nombre, contacto, cuil, referencia, paquete }) => ({
            gestion_id: id,
            nombre: nombre ?? "",
            contacto,
            cuil,
            referencia,
            paquete,
            estado: firstState(action),
          })),
        );
        setPeople((list) => [...list, ...saved]);
        show(
          `${String(saved.length)} agregados${rest.length > 0 ? `. Quedaron ${String(rest.length)} en el cuadro para corregir.` : "."}`,
        );
        return pastedText(rest);
      } catch (cause) {
        show(`No se pudo agregar: ${failureText(cause)}`);
        return null;
      }
    },
    [action, backend, id, setPeople, show],
  );

  return { change, remove, add, addPasted };
}

export type PeopleEditing = ReturnType<typeof usePeopleEditing>;
