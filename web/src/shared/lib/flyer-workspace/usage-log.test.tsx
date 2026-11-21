import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { type Answer, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { flyerUseDetail, type FlyerUse, logBatchFlyerUse, logFlyerUse } from "./usage-log.ts";

function flyerUse(
  values: Partial<FlyerUse["values"]> = {},
  others: Partial<FlyerUse> = {},
): FlyerUse {
  return {
    values: { empresa: "ACME SA", ...values },
    fileName: "Flyer ACME SA",
    format: "pdf",
    option: 9,
    usesSecondCap: false,
    ...others,
  };
}

function detail(values: Partial<FlyerUse["values"]> = {}, others: Partial<FlyerUse> = {}) {
  const read: unknown = JSON.parse(flyerUseDetail(flyerUse(values, others)));
  return read;
}

const backendWith = (answer: Answer) => createAppHarness({ tables: { flyer_logs: answer } });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what is left in the usage log", () => {
  it("which flyer, who, and how many officers went", () => {
    expect(
      detail({
        config: "BAU",
        has1: true,
        nombre: "Ana",
        celular: "Cel: 1",
        has2: false,
        nombre2: "",
      }),
    ).toEqual({ opcion: 9, config: "BAU", nombre: "Ana", celular: "Cel: 1", asesores: 1 });
    expect(flyerUseDetail(flyerUse())).toContain('"opcion":9');
  });

  it("with Oficiales por sede, the title and the places", () => {
    expect(
      detail({
        sedes: true,
        sedesTit: "Sedes",
        has1: true,
        nombre: "Ana",
        ubic1: "Rosario",
        ubic2: "",
      }),
    ).toEqual({
      opcion: 9,
      nombre: "Ana",
      sedes: 1,
      sedesTit: "Sedes",
      ubic1: "Rosario",
      asesores: 1,
    });
  });

  it("in Rubros, the sign; the second cap only if the sign prints it", () => {
    expect(detail({ benef: true, benefNombre: "B", importe: "$1" })).toEqual({
      opcion: 9,
      asesores: 0,
      beneficio: "B",
      importe: "$1",
    });
    expect(detail({ benef: true }, { usesSecondCap: true })).toEqual({
      opcion: 9,
      asesores: 0,
      beneficio: "",
      importe: "",
      importe2: "",
    });
    expect(detail({ benef: true, importe: "$1" }, { usesSecondCap: true })).toMatchObject({
      importe2: "$1",
    });
    expect(
      detail({ benef: true, importe: "$1", importe2: "$2" }, { usesSecondCap: true }),
    ).toMatchObject({
      importe2: "$2",
    });
  });

  it("goes in its columns, one row per flyer", async () => {
    const harness = backendWith(() => jsonResponse(null, 201));
    await logFlyerUse(harness.backend.db, "ana", flyerUse({}, { format: "compartir" }));
    const logs = harness.network.to("/rest/v1/flyer_logs", "POST");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.body).toMatchObject({
      user_id: "ana",
      empresa: "ACME SA",
      config_name: "Flyer ACME SA",
      format: "compartir",
      is_bulk: false,
      bulk_count: 0,
    });
  });

  it("if it cannot be written it is only warned: the file is already out", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refused = backendWith(() => jsonResponse({ message: "No" }, 500));
    await expect(logFlyerUse(refused.backend.db, "ana", flyerUse())).resolves.toBeUndefined();
    const dropped = backendWith(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(logFlyerUse(dropped.backend.db, "ana", flyerUse())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("what a batch leaves in the usage log", () => {
  it("one entry, with what came out, saying where it came from", async () => {
    const harness = backendWith(() => jsonResponse(null, 201));
    await logBatchFlyerUse(harness.backend.db, "ana", {
      count: 7,
      fromCompanies: false,
      option: 9,
    });
    await logBatchFlyerUse(harness.backend.db, "ana", {
      count: 2,
      fromCompanies: true,
      option: 8,
    });
    expect(harness.network.to("/rest/v1/flyer_logs").map(({ body }) => body)).toEqual([
      expect.objectContaining({
        user_id: "ana",
        empresa: "Masivo (7 flyers)",
        config_name: "",
        format: "pdf",
        is_bulk: true,
        bulk_count: 7,
        flyer_type: JSON.stringify({ opcion: 9, masivo: true, padron: false }),
      }),
      expect.objectContaining({
        empresa: "Mis empresas (2 flyers)",
        bulk_count: 2,
        flyer_type: JSON.stringify({ opcion: 8, masivo: true, padron: true }),
      }),
    ]);
  });

  it("if it cannot be written it is only warned", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refused = backendWith(() => jsonResponse({ message: "No" }, 500));
    await expect(
      logBatchFlyerUse(refused.backend.db, "ana", { count: 1, fromCompanies: false, option: 9 }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
