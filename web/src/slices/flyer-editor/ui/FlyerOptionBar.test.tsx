import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { workspaceOnScreen } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { HOLD_TO_LIFT_MS } from "@/shared/lib/use-hold-reorder.ts";
import { ADVISOR, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { closeFloating } from "@/shared/ui/index.ts";
import { type Answer, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { useFavoriteFlyers } from "../model/use-favorite-flyers.ts";
import { flyerFiles, flyerShown, open } from "../testing/editor-on-screen.tsx";

const ACTIVE = (image: unknown) => ({ imageUrl: image, cfg: {} });

function manyFlyers(count: number) {
  const numbers = Array.from({ length: count }, (_, position) => position + 2);
  const { "_active9.json": active } = flyerFiles();
  return {
    "_opciones.json": {
      opts: numbers.map((n, orden) => ({
        n,
        nombre: `Flyer ${String(n)}`,
        solapa: "flyer",
        orden,
        ...(n === 3 ? { color: "#00ff00" } : {}),
      })),
    },
    "_facultades.json": {
      roles: {
        asesor: Object.fromEntries([
          ["opcion_1", false],
          ...numbers.map((n) => [`opcion_${String(n)}`, true]),
        ]),
      },
    },
    ...Object.fromEntries(
      numbers.flatMap((n) => [
        [`_active${String(n)}.json`, ACTIVE(active.imageUrl)],
        [`_legal${String(n)}.json`, { text: "Legal" }],
      ]),
    ),
  };
}

async function openBar(count = 9, favorites: unknown = null, profiles?: Answer) {
  const opened = await open({
    files: manyFlyers(count),
    profile: { ...ADVISOR, flyer_fav: favorites },
    ...(profiles ? { tables: { profiles } } : {}),
  });
  await flyerShown();
  return opened;
}

const bar = () => page.getByTestId("flyer-options");
const others = () => page.getByTestId("other-flyers");
const list = () => page.getByTestId("other-flyers-list");
const names = () =>
  [...document.querySelectorAll('[data-testid="flyer-options"] button[data-option]')].map(
    ({ textContent }) => textContent,
  );
const star = (option: number) =>
  page.elementLocator(document.querySelector(`[data-star="${String(option)}"]`) ?? document.body);
const rowsOfList = () =>
  [...document.querySelectorAll('[data-testid="other-flyer"]')].map(
    ({ textContent }) => textContent,
  );

const refusingStars: Answer = ({ method }) =>
  method === "PATCH"
    ? jsonResponse({ message: "No" }, 500)
    : jsonResponse({ ...ADVISOR, flyer_fav: null });

function savedFavorites({ network }: Awaited<ReturnType<typeof open>>["harness"]) {
  return network
    .to("/rest/v1/profiles", "PATCH")
    .map(({ body }) => body)
    .filter((body) => Reflect.has(Object(body), "flyer_fav"));
}

beforeEach(async () => {
  localStorage.clear();
  await page.viewport(1366, 800);
});

describe("with four flyers or fewer", () => {
  it("they are all in sight, without Otros", async () => {
    await openBar(4);
    expect(names()).toEqual(["Flyer 2", "Flyer 3", "Flyer 4", "Flyer 5"]);
    expect(others().query()).toBeNull();
    expect(page.getByTestId("favorite-place").query()).toBeNull();
  });
});

describe("with more", () => {
  it("the first two, the place of the favorite and Otros", async () => {
    await openBar();
    expect(names()).toEqual(["Flyer 2", "Flyer 3"]);
    await expect.element(page.getByTestId("favorite-place")).toHaveTextContent("Tu favorito");
    await expect.element(others()).toHaveAttribute("data-others", "4,5,6,7,8,9,10");
  });

  it("the place of the favorite opens the list too", async () => {
    await openBar();
    await page.getByTestId("favorite-place").click();
    await expect.element(list()).toBeVisible();
    await page.getByTestId("favorite-place").click();
    await expect.element(list()).not.toBeInTheDocument();
  });

  it("the list has a search box from seven on, ready to type, that ignores accents and capitals", async () => {
    await openBar();
    await others().click();
    expect(rowsOfList()).toHaveLength(7);
    const search = list().getByRole("searchbox");
    await expect.element(search).toHaveFocus();
    await search.fill("flyer 7");
    expect(rowsOfList()).toEqual(["Flyer 7"]);
    await search.fill("no está");
    await expect.element(list()).toMatchTextContent(/No hay flyers con ese nombre\./);
    await userEvent.keyboard("{Enter}");
    // Enter with nothing found stays.
    await expect.element(list()).toBeVisible();
  });

  it("Enter chooses the first one found, and Otros takes its name and color", async () => {
    await openBar();
    await others().click();
    await list().getByRole("searchbox").fill("flyer 7");
    await userEvent.keyboard("{Enter}");
    await expect.element(list()).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(workspaceOnScreen().getState().slot.option).toBe(7);
    });
    await expect.element(others()).toHaveTextContent("Flyer 7");
    await expect.element(others()).toHaveAttribute("aria-pressed", "true");
    await expect.element(others()).toHaveAttribute("title", "Flyer 7 (de «Otros»)");
  });

  it("another key on the search box stays there", async () => {
    await openBar();
    await others().click();
    await userEvent.keyboard("x");
    await expect.element(list()).toBeVisible();
  });

  it("with six or fewer there is no search box", async () => {
    await openBar(6);
    await others().click();
    expect(list().getByRole("searchbox").query()).toBeNull();
    expect(rowsOfList()).toEqual(["Flyer 4", "Flyer 5", "Flyer 6", "Flyer 7"]);
    await list().getByText("Flyer 5").click();
    await vi.waitFor(() => {
      expect(workspaceOnScreen().getState().slot.option).toBe(5);
    });
    await expect.element(list()).not.toBeInTheDocument();
  });

  it("closes with Escape, on pressing outside and when the window changes size", async () => {
    await openBar();
    await others().click();
    await userEvent.keyboard("{Escape}");
    await expect.element(list()).not.toBeInTheDocument();

    await others().click();
    await page.getByTestId("flyer-preview").click({ position: { x: 5, y: 5 } });
    await expect.element(list()).not.toBeInTheDocument();

    await others().click();
    window.dispatchEvent(new Event("resize"));
    await expect.element(list()).not.toBeInTheDocument();
  });

  it("closes when the search of screens opens", async () => {
    await openBar();
    await others().click();
    await expect.element(list()).toBeVisible();

    closeFloating();

    await expect.element(list()).not.toBeInTheDocument();
  });

  it("goes along with the bar when the page moves, and pressing inside leaves it open", async () => {
    await openBar();
    await others().click();
    const before = list().element().getBoundingClientRect().top;
    document.dispatchEvent(new Event("scroll"));
    list().element().dispatchEvent(new Event("scroll"));
    await list()
      .getByText(/Tocá la/)
      .click();
    await expect.element(list()).toBeVisible();
    expect(list().element().getBoundingClientRect().top).toBe(before);
  });
});

