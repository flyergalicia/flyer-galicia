// Mis asesores is corrected on a copy too, and goes to the cloud with `Guardar cambios`.
import { useReducer } from "react";
import { newAdvisorId, type SavedAdvisor, sanitizeAdvisors } from "../api/saved-advisors.ts";

export interface AdvisorsDraft {
  /** Null: there is no copy yet. */
  readonly rows: readonly SavedAdvisor[] | null;
  readonly dirty: boolean;
}

export type AdvisorsDraftAction =
  | { readonly type: "load"; readonly rows: readonly SavedAdvisor[] }
  | { readonly type: "forget" }
  | {
      readonly type: "field";
      readonly row: number;
      readonly key: "name" | "nombre" | "celular" | "email";
      readonly value: string;
    }
  | { readonly type: "add"; readonly rows: readonly SavedAdvisor[] }
  | { readonly type: "remove"; readonly row: number };

export const NO_DRAFT: AdvisorsDraft = { rows: null, dirty: false };

function emptyAdvisor(): SavedAdvisor {
  return { id: newAdvisorId(), name: "", nombre: "", celular: "", email: "" };
}

export function advisorsDraftReducer(
  state: AdvisorsDraft,
  action: AdvisorsDraftAction,
): AdvisorsDraft {
  const { rows } = state;
  switch (action.type) {
    case "load":
      return { rows: sanitizeAdvisors(action.rows), dirty: false };
    case "forget":
      return NO_DRAFT;
    case "field": {
      const advisor = rows?.[action.row];
      if (!rows || !advisor) return state;
      return {
        rows: rows.with(action.row, { ...advisor, [action.key]: action.value }),
        dirty: true,
      };
    }
    case "add":
      return {
        rows: [...(rows ?? sanitizeAdvisors(action.rows)), emptyAdvisor()],
        dirty: true,
      };
    default:
      return rows ? { rows: rows.toSpliced(action.row, 1), dirty: true } : state;
  }
}

export function useAdvisorsDraft() {
  return useReducer(advisorsDraftReducer, NO_DRAFT);
}

/** With a filter, the position of each row is still the real one. */
export function matchingAdvisors(rows: readonly SavedAdvisor[], query: string): readonly number[] {
  const clean = query.trim().toLowerCase();
  const all = rows.map((_, position) => position);
  if (!clean) return all;
  const words = clean.split(/\s+/).filter(Boolean);
  return all.filter((position) => {
    const advisor = rows[position];
    if (!advisor) return false;
    const { name, nombre, celular, email } = advisor;
    const text = `${name} ${nombre} ${celular} ${email}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
