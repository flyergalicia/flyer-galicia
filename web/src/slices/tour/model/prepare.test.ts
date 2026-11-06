import { describe, expect, it, vi } from "vitest";
import { createPlaceDesk, type PlaceHolder } from "@/shared/lib/places/place-desk.ts";
import {
  leaveScreen,
  prepareScreen,
  TO_BULK,
  TO_CATEGORY,
  TO_HISTORY,
  TO_HUNTER,
  TO_HUNTER_OTHERS,
  TO_INDIVIDUAL,
  TO_MENU,
  TO_OTHERS,
  TO_PROMOTIONS,
  toCommercial,
  type TourWays,
} from "./prepare.ts";

/** What each step asks, in order: tabs of the shell and places of the screens. */
function ways(commercialOnPage = false) {
  const desk = createPlaceDesk();
  const asked: string[] = [];
  const ask = desk.ask;
  const root = {
    querySelector: (selector: string) =>
      commercialOnPage && selector.includes("commercial-tabs") ? {} : null,
  };
  const result: TourWays = {
    goToTab: (tab) => {
      asked.push(`tab:${tab}`);
    },
    desk: {
      ...desk,
      ask: (holder: PlaceHolder, place: string) => {
        asked.push(`${holder}:${place}`);
        ask(holder, place);
      },
    },
    root,
  };
  return { ways: result, asked };
}

describe("preparing the screen", () => {
  it("Individual, Masivo, Historial and Flyer Rubros close the menus and change tab and panel", () => {
    for (const [prepare, tab, panel] of [
      [TO_INDIVIDUAL, "flyer", "individual"],
      [TO_BULK, "flyer", "masivo"],
      [TO_HISTORY, "flyer", "historial"],
      [TO_CATEGORY, "rubros", "individual"],
    ] as const) {
      const { ways: around, asked } = ways();
      prepareScreen(prepare, around);
      expect(asked).toEqual([
        "flyer-others:closed",
        "user-menu:closed",
        `tab:${tab}`,
        `flyer-editor:${panel}`,
      ]);
    }
  });

  it("«Otros» goes to Individual and opens it", () => {
    const { ways: around, asked } = ways();
    prepareScreen(TO_OTHERS, around);
    expect(asked).toEqual([
      "user-menu:closed",
      "tab:flyer",
      "flyer-editor:individual",
      "flyer-others:open",
    ]);
  });

  it("the name menu opens from the flyer editor, with «Otros» closed", () => {
    const { ways: around, asked } = ways();
    prepareScreen(TO_MENU, around);
    expect(asked).toEqual(["tab:flyer", "flyer-others:closed", "user-menu:open"]);
  });

  it("the screen of the Hunter opens or closes its «Otros»", () => {
    const closed = ways();
    prepareScreen(TO_HUNTER, closed.ways);
    expect(closed.asked).toEqual(["user-menu:closed", "tab:hunter", "hunter-others:closed"]);
    const open = ways();
    prepareScreen(TO_HUNTER_OTHERS, open.ways);
    expect(open.asked).toEqual(["user-menu:closed", "tab:hunter", "hunter-others:open"]);
  });

  it("Promociones goes back to Buscar only if Activas has nothing listed", () => {
    const { ways: around, asked } = ways();
    prepareScreen(TO_PROMOTIONS, around);
    expect(asked).toEqual([
      "flyer-others:closed",
      "user-menu:closed",
      "tab:promos",
      "promotions:search-unless-results",
    ]);
  });

  it("Gestiones goes to its solapa only once its code is on the page", () => {
    const coming = ways(false);
    prepareScreen(toCommercial("agenda"), coming.ways);
    expect(coming.asked).toEqual(["flyer-others:closed", "user-menu:closed", "tab:gestiones"]);

    const there = ways(true);
    prepareScreen(toCommercial("agenda"), there.ways);
    expect(there.asked.at(-1)).toBe("commercial-actions:agenda");

    const header = ways(true);
    prepareScreen(toCommercial(null), header.ways);
    expect(header.asked.at(-1)).toBe("tab:gestiones");
  });

  it("works with nobody holding places, as a screen alone in a test", () => {
    const goToTab = vi.fn<(tab: string) => void>();
    prepareScreen(TO_OTHERS, { goToTab, desk: null });
    leaveScreen({ goToTab, desk: null });
    expect(goToTab).toHaveBeenCalledWith("flyer");
  });
});

describe("leaving", () => {
  it("leaves no menu open, and goes back to Individual of the main screen", () => {
    const { ways: around, asked } = ways();
    leaveScreen(around);
    expect(asked).toEqual([
      "user-menu:closed",
      "flyer-others:closed",
      "tab:flyer",
      "flyer-editor:individual",
    ]);
  });
});
