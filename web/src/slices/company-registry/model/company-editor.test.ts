import { describe, expect, it } from "vitest";
import { newCompany, sanitizeCategory } from "@/shared/domain/company-registry/index.ts";
import { CLOSED_EDITOR, companyEditorReducer, type EditorState } from "./company-editor.ts";

const ACME = { ...newCompany(), empresa: "ACME", cuits: ["1"], asesores: [] };
const BETA = { ...newCompany(), empresa: "BETA" };

function opened(): EditorState {
  return companyEditorReducer(CLOSED_EDITOR, { type: "open", rows: [ACME, BETA] });
}

describe("the copy of the editor", () => {
  it("opens with a copy, and always the four places", () => {
    const state = opened();

    expect(state.rows?.map(({ empresa }) => empresa)).toEqual(["ACME", "BETA"]);
    expect(state.rows?.[0]?.asesores).toHaveLength(4);
    expect(state.rows?.[0]?.cuits).not.toBe(ACME.cuits);
  });

  it("closes", () => {
    expect(companyEditorReducer(opened(), { type: "close" })).toBe(CLOSED_EDITOR);
  });

  it("changes only the row it is told", () => {
    const state = companyEditorReducer(opened(), {
      type: "field",
      row: 1,
      fields: { empresa: "NUEVA" },
    });

    expect(state.rows?.[0]?.empresa).toBe("ACME");
    expect(state.rows?.[1]?.empresa).toBe("NUEVA");
    expect(state.rows?.[1]?.key).toBe(1);
  });

  it("changes the category and an officer", () => {
    const category = sanitizeCategory({ opcion: 4 });
    let state = companyEditorReducer(opened(), { type: "category", row: 0, category });
    state = companyEditorReducer(state, {
      type: "officer",
      row: 0,
      officer: 2,
      fields: { nombre: "Sol" },
    });

    expect(state.rows?.[0]?.rubro).toEqual(category);
    expect(state.rows?.[0]?.asesores[2]?.nombre).toBe("Sol");
    expect(state.rows?.[0]?.asesores[1]?.nombre).toBe("");
  });

  it("with no such row, or closed, nothing happens", () => {
    const state = opened();
    expect(companyEditorReducer(state, { type: "field", row: 9, fields: {} })).toBe(state);
    expect(companyEditorReducer(CLOSED_EDITOR, { type: "field", row: 0, fields: {} })).toBe(
      CLOSED_EDITOR,
    );
    expect(companyEditorReducer(CLOSED_EDITOR, { type: "add" })).toBe(CLOSED_EDITOR);
    expect(companyEditorReducer(CLOSED_EDITOR, { type: "remove", row: 0 })).toBe(CLOSED_EDITOR);
  });

  it("a new row has its own key", () => {
    const state = companyEditorReducer(opened(), { type: "add" });

    expect(state.rows?.[2]?.empresa).toBe("");
    expect(state.rows?.[2]?.key).toBe(2);
    expect(state.nextKey).toBe(3);
  });

  it("toggles what is expanded", () => {
    let state = companyEditorReducer(opened(), { type: "toggle-officers", row: 1 });
    expect(state.expanded).toEqual([1]);
    state = companyEditorReducer(state, { type: "toggle-officers", row: 1 });
    expect(state.expanded).toEqual([]);
  });

  it("deleting a row keeps what is expanded on its company", () => {
    let state = companyEditorReducer(opened(), { type: "add" });
    state = companyEditorReducer(state, { type: "toggle-officers", row: 0 });
    state = companyEditorReducer(state, { type: "toggle-officers", row: 1 });
    state = companyEditorReducer(state, { type: "toggle-officers", row: 2 });

    const after = companyEditorReducer(state, { type: "remove", row: 1 });

    expect(after.rows).toHaveLength(2);
    expect(after.expanded).toEqual([0, 1]);
  });
});
