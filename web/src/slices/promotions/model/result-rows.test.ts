import { describe, expect, it } from "vitest";
import type { Promotion } from "@/shared/domain/promotions/index.ts";
import {
  idsToAskStartDate,
  searchNotice,
  searchRows,
  watchableRows,
  withChosenMatch,
  withStartDates,
  withStatusesOf,
} from "./result-rows.ts";

const MONTH = new Date(2026, 9, 1);
let nextId = 0;

function promotion(titulo: string, fields: Partial<Promotion> = {}): Promotion {
  nextId += 1;
  return { id: nextId, titulo, fecha_hasta: "2099-01-01", provincias: [], ...fields };
}

const SUR = [
  promotion("Ambigua Sur", { beneficio: "1" }),
  promotion("Ambigua Sur", { beneficio: "2" }),
];
const NORTE = [
  promotion("Ambigua Norte", { beneficio: "3" }),
  promotion("Ambigua Norte", { beneficio: "4" }),
  promotion("Ambigua Norte", { beneficio: "5" }),
];
const CATALOG = [...SUR, ...NORTE];

function search(brands: readonly string[], catalog: readonly Promotion[] = CATALOG) {
  return searchRows(brands, catalog, "", MONTH);
}

describe("choosing the match of a row", () => {
  it("brings the others of that name below it", () => {
    const { rows } = search(["Ambigua"]);
    const [row] = rows;
    if (!row) throw new Error("No row");
    const position = row.candidates.findIndex(
      ({ promotion: { titulo } }) => titulo === "Ambigua Norte",
    );

    const chosen = withChosenMatch(rows, row.key, position, CATALOG, "", MONTH);

    expect(chosen?.rows.map(({ promotion: found }) => found?.titulo)).toEqual([
      "Ambigua Norte",
      "Ambigua Norte",
      "Ambigua Norte",
    ]);
    expect(chosen?.rows[0]).toMatchObject({ key: row.key, needsReview: false, status: "VIGENTE" });
    expect(chosen?.siblingIds).toHaveLength(2);
    expect(chosen?.chosenId).toBe(chosen?.rows[0]?.promotion?.id);
  });

  it("choosing again takes away those of before, and repeats nothing", () => {
    const { rows } = search(["Ambigua"]);
    const [row] = rows;
    if (!row) throw new Error("No row");
    const norte = row.candidates.findIndex(
      ({ promotion: { titulo } }) => titulo === "Ambigua Norte",
    );
    const sur = row.candidates.findIndex(({ promotion: { titulo } }) => titulo === "Ambigua Sur");
    const first = withChosenMatch(rows, row.key, norte, CATALOG, "", MONTH);

    const second = withChosenMatch(first?.rows ?? [], row.key, sur, CATALOG, "", MONTH);

    expect(second?.rows.map(({ promotion: found }) => found?.titulo)).toEqual([
      "Ambigua Sur",
      "Ambigua Sur",
    ]);
  });

  it("choosing none leaves it as not found, with nothing below", () => {
    const { rows } = search(["Ambigua"]);
    const [row] = rows;
    if (!row) throw new Error("No row");
    const none = withChosenMatch(rows, row.key, -1, CATALOG, "", MONTH);
    expect(none?.rows).toHaveLength(1);
    expect(none?.rows[0]).toMatchObject({
      promotion: null,
      status: "NO_ENCONTRADA",
      startDate: null,
    });
    expect(none?.chosenId).toBeNull();
  });

  it("does nothing for a row that is not there", () => {
    expect(withChosenMatch([], 1, 0, CATALOG, "", MONTH)).toBeNull();
  });

  it("does not touch the rows of the other brands", () => {
    const other = promotion("Otra Marca");
    const { rows } = search(["Ambigua", "Otra Marca"], [...CATALOG, other]);
    const [row] = rows;
    if (!row) throw new Error("No row");
    const chosen = withChosenMatch(rows, row.key, 0, [...CATALOG, other], "", MONTH);
    expect(chosen?.rows.at(-1)?.promotion).toBe(other);
  });
});

describe("what is said of a search", () => {
  it("says up to three to review and four not found", () => {
    const brands = ["Ambigua", "Ambigua", "Ambigua", "Ambigua", "A1", "A2", "A3", "A4", "A5"];
    const notice = searchNotice(search(brands).brandRows);
    expect(notice).toMatch(/^4 para revisar: .*\.\.\. · 5 sin coincidencia: A1, A2, A3, A4\.\.\./);
  });

  it("says nothing when everything was found", () => {
    expect(searchNotice(search(["Ambigua Norte"]).brandRows)).toBeNull();
  });
});

describe("what is asked of each row", () => {
  it("the date of start, only of the sure ones of Galicia", () => {
    const modo = promotion("Solo Modo", { id: "m:1", origen: "modo" });
    const { rows } = search(["Ambigua", "Solo Modo", "Ambigua Sur"], [...CATALOG, modo]);
    const ids = idsToAskStartDate(rows);
    expect(ids).toEqual(SUR.map(({ id }) => id));
  });

  it("a date only goes where it was answered", () => {
    const { rows } = search(["Ambigua Sur", "Nada Parecido"]);
    const [first] = SUR;
    const dated = withStartDates(rows, { [String(first?.id)]: "2026-01-02" });
    expect(dated.find(({ promotion: found }) => found === first)?.startDate).toBe("2026-01-02");
    expect(dated.at(-1)?.startDate).toBeUndefined();
  });

  it("what has its date of start does not ask for it", () => {
    const upcoming = promotion("Proxima", { fecha_desde: "2026-12-05" });
    const { rows } = search(["Proxima"], [upcoming]);
    expect(rows[0]?.startDate).toBe("2026-12-05");
  });

  it("another province changes the status of what is sure", () => {
    const here = promotion("Aca", { provincias: ["MENDOZA"] });
    const { rows } = search(["Aca", "Ambigua", "Nada Parecido"], [here, ...CATALOG]);
    const changed = withStatusesOf(rows, "NEUQUEN", MONTH);
    expect(changed.map(({ status }) => status)).toEqual(["FUERA_PROV", "REVISAR", "NO_ENCONTRADA"]);
  });

  it("what can be watched leaves out what is to review, not found or ticked out", () => {
    const { rows } = search(["Ambigua Sur", "Ambigua", "Nada Parecido"]);
    const withExcluded = rows.map((row, position) =>
      position === 1 ? Object.assign({}, row, { excluded: true }) : row,
    );
    const { found, left } = watchableRows(withExcluded);
    expect(found.map(({ brand }) => brand)).toEqual(["Ambigua Sur"]);
    expect(left).toEqual(["Ambigua", "Nada Parecido"]);
  });
});
