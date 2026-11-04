import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import type { MenuRules } from "./view-rules.ts";
import { APP_VIEWS, MENU_WINDOWS_ABOVE, MENU_WINDOWS_BELOW, viewById } from "./views.ts";

function rules(allowed: readonly string[] = [], others: Partial<MenuRules> = {}): MenuRules {
  return {
    can: (key) => allowed.includes(key),
    isHunter: false,
    isLeader: false,
    isAdminNow: false,
    commercialActionsOn: false,
    flyerOptions: sanitizeFlyerOptions([
      { n: 1 },
      { n: 2, solapa: "rubros" },
      { n: 3, solapa: "sueldo" },
    ]),
    ...others,
  };
}

function seenBy(who: MenuRules): readonly string[] {
  return APP_VIEWS.filter(({ visible }) => visible(who)).map(({ id }) => id);
}

const ALL_WINDOWS = [...MENU_WINDOWS_ABOVE, ...MENU_WINDOWS_BELOW];

function windowsSeenBy(who: MenuRules): readonly string[] {
  return ALL_WINDOWS.filter(({ visible }) => visible(who)).map(({ id }) => id);
}

describe("the tabs each person has", () => {
  it("an advisor with nothing on has only the flyer editor", () => {
    expect(seenBy(rules())).toEqual(["flyer"]);
  });

  it("each one comes with its permission", () => {
    expect(seenBy(rules(["estudio", "promos_buscar", "benchmark"]))).toEqual([
      "flyer",
      "estudio",
      "promos",
      "benchmark",
    ]);
  });

  it("the tabs of the flyer editor come with an option of theirs", () => {
    expect(seenBy(rules(["opcion_2"]))).toEqual(["flyer", "rubros"]);
    expect(seenBy(rules(["opcion_3"]))).toEqual(["flyer", "sueldo"]);
  });

  it("a hunter has no flyer editor, even with its options", () => {
    expect(seenBy(rules(["opcion_2", "estudio"], { isHunter: true }))).toEqual(["hunter"]);
  });

  it("a leader has neither, and Gestiones comes with its switch", () => {
    expect(seenBy(rules(["estudio"], { isLeader: true }))).toEqual([]);
    expect(seenBy(rules([], { isLeader: true, commercialActionsOn: true }))).toEqual(["gestiones"]);
  });
});

describe("what the name menu opens", () => {
  it("an administrator does not change the password there", () => {
    expect(windowsSeenBy(rules([], { isAdminNow: true }))).not.toContain("password");
    expect(windowsSeenBy(rules())).toContain("password");
  });

  it("the notes come with their permission", () => {
    expect(windowsSeenBy(rules())).not.toContain("notes");
    expect(windowsSeenBy(rules(["notas"]))).toContain("notes");
  });

  it("the database comes with either of its two", () => {
    expect(windowsSeenBy(rules())).not.toContain("database");
    expect(windowsSeenBy(rules(["padron_buscar"]))).toContain("database");
    expect(windowsSeenBy(rules(["asesores_guardados"]))).toContain("database");
  });

  it("the proposals are of a hunter who can propose", () => {
    expect(windowsSeenBy(rules(["proponer_oficiales"]))).not.toContain("proposals");
    expect(windowsSeenBy(rules([], { isHunter: true }))).not.toContain("proposals");
    expect(windowsSeenBy(rules(["proponer_oficiales"], { isHunter: true }))).toContain("proposals");
  });

  it("the tutorial is there for everybody", () => {
    expect(windowsSeenBy(rules())).toContain("tour");
  });
});

describe("what is not there yet", () => {
  it("each tab and window knows how to load", async () => {
    const views = await Promise.all(APP_VIEWS.map(({ load }) => load()));
    const windows = await Promise.all(ALL_WINDOWS.map(({ load }) => load()));

    expect(views.every(({ default: screen }) => typeof screen === "function")).toBe(true);
    expect(windows.every(({ default: window }) => typeof window === "function")).toBe(true);
  });

  it("a pending screen draws nothing", async () => {
    const { default: Pending } = await APP_VIEWS[0]!.load();

    const screen = await render(<Pending isActive tabId="flyer" />);

    expect(screen.container.textContent).toBe("");
  });

  it("a pending window closes by itself", async () => {
    const tour = ALL_WINDOWS.find(({ id }) => id === "tour")!;
    const { default: Pending } = await tour.load();
    const closed: true[] = [];

    await render(
      <Pending
        onClose={() => {
          closed.push(true);
        }}
      />,
    );

    expect(closed).toEqual([true]);
  });

  it("finds a view by its name", () => {
    expect(viewById("promos")?.screen).toBe("promotions");
    expect(viewById("inventada")).toBeUndefined();
  });
});
