import { describe, expect, it } from "vitest";
import { databasePanes } from "@/shared/domain/company-registry/database-panes.ts";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { NO_TITLES } from "@/shared/domain/screen-titles.ts";
import type { PermissionKey } from "@/shared/session/index.ts";
import { headerTabsOf } from "./header-tabs.ts";
import { tabOrder } from "./resolve-view.ts";
import { type AppSearchEntry, type SearchSources, searchEntries } from "./search-entries.ts";
import type { MenuRules } from "./view-rules.ts";

const OPTIONS = sanitizeFlyerOptions([
  { n: 1, nombre: "Flyer Galicia" },
  { n: 9, nombre: "Combustible" },
  { n: 4, nombre: "Rubros YPF", solapa: "rubros" },
]);

function rules(allowed: readonly string[], others: Partial<MenuRules> = {}): MenuRules {
  return {
    can: (key) => allowed.includes(key),
    isHunter: false,
    isLeader: false,
    isAdminNow: false,
    commercialActionsOn: false,
    hasSharedDesign: false,
    waiting: () => 0,
    flyerOptions: OPTIONS,
    ...others,
  };
}

function sources(who: MenuRules, others: Partial<SearchSources> = {}): SearchSources {
  return {
    tabs: headerTabsOf(tabOrder(null), who, NO_TITLES),
    activeId: "flyer",
    rules: who,
    role: "asesor",
    flyerOptions: OPTIONS,
    optionOnScreen: 9,
    databasePanes: databasePanes((key: PermissionKey) => who.can(key), 0),
    dark: false,
    ...others,
  };
}

function ids(entries: readonly AppSearchEntry[]): string[] {
  return entries.map(({ id }) => id);
}

const ADVISOR = rules(["opcion_9", "promos_buscar", "estudio", "padron_buscar"]);
const ADMIN = rules(
  ["opcion_1", "opcion_9", "opcion_4", "promos_buscar", "benchmark", "notas", "padron_buscar"],
  { isAdminNow: true },
);

describe("what an advisor finds", () => {
  it("is what they have on screen, with the same names as today", () => {
    const entries = searchEntries(sources(ADVISOR));

    expect(ids(entries)).toEqual([
      "app:flyer",
      "app:estudio",
      "app:promos",
      "tab:individual",
      "tab:masivo",
      "tab:historial",
      "fn:logos",
      "fn:otros",
      "pro:buscar",
      "pro:activas",
      "bd:empresas",
      "bd:propuestas",
      "fn:tema",
      "fn:clave",
      "fn:tutorial",
      "fn:salir",
    ]);
    expect(entries.find(({ id }) => id === "app:flyer")).toMatchObject({
      group: "Pantallas",
      title: "Flyer Galicia",
      current: true,
      keywords: "armador inicio",
    });
    expect(entries.find(({ id }) => id === "pro:activas")).toMatchObject({
      title: "Activas",
      move: { kind: "place", tab: "promos", holder: "promotions", place: "active" },
    });
  });

  it("has no list of flyers with only one, and no sheet of the panel", () => {
    const groups = new Set(searchEntries(sources(ADVISOR)).map(({ group }) => group));
    expect(groups.has("Flyers")).toBe(false);
    expect(["Admin", "Data", "Config"].some((group) => groups.has(group))).toBe(false);
  });

  it("goes to the places of the editor on the tab of the flyer it has", () => {
    const onRubros = searchEntries(sources(ADVISOR, { optionOnScreen: 4 }));
    expect(onRubros.find(({ id }) => id === "fn:logos")?.move).toEqual({
      kind: "place",
      tab: "rubros",
      holder: "flyer-editor",
      place: "logos",
    });
    const before = searchEntries(sources(ADVISOR, { optionOnScreen: null }));
    expect(before.find(({ id }) => id === "tab:masivo")?.move).toMatchObject({ tab: "flyer" });
  });

  it("names the theme it would go to, and does not remember leaving", () => {
    const dark = searchEntries(sources(ADVISOR, { dark: true }));
    expect(dark.find(({ id }) => id === "fn:tema")?.title).toBe("Modo claro");
    expect(dark.find(({ id }) => id === "fn:salir")).toMatchObject({
      forgotten: true,
      move: { kind: "sign-out" },
    });
  });
});

describe("what an administrator finds", () => {
  const entries = searchEntries(sources(ADMIN, { activeId: "rubros", optionOnScreen: 4 }));

  it("has every flyer, marking the one on screen, found also by the name of its tab", () => {
    const flyers = entries.filter(({ group }) => group === "Flyers");
    expect(flyers.map(({ title }) => title)).toEqual([
      "Flyer Galicia",
      "Rubros YPF",
      "Combustible",
    ]);
    expect(flyers.map(({ current }) => current)).toEqual([false, true, false]);
    expect(flyers[1]).toMatchObject({
      keywords: "Flyer Rubros",
      move: { kind: "place", tab: "rubros", holder: "flyer-editor", place: "option:4" },
    });
  });

  it("has every sheet of the panel, under its pillar, and Benchmark with its views", () => {
    const sheets = entries.filter(({ move }) => move.kind === "admin");
    expect(sheets).toHaveLength(15);
    expect(sheets.find(({ id }) => id === "adm:auditoria")).toMatchObject({
      group: "Admin",
      title: "Auditoría",
      keywords: "panel acciones log",
    });
    expect(sheets.find(({ id }) => id === "adm:cashback")?.keywords).toBe("panel ");
    expect(entries.filter(({ group }) => group === "Benchmark").map(({ title }) => title)).toEqual([
      "Resumen por rubro",
      "Cara a cara por marca",
      "Semana",
      "Por comercio",
      "Galicia vs otro banco",
      "Tarjetas y salas VIP",
    ]);
  });

  it("finds Base de datos before the panel, and does not change its own password there", () => {
    const order = ids(entries);
    expect(order.indexOf("bd:empresas")).toBeLessThan(order.indexOf("adm:varios"));
    expect(order).not.toContain("fn:clave");
    expect(order).toContain("fn:notas");
  });
});

function withActions(role: "hunter" | "lider"): MenuRules {
  return rules(["promos_buscar", "gestiones"], {
    isHunter: role === "hunter",
    isLeader: role === "lider",
    commercialActionsOn: true,
  });
}

describe("Gestiones people", () => {
  it("a hunter finds their screen and their solapas, without the editor", () => {
    const hunter = withActions("hunter");
    const entries = searchEntries(sources(hunter, { activeId: "hunter", role: "hunter" }));
    const titles = entries.map(({ title }) => title);

    expect(titles).toEqual(expect.arrayContaining(["Buscar flyer", "Mi agenda", "Tablero"]));
    expect(titles).not.toContain("Masivo");
    expect(entries.find(({ id }) => id === "ges:agenda")?.move).toEqual({
      kind: "place",
      tab: "gestiones",
      holder: "commercial-actions",
      place: "agenda",
    });
  });

  it("a leader finds the solapas of their team", () => {
    const leader = withActions("lider");
    const titles = searchEntries(sources(leader, { activeId: "gestiones", role: "lider" })).map(
      ({ title }) => title,
    );

    expect(titles).toContain("Agenda del equipo");
    expect(titles).not.toContain("Mis empresas");
  });
});
