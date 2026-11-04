import { describe, expect, it } from "vitest";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { firstView, resolveView, tabOrder } from "./resolve-view.ts";
import type { ViewRules } from "./view-rules.ts";

const OPTIONS = sanitizeFlyerOptions([
  { n: 1 },
  { n: 2, solapa: "rubros" },
  { n: 3, solapa: "sueldo" },
]);

function rules(allowed: readonly string[] = [], others: Partial<ViewRules> = {}): ViewRules {
  return {
    can: (key) => allowed.includes(key),
    isHunter: false,
    isLeader: false,
    commercialActionsOn: false,
    flyerOptions: OPTIONS,
    ...others,
  };
}

describe("asking for a screen", () => {
  it("gets it if it is there", () => {
    expect(resolveView("promos", rules(["promos_buscar"]))).toBe("promos");
    expect(resolveView("rubros", rules(["opcion_2"]))).toBe("rubros");
    expect(resolveView("flyer", rules())).toBe("flyer");
  });

  it("without the permission it goes to the flyer editor", () => {
    expect(resolveView("promos", rules())).toBe("flyer");
    expect(resolveView("benchmark", rules())).toBe("flyer");
    expect(resolveView("estudio", rules())).toBe("flyer");
    expect(resolveView("gestiones", rules())).toBe("flyer");
  });

  it("a tab of the flyer editor without options goes to the main one", () => {
    expect(resolveView("rubros", rules())).toBe("flyer");
    expect(resolveView("sueldo", rules(["opcion_2"]))).toBe("flyer");
  });

  it("an unknown one goes to the flyer editor", () => {
    expect(resolveView("inventada", rules())).toBe("flyer");
  });

  it("a hunter never reaches the flyer editor, and has their screen", () => {
    const hunter = rules(["promos_buscar", "opcion_2"], { isHunter: true });

    expect(resolveView("flyer", hunter)).toBe("hunter");
    expect(resolveView("rubros", hunter)).toBe("hunter");
    expect(resolveView("inventada", hunter)).toBe("hunter");
    expect(resolveView("promos", hunter)).toBe("promos");
  });

  it("nor does a leader: theirs is Gestiones", () => {
    const leader = rules([], { isLeader: true, commercialActionsOn: true });

    expect(resolveView("flyer", leader)).toBe("gestiones");
    expect(resolveView("gestiones", leader)).toBe("gestiones");
  });

  it("a leader with Gestiones off still goes there, as today", () => {
    expect(resolveView("gestiones", rules([], { isLeader: true }))).toBe("gestiones");
  });
});

describe("the first screen", () => {
  it("is the first of the tabs this person sees, in the order that was left", () => {
    const allowed = rules(["promos_buscar"]);

    expect(firstView(allowed, null)).toBe("flyer");
    expect(firstView(allowed, ["estudio", "promos", "flyer"])).toBe("promos");
  });

  it("a hunter opens in the first of theirs", () => {
    const hunter = rules(["promos_buscar"], { isHunter: true });

    expect(firstView(hunter, null)).toBe("promos");
    expect(firstView(hunter, ["hunter"])).toBe("hunter");
  });

  it("whoever has nothing still ends up somewhere", () => {
    expect(firstView(rules([], { isLeader: true }), null)).toBe("gestiones");
  });
});

describe("the order of the tabs", () => {
  it("has all of them, the ones moved first", () => {
    expect(tabOrder(null)).toEqual([
      "flyer",
      "rubros",
      "sueldo",
      "estudio",
      "promos",
      "benchmark",
      "hunter",
      "gestiones",
    ]);
    expect(tabOrder(["promos"])[0]).toBe("promos");
  });
});
