// The inline editor works on a copy of the list: what is saved is what `Guardar cambios` sends. Each
// row keeps its real position, so that with a filter on it keeps editing the same company.
import { useReducer } from "react";
import {
  type Company,
  type CompanyCategory,
  type CompanyOfficer,
  newCompany,
  OFFICERS_PER_COMPANY,
  sanitizeCategory,
} from "@/shared/domain/company-registry/index.ts";

export interface CompanyDraft extends Company {
  readonly key: number;
}

export interface EditorState {
  /** Null: the editor is closed. */
  readonly rows: readonly CompanyDraft[] | null;
  readonly expanded: readonly number[];
  readonly nextKey: number;
}

export type EditorAction =
  | { readonly type: "open"; readonly rows: readonly Company[] }
  | { readonly type: "close" }
  | { readonly type: "field"; readonly row: number; readonly fields: Partial<Company> }
  | { readonly type: "category"; readonly row: number; readonly category: CompanyCategory }
  | {
      readonly type: "officer";
      readonly row: number;
      readonly officer: number;
      readonly fields: Partial<CompanyOfficer>;
    }
  | { readonly type: "toggle-officers"; readonly row: number }
  | { readonly type: "add" }
  | { readonly type: "remove"; readonly row: number };

export const CLOSED_EDITOR: EditorState = { rows: null, expanded: [], nextKey: 0 };

function copyOf(company: Company, key: number): CompanyDraft {
  return {
    empresa: company.empresa,
    cuits: [...company.cuits],
    config: company.config,
    asesores: Array.from({ length: OFFICERS_PER_COMPANY }, (_, position) => ({
      nombre: company.asesores[position]?.nombre ?? "",
      celular: company.asesores[position]?.celular ?? "",
      email: company.asesores[position]?.email ?? "",
    })),
    rubro: sanitizeCategory(company.rubro),
    key,
  };
}

function changed(
  state: EditorState,
  row: number,
  change: (draft: CompanyDraft) => CompanyDraft,
): EditorState {
  const { rows } = state;
  const draft = rows?.[row];
  if (!rows || !draft) return state;
  return { ...state, rows: rows.with(row, change(draft)) };
}

/** Below a deleted row the positions go up by one: what is expanded stays on its company. */
function withoutRow(expanded: readonly number[], row: number): number[] {
  return expanded.filter((open) => open !== row).map((open) => (open > row ? open - 1 : open));
}

export function companyEditorReducer(state: EditorState, action: EditorAction): EditorState {
  const { rows } = state;
  switch (action.type) {
    case "open":
      return {
        rows: action.rows.map((company, key) => copyOf(company, key)),
        expanded: [],
        nextKey: action.rows.length,
      };
    case "close":
      return CLOSED_EDITOR;
    case "field":
      return changed(state, action.row, (draft) => ({ ...draft, ...action.fields }));
    case "category":
      return changed(state, action.row, (draft) => ({ ...draft, rubro: action.category }));
    case "officer":
      return changed(state, action.row, (draft) => ({
        ...draft,
        asesores: draft.asesores.map((officer, position) =>
          position === action.officer ? { ...officer, ...action.fields } : officer,
        ),
      }));
    case "toggle-officers":
      return {
        ...state,
        expanded: state.expanded.includes(action.row)
          ? state.expanded.filter((open) => open !== action.row)
          : [...state.expanded, action.row],
      };
    case "add":
      return rows
        ? {
            ...state,
            rows: [...rows, { ...newCompany(), key: state.nextKey }],
            nextKey: state.nextKey + 1,
          }
        : state;
    default:
      return rows
        ? {
            ...state,
            rows: rows.toSpliced(action.row, 1),
            expanded: withoutRow(state.expanded, action.row),
          }
        : state;
  }
}

export function useCompanyEditor() {
  return useReducer(companyEditorReducer, CLOSED_EDITOR);
}
