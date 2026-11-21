import { describe, expect, it } from "vitest";
import { TEAM, whoIs } from "../testing/fixtures.ts";
import {
  COULD_NOT_REVIEW,
  dateOfCell,
  daysToAsk,
  hunterOfCell,
  namesToLookFor,
  parsePastedAgenda,
  pastedRow,
  readyLines,
  summaryOf,
  timesOfCell,
  typeOfCell,
  withCompanies,
  withOverlaps,
} from "./agenda-paste.ts";
import { thisYear } from "./formatting.ts";

const officer = whoIs("vip", "o1");
const leader = whoIs("lider", "l1");

const PASTED =
  "Fecha\tHorario\tEmpresa\tHunter\tLugar\n21/10\t10 a 12\tACME SA\tSofía\tPiso 3\nTomás Ríos\tBETA SRL\t22/10\t9hs a 11hs\tFeria\nSin Fecha SA\tSofía\n23/10\tACME SA\tNadie Conocido\n24/10\t11 a 13\tOtra SA\tSofía Paz";

describe("a pasted date", () => {
  it.each([
    ["21/10/2026", "2026-10-21"],
    ["mar 3/11/26", "2026-11-03"],
    ["2026-10-21", "2026-10-21"],
    ["21.10.2026", "2026-10-21"],
  ])("reads %j", (text, date) => {
    expect(dateOfCell(text)).toBe(date);
  });

  it("with no year, it is this one", () => {
    expect(dateOfCell("21/10")).toBe(`${String(thisYear())}-10-21`);
  });

  it.each(["31/02", "10-12", "ACME", "2026-02-31"])("does not read %j", (text) => {
    expect(dateOfCell(text)).toBeNull();
  });
});

describe("a pasted time", () => {
  it.each([
    ["10 a 12", ["10:00", "12:00"]],
    ["10:00-12:30", ["10:00", "12:30"]],
    ["9hs a 13hs", ["09:00", "13:00"]],
    ["9.30 – 13", ["09:30", "13:00"]],
    ["de 9 hasta 11", ["09:00", "11:00"]],
    ["9hs", ["09:00", null]],
    ["desde las 9:30", ["09:30", null]],
  ])("reads %j", (text, times) => {
    expect(timesOfCell(text)).toEqual(times);
  });

  it.each(["12 a 10", "10", "ACME", "25hs", "25 a 26", "10:75"])("does not read %j", (text) => {
    expect(timesOfCell(text)).toBeNull();
  });
});

describe("a pasted type", () => {
  it.each([
    ["Posición comercial", "posicion"],
    ["posicion", "posicion"],
    ["Acción", "accion"],
    ["FERIA", "feria"],
    ["ACME", null],
  ])("%j is %j", (text, type) => {
    expect(typeOfCell(text)).toBe(type);
  });
});

describe("a pasted hunter", () => {
  const ids = ["h1", "h2"];

  it("by the whole name, or by words that match only one", () => {
    expect.soft(hunterOfCell(officer, "Sofía Paz", ids)).toBe("h1");
    expect.soft(hunterOfCell(officer, "sofia", ids)).toBe("h1");
    expect.soft(hunterOfCell(officer, "Ríos", ids)).toBe("h2");
  });

  it("not with nothing, nor short words, nor another name", () => {
    expect.soft(hunterOfCell(officer, "", ids)).toBeNull();
    expect.soft(hunterOfCell(officer, "Pa", ids)).toBeNull();
    expect.soft(hunterOfCell(officer, "Nadie", ids)).toBeNull();
  });

  it("not if the words match two", () => {
    const twins = {
      ...officer,
      people: {
        ...TEAM,
        h3: { id: "h3", nombre: "Sofía Gil", rol: "hunter" },
      },
    };
    expect(hunterOfCell(twins, "Sofía", ["h1", "h3"])).toBeNull();
  });
});