interface BarRules {
  readonly split: (favorites: number[], enabled: number[]) => unknown;
  readonly optionsOfTab: (tab: string) => readonly number[];
  readonly afterStar: (favorites: number[], option: number) => readonly number[];
}

function isBarRules(value: unknown): value is BarRules {
  return value instanceof Object && "split" in value;
}

function rules(): BarRules {
  const read: unknown = window["__flyerProbe"]?.["flyerBar"]?.();
  if (isBarRules(read)) return read;
  throw new Error("The bar is not on screen");
}

describe("what a test can ask of the rules of the bar", () => {
  it("answers without changing anything", async () => {
    await openBar();
    expect(rules().split([99], [2, 3, 4, 5, 6])).toEqual({ favorite: null, others: 3 });
    expect(rules().split([], [2, 3])).toBeNull();
    expect(rules().optionsOfTab("flyer")).toContain(2);
    expect(rules().optionsOfTab("nada")).toEqual([]);
    expect(rules().afterStar([5], 6)).toEqual([6]);
  });
});

describe("the star", () => {
  it("leaves it in sight, stays in the account, and the list stays open", async () => {
    const { harness } = await openBar();
    await others().click();
    await star(5).click();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("«Flyer 5» quedó como tu favorito.");
    expect(names()).toEqual(["Flyer 2", "Flyer 3", "Flyer 5"]);
    await expect.element(list()).toBeVisible();
    await expect.element(star(5)).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => {
      expect(savedFavorites(harness)).toEqual([{ flyer_fav: [5] }]);
    });
  });

  it("on the favorite, it takes it out", async () => {
    const { harness } = await openBar(9, [5]);
    expect(names()).toEqual(["Flyer 2", "Flyer 3", "Flyer 5"]);
    await others().click();
    expect(rowsOfList(), "it is in the list too, for its star").toContain("Flyer 5");
    await star(5).click();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Sacaste «Flyer 5» de tu favorito.");
    await expect.element(page.getByTestId("favorite-place")).toBeVisible();
    await vi.waitFor(() => {
      expect(savedFavorites(harness)).toEqual([{ flyer_fav: [] }]);
    });
  });

  it("if the account does not take it, it goes back and it says so", async () => {
    await openBar(9, null, refusingStars);
    await others().click();
    await star(5).click();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("No se pudo guardar tu favorito. Probá de nuevo.");
    await expect.element(page.getByTestId("favorite-place")).toBeVisible();
  });

  it("the favorite chooses like the others, and says it is one", async () => {
    await openBar(9, [5]);
    const favorite = page.elementLocator(
      document.querySelector("[data-favorite]") ?? document.body,
    );
    expect(favorite.element().getAttribute("title")).toMatch(/tu favorito/);
    await favorite.click();
    await vi.waitFor(() => {
      expect(workspaceOnScreen().getState().slot.option).toBe(5);
    });
    await expect.element(favorite).toHaveAttribute("aria-pressed", "true");
    await expect.element(others()).toHaveTextContent("Otros");
  });

  it("a favorite that is no longer enabled does not count", async () => {
    await openBar(9, [99]);
    await expect.element(page.getByTestId("favorite-place")).toBeVisible();
    expect(names()).toEqual(["Flyer 2", "Flyer 3"]);
  });
});

