import { describe, expect, it } from "vitest";
import { expiryStatus, finalStatus, statusText } from "./status.ts";

const OCTOBER = new Date(2026, 9, 1);

describe("the status of a promotion", () => {
  it("depends on the month that is validated", () => {
    expect(expiryStatus(null, OCTOBER)).toBe("SIN_FECHA");
    expect(expiryStatus("2026-09-30", OCTOBER)).toBe("VENCIDA");
    expect(expiryStatus("2026-10-31", OCTOBER)).toBe("VENCE_ESTE_MES");
    expect(expiryStatus("2026-11-01", OCTOBER)).toBe("VIGENTE");
  });

  it("puts expired over out of the province, and that over upcoming", () => {
    const inMendoza = { id: 1, titulo: "x", provincias: ["MENDOZA"] };
    expect(finalStatus({ ...inMendoza, fecha_hasta: "2026-09-01" }, "NEUQUEN", OCTOBER)).toBe(
      "VENCIDA",
    );
    expect(finalStatus({ ...inMendoza }, "NEUQUEN", OCTOBER)).toBe("SIN_FECHA");
    expect(
      finalStatus(
        { ...inMendoza, fecha_hasta: "2027-01-01", proximamente: true },
        "NEUQUEN",
        OCTOBER,
      ),
    ).toBe("FUERA_PROV");
    expect(
      finalStatus(
        { ...inMendoza, fecha_hasta: "2027-01-01", proximamente: true },
        "MENDOZA",
        OCTOBER,
      ),
    ).toBe("PROXIMA");
    expect(finalStatus({ ...inMendoza, fecha_hasta: "2027-01-01" }, "MENDOZA", OCTOBER)).toBe(
      "VIGENTE",
    );
  });

  it("reads as a label; what has not started says when it starts", () => {
    expect(statusText("VENCIDA", null)).toBe("Vencida");
    expect(statusText("PROXIMA", null)).toBe("Próximamente");
    expect(statusText("PROXIMA", "2026-12-05")).toBe("Empieza el 05/12/2026");
  });
});