describe("the lines", () => {
  const lines = parsePastedAgenda(officer, PASTED);

  it("skip the titles, in any order of columns", () => {
    expect(lines).toHaveLength(5);
  });

  it("read the date, the time, the company, the hunter and the place", () => {
    expect(lines[0]).toMatchObject({
      ok: true,
      hora_desde: "10:00",
      hora_hasta: "12:00",
      companyText: "ACME SA",
      hunter_id: "h1",
      lugar: "Piso 3",
      tipo: "posicion",
    });
    expect(lines[0]?.fecha).toMatch(/-10-21$/);
  });

  it("in another order, and with the type if it comes", () => {
    expect(lines[1]).toMatchObject({
      ok: true,
      hunter_id: "h2",
      tipo: "feria",
      hora_hasta: "11:00",
    });
  });

  it("say what is missing", () => {
    expect.soft(lines[2]).toMatchObject({ ok: false, problem: "sin fecha" });
    expect.soft(lines[3]).toMatchObject({ ok: false, problem: "no se reconoce el hunter" });
  });

  it.each([
    ["21/10\t10 a 12\tSofía", "sin empresa"],
    ["21/10\tACME SA\tSofía", "sin horario"],
  ])("%j says it: %s", (line, problem) => {
    expect(parsePastedAgenda(officer, line)[0]).toMatchObject({ ok: false, problem });
  });

  it("take more ways of separating cells, and leave out blank lines", () => {
    const [line, ...rest] = parsePastedAgenda(officer, "21/10; 10 a 12;  ACME SA  Sofía\n\n   \n");
    expect.soft(line).toMatchObject({ ok: true, companyText: "ACME SA", hunter_id: "h1" });
    expect.soft(rest).toEqual([]);
  });

  it("a second date or time is not read as one: it goes as text", () => {
    const [line] = parsePastedAgenda(officer, "21/10\t22/10\t10 a 12\t13 a 14\tSofía");
    expect.soft(line?.companyText).toBe("22/10");
    expect.soft(line?.lugar).toBe("13 a 14");
  });

  it("cut a long place", () => {
    const [line] = parsePastedAgenda(officer, `21/10\t10 a 12\tACME\t${"x".repeat(300)}\tSofía`);
    expect(line?.lugar).toHaveLength(200);
  });

  it("a leader recognizes only those of the team", () => {
    const [line] = parsePastedAgenda(leader, "21/10\t10 a 12\tACME\tOtro Hunter");
    expect(line?.hunter_id).toBeNull();
  });

  it("title-less lines that say empresa are lines", () => {
    expect(parsePastedAgenda(officer, "21/10\t10 a 12\tLa Empresa SA\tSofía")).toHaveLength(1);
  });
});

describe("looking for the companies", () => {
  const lines = parsePastedAgenda(
    officer,
    "21/10\t10 a 12\tACME SA\tSofía\n22/10\t10 a 12\tacme sa\tSofía\nSin Fecha SA\tSofía",
  );

  it("asks each one once, by its whole name, only for what is ready", () => {
    expect(namesToLookFor(lines)).toEqual(["acme sa"]);
  });

  it("each hunter and day once", () => {
    const again = parsePastedAgenda(officer, "21/10\t10 a 12\tA\tSofía\n21/10\t14 a 15\tB\tSofía");
    expect(daysToAsk(again)).toHaveLength(1);
    expect(daysToAsk(again)[0]?.hunter).toBe("h1");
  });

  it("does not say it is not there when it could not ask", () => {
    const [first] = withCompanies(officer, lines, new Map([["acme sa", null]]));
    expect.soft(first).toMatchObject({ ok: false, couldNotAsk: true, problem: COULD_NOT_REVIEW });
    expect.soft(first?.problem).not.toMatch(/no está en la base/);
  });

  it("a name that is not on the answer could not be asked either", () => {
    const [first] = withCompanies(officer, lines, new Map());
    expect(first).toMatchObject({ ok: false, couldNotAsk: true });
  });

  it("not found is not found", () => {
    const [first] = withCompanies(officer, lines, new Map([["acme sa", []]]));
    expect(first).toMatchObject({
      ok: false,
      couldNotAsk: false,
      problem: "la empresa no está en la base",
    });
  });

  it("with one, it takes its officer", () => {
    const [first] = withCompanies(
      officer,
      lines,
      new Map([["acme sa", [{ empresa: "ACME SA", dueno_id: "o2" }]]]),
    );
    expect(first).toMatchObject({ ok: true, empresa: "ACME SA", dueno_id: "o2" });
  });

  const twoOfficers = [
    { empresa: "ACME SA", dueno_id: "o2" },
    { empresa: "ACME SA", dueno_id: "o3" },
  ];

  it("of two officers, it is loaded one by one", () => {
    const [first] = withCompanies(officer, lines, new Map([["acme sa", twoOfficers]]));
    expect(first).toMatchObject({
      ok: false,
      problem: "la tienen 2 oficiales: cargala de a una",
    });
  });

  it("of two officers and one's own, it goes as one's own", () => {
    const [first] = withCompanies(
      officer,
      lines,
      new Map([["acme sa", [...twoOfficers, { empresa: "ACME SA", dueno_id: "o1" }]]]),
    );
    expect(first).toMatchObject({ ok: true, dueno_id: "o1" });
  });

  it("what already had a problem stays as it is", () => {
    expect(withCompanies(officer, lines, new Map())[2]).toMatchObject({ problem: "sin fecha" });
  });
});

