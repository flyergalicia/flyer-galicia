import { describe, expect, it } from "vitest";
import type { SavedAdvisor } from "../api/saved-advisors.ts";
import {
  type AdvisorsDraft,
  advisorsDraftReducer,
  matchingAdvisors,
  NO_DRAFT,
} from "./advisors-draft.ts";

const ANA: SavedAdvisor = { id: "a", name: "Ana", nombre: "Ana P", celular: "11", email: "a@b.c" };
const LUIS: SavedAdvisor = {
  id: "l",
  name: "Luis",
  nombre: "Luis G",
  celular: "22",
  email: "l@b.c",
};

function loaded(): AdvisorsDraft {
  return advisorsDraftReducer(NO_DRAFT, { type: "load", rows: [ANA, LUIS] });
}

describe("the copy of Mis asesores", () => {
  it("starts without changes", () => {
    expect(loaded()).toEqual({ rows: [ANA, LUIS], dirty: false });
  });

  it("a correction says there are changes", () => {
    const state = advisorsDraftReducer(loaded(), {
      type: "field",
      row: 1,
      key: "celular",
      value: "99",
    });

    expect(state.rows?.[1]?.celular).toBe("99");
    expect(state.dirty).toBe(true);
  });

  it("with no such row, or no copy, nothing happens", () => {
    const state = loaded();
    const change = { type: "field", row: 9, key: "name", value: "x" } as const;
    expect(advisorsDraftReducer(state, change)).toBe(state);
    expect(advisorsDraftReducer(NO_DRAFT, change)).toBe(NO_DRAFT);
    expect(advisorsDraftReducer(NO_DRAFT, { type: "remove", row: 0 })).toBe(NO_DRAFT);
  });

  it("adding before there is a copy starts from what is saved", () => {
    const state = advisorsDraftReducer(NO_DRAFT, { type: "add", rows: [ANA] });

    expect(state.rows).toHaveLength(2);
    expect(state.rows?.[0]).toEqual(ANA);
    expect(state.rows?.[1]?.nombre).toBe("");
    expect(state.dirty).toBe(true);
    expect(advisorsDraftReducer(state, { type: "add", rows: [] }).rows).toHaveLength(3);
  });

  it("deleting says there are changes", () => {
    const state = advisorsDraftReducer(loaded(), { type: "remove", row: 0 });

    expect(state.rows).toEqual([LUIS]);
    expect(state.dirty).toBe(true);
  });

  it("forgets it", () => {
    expect(advisorsDraftReducer(loaded(), { type: "forget" })).toBe(NO_DRAFT);
  });
});

describe("the filter of Mis asesores", () => {
  it("finds all the words in anything it has, with the real position", () => {
    expect(matchingAdvisors([ANA, LUIS], "luis 22")).toEqual([1]);
    expect(matchingAdvisors([ANA, LUIS], "a@b.c")).toEqual([0]);
    expect(matchingAdvisors([ANA, LUIS], "  ")).toEqual([0, 1]);
    expect(matchingAdvisors([ANA, LUIS], "zzz")).toEqual([]);
  });

  it("a hole in the list is not a match", () => {
    const holes: SavedAdvisor[] = [];
    holes[1] = ANA;

    expect(matchingAdvisors(holes, "ana")).toEqual([1]);
  });
});
