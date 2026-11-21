// The tutorial over the whole app, as a person uses it: from the name menu, with the keyboard and the
// buttons of its globe, over the real screens.
import "@/shared/ui/tokens/tokens.css";
import "@/shared/ui/tokens/base.css";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { LOGO_A, paintedFlyer } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { type AppAnswers, ADVISOR, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { INVENTED_USER, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { AppGate } from "../AppGate.tsx";

const FLYER = paintedFlyer([LOGO_A]);
const FILES = {
  "_opciones.json": { opts: [{ n: 9, nombre: "Combustible", solapa: "flyer" }] },
  "_active9.json": { imageUrl: FLYER, cfg: {} },
  "_legal9.json": { text: "Legal" },
};

const ADVISOR_STEPS = [
  "Empezá por la empresa",
  "Datos del oficial",
  "Hasta 4 asesores",
  "Cashback",
  "Texto legal",
  "El botón B: negrita sin asteriscos",
  "Vista previa",
  "Verlo en grande",
  "Descargar",
  "Restaurar",
  "«Otros»: compartir y más",
  "Muchas empresas de una vez",
  "Subí el Excel y generá",
  "Lo que generaste en esta sesión",
  "Modo oscuro",
  "El color de la app",
  "Cambiar mi clave",
  "Ver tutorial",
];

async function open(faculties: Readonly<Record<string, boolean>> = {}, answers: AppAnswers = {}) {
  const harness = createAppHarness({
    ...answers,
    profile: ADVISOR,
    files: {
      ...FILES,
      "_facultades.json": { roles: { asesor: { opcion_1: false, opcion_9: true, ...faculties } } },
    },
    tables: {
      padron_empresas: () => jsonResponse([]),
      asesores_guardados: () => jsonResponse([]),
    },
  });
  harness.storeSession();
  const screen = await render(harness.wrap(<AppGate />));
  await expect.element(screen.getByRole("banner")).toBeVisible();
  return screen;
}

const tip = () => page.getByTestId("tour-tip");
const title = () => tip().getByRole("heading", { level: 4 });
const nameMenu = () => page.getByRole("menu", { name: "Tu cuenta" });
/** Whether «Otros» of the flyer editor is open; its panel may be hidden behind another. */
function othersOpen(): string | null | undefined {
  return document
    .querySelector('[data-testid="other-actions"] > button')
    ?.getAttribute("aria-expanded");
}

async function startFromTheMenu() {
  await page.getByRole("button", { name: /^Menú de / }).click();
  await page.getByRole("menuitem", { name: "Ver tutorial" }).click();
  await expect.element(title()).toHaveTextContent("Empezá por la empresa");
}

/** Where the light is, against the element it talks about. */
function lightAround(selector: string) {
  const element = document.querySelector(selector);
  const light = document.querySelector('[data-testid="tour-spotlight"]');
  if (!element || !light) return null;
  const a = element.getBoundingClientRect();
  const b = light.getBoundingClientRect();
  return [b.left - a.left, b.top - a.top, b.right - a.right, b.bottom - a.bottom].map(Math.round);
}

/** The light is where the person can see it: the step scrolled its element into sight. */
function lightInTheWindow(): boolean {
  const light = document.querySelector('[data-testid="tour-spotlight"]')?.getBoundingClientRect();
  if (!light) return false;
  return light.top >= -6 && light.bottom <= window.innerHeight + 6;
}

async function next(expected: string) {
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(title()).toHaveTextContent(expected);
}

const nothingMore = () => Promise.resolve();

/** Step by step with the arrow, looking at what each one has to show. */
async function walk(
  titles: readonly string[],
  look: (title: string) => Promise<void> = nothingMore,
): Promise<string[]> {
  const [first, ...rest] = titles;
  if (first === undefined) return [];
  await next(first);
  await look(first);
  return [first, ...(await walk(rest, look))];
}

beforeEach(async () => {
  localStorage.clear();
  await page.viewport(1366, 800);
});

afterEach(() => {
  localStorage.clear();
});

describe("opening it", () => {
  it("is in the name menu for everybody, and starts on the company, lit", async () => {
    await open();
    await startFromTheMenu();

    await expect.element(nameMenu()).not.toBeInTheDocument();
    await expect.element(tip().getByTestId("tour-count")).toHaveTextContent("1 / 18");
    await expect.poll(() => lightAround('[data-testid="company-name"]')).toEqual([-6, -6, 6, 6]);
    await expect.element(tip().getByRole("button", { name: "← Anterior" })).toBeDisabled();
  });

  it("over it the search of screens does not open: it is like a window", async () => {
    await open();
    await startFromTheMenu();

    await userEvent.keyboard("{Control>}k{/Control}");

    await expect
      .element(page.getByText("Cerrá la ventana abierta para usar el buscador."))
      .toBeVisible();
    await expect
      .element(page.getByRole("dialog", { name: "Buscador de pantallas" }))
      .not.toBeInTheDocument();
  });
});

describe("by itself", () => {
  it("with its faculty it opens a moment after entering, and asking for it again starts over", async () => {
    await open({ tutorial_auto: true });
    await expect.element(title()).toHaveTextContent("Empezá por la empresa");
    await tip().getByRole("button", { name: "Tu menú" }).click();
    await expect.element(title()).toHaveTextContent("Modo oscuro");
    await walk(["El color de la app", "Cambiar mi clave", "Ver tutorial"]);

    // The item it lights is in the hole of the veil: touching it asks for the tutorial again.
    await page.getByRole("menuitem", { name: "Ver tutorial" }).click();

    await expect.element(title()).toHaveTextContent("Empezá por la empresa");
    await expect.element(tip().getByTestId("tour-count")).toHaveTextContent("1 / 18");
    await expect.element(nameMenu()).not.toBeInTheDocument();
  });
});

describe("by itself, over one already open", () => {
  it("does not start it over: the person goes on where they are", async () => {
    await open({ tutorial_auto: true });
    // Before the start by itself, the person opens it and moves on.
    await page.getByRole("button", { name: /^Menú de / }).click();
    await page.getByRole("menuitem", { name: "Ver tutorial" }).click();
    await expect.element(title()).toHaveTextContent("Empezá por la empresa");
    await next("Datos del oficial");

    await new Promise((done) => setTimeout(done, 1500));

    await expect.element(title()).toHaveTextContent("Datos del oficial");
  });
});

describe("each step", () => {
  it("puts its element in sight, so none of an advisor is left out", async () => {
    await open();
    await startFromTheMenu();
    const checks: Readonly<Record<string, () => Promise<void>>> = {
      "«Otros»: compartir y más": async () => {
        await expect.poll(othersOpen).toBe("true");
      },
      "Muchas empresas de una vez": async () => {
        await expect.poll(othersOpen).toBe("false");
      },
      "Modo oscuro": async () => {
        await expect.element(nameMenu()).toBeVisible();
      },
    };

    const seen = await walk(ADVISOR_STEPS.slice(1), async (shown) => {
      await expect.poll(lightInTheWindow, { message: shown }).toBe(true);
      await (checks[shown] ?? nothingMore)();
    });

    expect([ADVISOR_STEPS[0], ...seen]).toEqual(ADVISOR_STEPS);
    await expect.element(tip().getByRole("button", { name: "Terminar ✓" })).toBeVisible();
  });

  it("with Base de datos and the notes, lights each item of the open menu", async () => {
    await open({ padron_buscar: true, notas: true });
    await startFromTheMenu();
    await tip().getByRole("button", { name: "Tu menú" }).click();

    await expect.element(title()).toHaveTextContent("Base de datos");
    await expect.element(nameMenu()).toBeVisible();
    await expect
      .poll(() => lightAround('[role="menu"] [data-item="database"]'))
      .toEqual([-6, -6, 6, 6]);
    await next("Bloc de notas");
    await expect
      .poll(() => lightAround('[role="menu"] [data-item="notes"]'))
      .toEqual([-6, -6, 6, 6]);
  });
});

describe("the keyboard and the buttons", () => {
  it("move with the arrows and with Anterior / Siguiente, and the chips go to their chapter", async () => {
    await open();
    await startFromTheMenu();

    await next("Datos del oficial");
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(title()).toHaveTextContent("Empezá por la empresa");
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(title()).toHaveTextContent("Empezá por la empresa");

    await tip().getByRole("button", { name: "Siguiente →" }).click();
    await expect.element(title()).toHaveTextContent("Datos del oficial");
    await tip().getByRole("button", { name: "← Anterior" }).click();
    await expect.element(title()).toHaveTextContent("Empezá por la empresa");

    await tip().getByRole("button", { name: "Omitir capítulo" }).click();
    await expect.element(title()).toHaveTextContent("Muchas empresas de una vez");
    await expect
      .element(tip().getByRole("button", { name: "Masivo" }))
      .toHaveAttribute("aria-current", "step");

    await tip().getByRole("button", { name: "Historial" }).click();
    await expect.element(title()).toHaveTextContent("Lo que generaste en esta sesión");
  });

  it("Escape ends it on any step: it is remembered, and «Otros» and the name menu are left closed", async () => {
    await open();
    await startFromTheMenu();
    await userEvent.keyboard("{ArrowRight}".repeat(10));
    await expect.element(title()).toHaveTextContent("«Otros»: compartir y más");
    await expect.poll(othersOpen).toBe("true");

    await userEvent.keyboard("{Escape}");

    await expect.element(tip()).not.toBeInTheDocument();
    await expect.poll(othersOpen).toBe("false");
    expect(localStorage.getItem(`fg_tour_done_${INVENTED_USER.id}`)).toBe("1");
  });

  it("its cross on a step of the menu leaves the menu closed, and the main screen", async () => {
    await open();
    await startFromTheMenu();
    await tip().getByRole("button", { name: "Tu menú" }).click();
    await expect.element(title()).toHaveTextContent("Modo oscuro");
    await expect.element(nameMenu()).toBeVisible();

    await tip().getByRole("button", { name: "Cerrar el tutorial" }).click();

    await expect.element(tip()).not.toBeInTheDocument();
    await expect.element(nameMenu()).not.toBeInTheDocument();
    await expect
      .element(
        page
          .getByRole("tablist", { name: "Modo de armado" })
          .getByRole("tab", { name: "Individual" }),
      )
      .toHaveAttribute("aria-selected", "true");
  });

  it("Terminar on the last step ends it", async () => {
    await open();
    await startFromTheMenu();
    await tip().getByRole("button", { name: "Tu menú" }).click();
    await expect.element(title()).toHaveTextContent("Modo oscuro");
    await walk(["El color de la app", "Cambiar mi clave", "Ver tutorial"]);
    await tip().getByRole("button", { name: "Terminar ✓" }).click();
    await expect.element(tip()).not.toBeInTheDocument();
    await expect.element(nameMenu()).not.toBeInTheDocument();
  });
});

describe("the letters and the phone", () => {
  it("nothing goes below 12 px, or 11 px in capitals (invariant 15)", async () => {
    await open();
    await startFromTheMenu();
    const small: string[] = [];
    for (const element of tip().element().querySelectorAll("*")) {
      const own = [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && /[\p{L}\d]/u.test(node.textContent ?? ""),
      );
      if (!own || element.getClientRects().length === 0) continue;
      const style = getComputedStyle(element);
      const text = element.textContent.trim();
      const capitals = style.textTransform === "uppercase" || text === text.toUpperCase();
      if (Number.parseFloat(style.fontSize) < (capitals ? 11 : 12)) small.push(text);
    }
    expect(small).toEqual([]);
  });

  it("on a phone the globe stays inside the window, below or above what it lights", async () => {
    await page.viewport(390, 844);
    await open();
    await startFromTheMenu();
    const outside: string[] = [];
    await walk(
      ["Datos del oficial", "Hasta 4 asesores", "Cashback", "Texto legal"],
      async (shown) => {
        // The globe is placed once the step is painted.
        await new Promise((done) => requestAnimationFrame(done));
        const box = tip().element().getBoundingClientRect();
        const fits = box.left >= 0 && box.top >= 0 && box.right <= 390 && box.bottom <= 844;
        if (!fits) outside.push(`${shown} ${JSON.stringify(box)}`);
      },
    );
    expect(outside).toEqual([]);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
  });
});