function nothing() {
  return [];
}

function taken() {
  return [{ hora_desde: "11:00:00", hora_hasta: "12:00:00", empresa: "ZETA" }];
}

describe("what overlaps", () => {
  const found = new Map([
    ["a sa", [{ empresa: "A SA", dueno_id: "o1" }]],
    ["b sa", [{ empresa: "B SA", dueno_id: "o1" }]],
  ]);
  const read = (who: typeof officer, text: string) =>
    withCompanies(who, parsePastedAgenda(who, text), found);

  it("is not added by an officer, whether with the agenda", () => {
    const [line] = withOverlaps(officer, read(officer, "21/10\t10 a 12\tA SA\tSofía"), taken);
    expect(line).toMatchObject({ ok: false, problem: "se pisa con 11:00–12:00 en ZETA" });
  });

  it("or within the list", () => {
    const [first, second] = withOverlaps(
      officer,
      read(officer, "21/10\t10 a 12\tA SA\tSofía\n21/10\t11 a 13\tB SA\tSofía"),
      nothing,
    );
    expect.soft(first?.ok).toBe(true);
    expect.soft(second).toMatchObject({
      ok: false,
      problem: "se pisa con 10:00–12:00 en A SA (de esta lista)",
    });
  });

  it("what was left out of the list does not stop the next one", () => {
    const lines = read(officer, "21/10\t10 a 12\tOTRA SA\tSofía\n21/10\t11 a 13\tB SA\tSofía");
    const [, second] = withOverlaps(officer, lines, nothing);
    expect(second?.ok).toBe(true);
  });

  it("another day or another hunter does not overlap", () => {
    const [, second, third] = withOverlaps(
      officer,
      read(
        officer,
        "21/10\t10 a 12\tA SA\tSofía\n22/10\t10 a 12\tB SA\tSofía\n21/10\t10 a 12\tB SA\tTomás Ríos",
      ),
      nothing,
    );
    expect.soft(second?.ok).toBe(true);
    expect.soft(third?.ok).toBe(true);
  });

  it("the leader of that hunter gets a warning and adds it", () => {
    const [line] = withOverlaps(leader, read(leader, "21/10\t10 a 12\tA SA\tSofía"), taken);
    expect(line).toMatchObject({ ok: true, warning: "se pisa con 11:00–12:00 en ZETA" });
  });

  it("the administrator too", () => {
    const admin = whoIs("admin", "a1", true);
    const [line] = withOverlaps(admin, read(admin, "21/10\t10 a 12\tA SA\tSofía"), taken);
    expect(line?.ok).toBe(true);
  });
});

describe("the summary", () => {
  const found = new Map([["a sa", [{ empresa: "A SA", dueno_id: "o1" }]]]);
  const lines = withOverlaps(
    whoIs("lider", "l1"),
    withCompanies(
      whoIs("lider", "l1"),
      parsePastedAgenda(
        whoIs("lider", "l1"),
        "21/10\t10 a 12\tA SA\tSofía\n21/10\t11 a 13\tA SA\tSofía\nSin Fecha\tSofía\n21/10\t15 a 16\tB SA\tSofía",
      ),
      found,
    ),
    () => [],
  );

  it("says how many are ready, how many overlap and how many have problems", () => {
    expect(summaryOf(lines)).toEqual({
      ready: 2,
      overlapping: 1,
      withProblems: 2,
      canTryAgain: true,
    });
  });

  it("only what has an officer can be added", () => {
    expect.soft(readyLines(lines)).toHaveLength(2);
    expect.soft(readyLines(parsePastedAgenda(officer, "21/10\t10 a 12\tA SA\tSofía"))).toEqual([]);
  });

  it("goes planned, on one single date", () => {
    const [line] = readyLines(lines);
    if (!line) throw new Error("No line");
    expect(pastedRow(line)).toMatchObject({
      empresa: "A SA",
      dueno_id: "o1",
      hunter_id: "h1",
      origen: "derivada",
      tipo: "posicion",
      modalidad: "presencial",
      frecuencia: "unica",
      estado: "planificada",
      hora_desde: "10:00",
      hora_hasta: "12:00",
      lugar: null,
    });
  });
});
