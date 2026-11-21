import { describe, expect, it } from "vitest";
import {
  advisorLine,
  authorOf,
  byAuthor,
  capText,
  countText,
  dashboardLine,
  dateTime,
  detailText,
  flyerDetails,
  type FlyerLog,
  optionOfDetails,
  registryLine,
  sheetFileName,
} from "./flyer-logs.ts";
import { peopleNames } from "./people.ts";

const NAMES = peopleNames([{ id: "u1", full_name: "Ana Perez", email_asesor: "a@b" }]);

function log(fields: Partial<FlyerLog>): FlyerLog {
  return {
    id: "l1",
    user_id: "u1",
    empresa: "ACME SA",
    config_name: "BAU",
    format: "pdf",
    flyer_type: null,
    created_at: "2026-10-20T10:00:00Z",
    ...fields,
  };
}

describe("the details of a flyer that came out", () => {
  it("are read only when they are an object", () => {
    expect(flyerDetails('{"opcion":9}')).toEqual({ opcion: 9 });
    expect(flyerDetails("[1]")).toEqual({});
    expect(flyerDetails("no es json")).toEqual({});
    expect(flyerDetails("3")).toEqual({});
    expect(flyerDetails(null)).toEqual({});
  });

  it("say their option, and nothing when there is none", () => {
    expect(optionOfDetails({ opcion: "9" })).toBe(9);
    expect(optionOfDetails({ opcion: "x" })).toBe(0);
    expect(optionOfDetails({})).toBe(0);
  });

  it("read as text, with nothing for what is empty", () => {
    expect(detailText("BAU")).toBe("BAU");
    expect(detailText(5)).toBe("5");
    expect(detailText(0)).toBe("");
    expect(detailText(undefined)).toBe("");
  });

  it("tell the cap of Rubros with the second only when it differs", () => {
    expect(capText({ importe: "24.000" })).toBe("Tope 24.000");
    expect(capText({ importe: "24.000", importe2: "24.000" })).toBe("Tope 24.000");
    expect(capText({ importe: "24.000", importe2: "30.000" })).toBe("Tope 24.000 / 30.000");
    expect(capText({ importe2: "30.000" })).toBe("");
  });

  it("tell the advisor with what there is of them", () => {
    expect(advisorLine({ nombre: "Ana", celular: "11", email: "a@b" })).toBe("Ana · 11 · a@b");
    expect(advisorLine({ nombre: "Ana" })).toBe("Ana");
  });
});

describe("who generated it", () => {
  it("is their name, their id when they are gone, or Usuario", () => {
    expect(authorOf(log({}), NAMES)).toBe("Ana Perez");
    expect(authorOf(log({ user_id: "u9" }), NAMES)).toBe("u9");
    expect(authorOf(log({ user_id: null }), NAMES)).toBe("Usuario");
  });

  it("filters by the name of whoever generated it, and leaves out logs with nobody", () => {
    const logs = [
      log({ id: "1" }),
      log({ id: "2", user_id: "u9" }),
      log({ id: "3", user_id: null }),
    ];
    expect(byAuthor(logs, NAMES, "").map(({ id }) => id)).toEqual(["1", "2"]);
    expect(byAuthor(logs, NAMES, " ANA ").map(({ id }) => id)).toEqual(["1"]);
  });
});

describe("the sheets", () => {
  it("of Registros carry the option by its name and the advisors", () => {
    const line = registryLine(
      log({
        flyer_type: JSON.stringify({
          opcion: 9,
          config: "Config 1",
          beneficio: "ACME",
          importe: "24.000",
          nombre: "Ana",
          celular2: "11",
        }),
      }),
      NAMES,
      (option) => `Opción ${String(option)}`,
    );
    expect(line.slice(1, 9)).toEqual([
      "Ana Perez",
      "ACME SA",
      "Config 1",
      "Opción 9",
      "ACME",
      "24.000",
      "",
      "Ana",
    ]);
    expect(line[12]).toBe("11");
    expect(line[14]).toBe("pdf");
    const bare = registryLine(log({ user_id: null, empresa: null, format: null }), NAMES, String);
    expect([bare[1], bare[2], bare[4], bare[14]]).toEqual(["", "", "", ""]);
  });

  it("of the dashboard carry who, the company, the format and the configuration", () => {
    expect(dashboardLine(log({}), NAMES).slice(0, 4)).toEqual([
      "Ana Perez",
      "ACME SA",
      "pdf",
      "BAU",
    ]);
    expect(
      dashboardLine(
        log({ user_id: "u9", empresa: null, format: null, config_name: null, created_at: null }),
        NAMES,
      ),
    ).toEqual(["u9", "", "", "", ""]);
  });

  it("are named with the day, as the computer writes it in UTC", () => {
    expect(sheetFileName("flyers_galicia", new Date("2026-10-30T23:30:00-03:00"))).toBe(
      "flyers_galicia_2026-10-31.xlsx",
    );
    expect(dateTime(null)).toBe("");
    expect(dateTime("2026-10-20T10:00:00Z")).not.toBe("");
  });

  it("count in singular and plural", () => {
    expect(countText(1, "registro", "registros")).toBe("1 registro");
    expect(countText(0, "registro", "registros")).toBe("0 registros");
  });
});