function adminOpen() {
  const files = manyFlyers(3);
  const { "_opciones.json": list_ } = files;
  return open({
    profile: { ...ADVISOR, role: "admin" },
    files: {
      ...files,
      "_opciones.json": { opts: [{ n: 1, nombre: "Uno", orden: -1 }, ...list_.opts] },
      "_active.json": files["_active2.json"],
      "_legal.json": { text: "Legal" },
    },
  });
}

async function press(name: string, times: number): Promise<void> {
  if (times === 0) return;
  await bar().getByRole("button", { name, exact: true }).click();
  await press(name, times - 1);
}

const field = () => page.getByRole("textbox", { name: "Nombre del flyer" });
const savedList = ({ network }: Awaited<ReturnType<typeof adminOpen>>["harness"]) =>
  network.to("/storage/v1/object/flyers/_opciones.json", "POST");

describe("in the hands of an administrator", () => {
  it("four presses on the same one let it be renamed; Enter saves it for everybody", async () => {
    const { harness } = await adminOpen();
    await flyerShown();
    await press("Flyer 3", 3);
    expect(field().query()).toBeNull();
    await press("Flyer 3", 1);
    await expect.element(field()).toHaveValue("Flyer 3");
    await field().fill("  Nuevo <b>  ");
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("status")).toHaveTextContent("Opción renombrada: Nuevo b");
    expect(names()).toContain("Nuevo b");
    expect(savedList(harness)).toHaveLength(1);
  });

  it("presses on different ones or far apart do not count", async () => {
    await adminOpen();
    await flyerShown();
    await press("Flyer 3", 2);
    await press("Flyer 2", 2);
    await press("Flyer 3", 2);
    expect(field().query()).toBeNull();
  });

  it("Escape leaves it as it was, and leaving the field saves", async () => {
    const { harness } = await adminOpen();
    await flyerShown();
    await press("Flyer 3", 4);
    await field().fill("No va");
    await userEvent.keyboard("{Escape}");
    expect(names()).toContain("Flyer 3");
    expect(savedList(harness)).toEqual([]);

    await press("Flyer 3", 4);
    await field().fill("Sí va");
    await page.getByRole("tab", { name: "Masivo" }).click();
    await expect.element(page.getByRole("status")).toHaveTextContent("Opción renombrada: Sí va");
  });

  it("the same name, or none, saves nothing; typing there chooses nothing", async () => {
    const { harness } = await adminOpen();
    await flyerShown();
    await press("Flyer 3", 4);
    const { slot } = workspaceOnScreen().getState();
    await field().click();
    await userEvent.keyboard("x{Backspace}");
    await userEvent.keyboard("{Enter}");
    await press("Flyer 3", 4);
    await field().fill("   ");
    await userEvent.keyboard("{Enter}");
    expect(savedList(harness)).toEqual([]);
    expect(names()).toContain("Flyer 3");
    expect(slot).toBeDefined();
  });

  it("if the list cannot be saved it says so", async () => {
    const { harness } = await adminOpen();
    await flyerShown();
    vi.spyOn(harness.backend.bucket, "upload").mockResolvedValue({
      ok: false,
      error: { kind: "transient", status: null, message: "Sin red" },
    });
    await press("Flyer 3", 4);
    await field().fill("Otra");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Error al guardar las opciones: Sin red");
  });

  it(
    "holding one lifts it, dragging changes the order, and everybody gets it",
    { timeout: 20_000 },
    async () => {
      const { harness } = await adminOpen();
      await flyerShown();
      const tab = (name: string) => bar().getByRole("button", { name, exact: true }).element();
      const first = tab("Uno").getBoundingClientRect();
      const last = tab("Flyer 4").getBoundingClientRect();
      await userEvent.hover(bar().getByRole("button", { name: "Uno", exact: true }));
      tab("Uno").dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "mouse",
          clientX: first.left + 5,
          clientY: first.top + 5,
        }),
      );
      await vi.waitFor(
        () => {
          expect(page.getByRole("status").element().textContent).toBe(
            "Arrastrá para cambiar el orden y soltá",
          );
        },
        { timeout: HOLD_TO_LIFT_MS + 2000 },
      );
      tab("Uno").dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: last.right - 2,
          clientY: last.top + 5,
        }),
      );
      await vi.waitFor(() => {
        expect(names().at(-1)).toBe("Uno");
      });
      tab("Uno").dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      await expect
        .element(page.getByRole("status"))
        .toHaveTextContent("Orden de las opciones guardado");
      expect(savedList(harness)).toHaveLength(1);
    },
  );

  it("whoever is not one does not rename", async () => {
    await openBar(4);
    await press("Flyer 3", 4);
    expect(field().query()).toBeNull();
  });
});

function Stars() {
  const { favorites, toggle } = useFavoriteFlyers();
  return (
    <button
      type="button"
      onClick={() => {
        void toggle(5);
      }}
    >
      {`Favoritos: ${String(favorites.length)}`}
    </button>
  );
}

describe("with nobody in the session", () => {
  it("a star does nothing, and there is nothing to save", async () => {
    const harness = createAppHarness();
    const screen = await render(harness.wrap(<Stars />));
    await screen.getByRole("button").click();
    await expect.element(screen.getByRole("button")).toHaveTextContent("Favoritos: 0");
    expect(harness.network.to("/rest/v1/profiles", "PATCH")).toEqual([]);
  });
});
