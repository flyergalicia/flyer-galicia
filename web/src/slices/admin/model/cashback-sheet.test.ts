// Config → Cashback, the copy that is edited: names, amounts, adding and taking out.
import { describe, expect, it } from "vitest";
import {
  previewedAmount,
  removeQuestion,
  renamedConfig,
  savedCashbackText,
  withAmount,
  withNewConfig,
  withoutConfig,
} from "./cashback-sheet.ts";

const BAU = { nombre: "BAU", m1: "$1", m2: "$2", m3: "$3", m4: "$4" };
const ONE = { nombre: "Config 1", m1: "$10", m2: "$20", m3: "$30", m4: "$40" };

describe("the configurations of cashback", () => {
  it("a name is written without < > and an empty one leaves the one it had", () => {
    expect(renamedConfig([BAU, ONE], 1, "  <b>Grandes</b> ")[1]?.nombre).toBe("bGrandes/b");
    expect(renamedConfig([BAU, ONE], 1, "  <> ")).toEqual([BAU, ONE]);
    expect(renamedConfig([BAU, ONE], 0, "Base")[1]).toBe(ONE);
  });

  it("an amount changes only on its configuration, as it is typed", () => {
    const changed = withAmount([BAU, ONE], 1, "m3", "$ 99.000");
    expect(changed[1]).toEqual({ ...ONE, m3: "$ 99.000" });
    expect(changed[0]).toBe(BAU);
  });

  it("a new one starts with the amounts of the last, and its number in the name", () => {
    expect(withNewConfig([BAU, ONE])[2]).toEqual({ ...ONE, nombre: "Config 2" });
    expect(withNewConfig([])[0]).toEqual({ nombre: "Config 0", m1: "", m2: "", m3: "", m4: "" });
  });

  it("BAU, the fallback, is never taken out", () => {
    expect(withoutConfig([BAU, ONE], 0)).toEqual([BAU, ONE]);
    expect(withoutConfig([BAU, ONE], 1)).toEqual([BAU]);
  });

  it("asks and tells as today", () => {
    expect(removeQuestion("Config 1")).toEqual({
      title: '¿Quitar "Config 1"?',
      body: "Deja de aparecer en el armador para todos. Las empresas de tu base o filas del masivo que la tengan cargada van a salir SIN cashback hasta que les pongas otra.",
    });
    expect(savedCashbackText(1)).toBe("Cashback actualizado para todos (1 config)");
    expect(savedCashbackText(3)).toBe("Cashback actualizado para todos (3 configs)");
  });

  it("the flyer behind shows the amount typed on the configuration the editor has", () => {
    expect(previewedAmount([BAU, ONE], 0, "m1", "$7")?.[0]?.m1).toBe("$7");
    expect(previewedAmount([BAU], 3, "m1", "$7")).toEqual([BAU]);
    expect(previewedAmount(undefined, 0, "m1", "$7")).toBeUndefined();
  });
});
