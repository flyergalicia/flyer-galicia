// The search of screens on the whole app: where each entry takes, and what it asks on the way.
import { type ComponentType, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { NO_TITLES } from "@/shared/domain/screen-titles.ts";
import {
  FlyerGenerationContext,
  type FlyerGenerationPort,
} from "@/shared/lib/company-registry/flyer-generation-port.ts";
import {
  LOGO_A,
  paintedFlyer,
  workspaceOnScreen,
} from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { Inside } from "@/shared/lib/testing/Inside.tsx";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { useCloseWithFloating } from "@/shared/ui/index.ts";
import { AppGate } from "../AppGate.tsx";
import { loadSearchWindow, type SearchWindowProps } from "@/slices/search/index.ts";
import type { MenuRules } from "../registry/view-rules.ts";
import { SearchHost } from "./SearchHost.tsx";

const RECENT_KEY = "fg_cmdk_rec";
const FLYER = paintedFlyer([LOGO_A]);
const FILES = {
  "_opciones.json": {
    opts: [
      { n: 9, nombre: "Combustible", solapa: "flyer" },
      { n: 4, nombre: "Rubros YPF", solapa: "rubros" },
    ],
  },
  "_active9.json": { imageUrl: FLYER, cfg: {} },
  "_legal9.json": { text: "Legal" },
  "_active4.json": { imageUrl: FLYER, cfg: {} },
  "_legal4.json": { text: "Legal" },
};
const ADVISOR_CAN = {
  opcion_1: false,
  opcion_9: true,
  promos_buscar: true,
  padron_buscar: true,
  asesores_guardados: true,
};

/** A ZIP being generated. */
const BUSY: FlyerGenerationPort = {
  hasFlyer: () => undefined,
  isGenerating: () => true,
  generate: () => Promise.resolve(),
};

function profileWith(role: string) {
  return { role, full_name: "Ana Inventada", status: "active", es_prueba: false };
}

async function open(answers: AppAnswers = {}) {
  const harness = createAppHarness({
    ...answers,
    files: {
      ...FILES,
      "_facultades.json": { roles: { asesor: ADVISOR_CAN } },
      ...answers.files,
    },
    tables: {
      padron_empresas: () => jsonResponse([]),
      asesores_guardados: () => jsonResponse([]),
      ...answers.tables,
    },
  });
  harness.storeSession();
  const screen = await render(harness.wrap(<AppGate />));
  await expect.element(screen.getByRole("banner")).toBeVisible();
  return { harness, screen };
}

const searchPanel = () => page.getByRole("dialog", { name: "Buscador de pantallas" });
const field = () => searchPanel().getByRole("combobox", { name: "Buscar una pantalla o función" });
const headerTab = (name: string) =>
  page.getByRole("tablist", { name: "Pantallas" }).getByRole("tab", { name });

async function goTo(text: string) {
  await userEvent.keyboard("{Control>}k{/Control}");
  await field().fill(text);
  await userEvent.keyboard("{Enter}");
  await expect.element(searchPanel()).not.toBeInTheDocument();
}

type LoadWindow = () => Promise<{ readonly default: ComponentType<SearchWindowProps> }>;

const ADVISOR_RULES: MenuRules = {
  can: () => false,
  isHunter: false,
  isLeader: false,
  isAdminNow: false,
  commercialActionsOn: false,
  hasSharedDesign: false,
  waiting: () => 0,
  flyerOptions: sanitizeFlyerOptions(null),
};

/** Something that floats, open: it closes only with the others. */
function Floating() {
  const [isOpen, setOpen] = useState(true);
  useCloseWithFloating(() => {
    setOpen(false);
  }, isOpen);
  return isOpen ? <p>Lo que flota</p> : null;
}

/** The search by itself, with a button to open it, over whatever else a test needs. */
async function openAlone({
  generation = null,
  load = loadSearchWindow,
  goToTab = vi.fn<(tab: string) => void>(),
}: {
  readonly generation?: FlyerGenerationPort | null;
  readonly load?: LoadWindow;
  readonly goToTab?: (tab: string) => void;
}) {
  const harness = createAppHarness({});
  harness.storeSession();
  await render(
    harness.wrap(
      <FlyerGenerationContext.Provider value={generation}>
        <Inside>
          <SearchHost
            rules={ADVISOR_RULES}
            titles={NO_TITLES}
            activeId="flyer"
            flyerOptions={ADVISOR_RULES.flyerOptions}
            openWindowId={null}
            goToTab={goToTab}
            openWindow={vi.fn<() => void>()}
            loadWindow={load}
          >
            {(toggle) => (
              <>
                <button type="button" onClick={toggle}>
                  Abrir
                </button>
                <Floating />
              </>
            )}
          </SearchHost>
        </Inside>
      </FlyerGenerationContext.Provider>,
    ),
  );
}

beforeEach(async () => {
  localStorage.clear();
  await page.viewport(1366, 800);
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("opening it", () => {
  it("opens with both shortcuts and the button, and gives back the focus when it closes", async () => {
    const { screen } = await open();
    const company = screen.getByPlaceholder("Nombre de la empresa");
    await company.click();

    await userEvent.keyboard("{Control>}k{/Control}");
    await expect.element(field()).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(searchPanel()).not.toBeInTheDocument();
    await expect.element(company).toHaveFocus();

    await userEvent.keyboard("{Meta>}k{/Meta}");
    await expect.element(searchPanel()).toBeVisible();
    await userEvent.keyboard("{Meta>}k{/Meta}");
    await expect.element(searchPanel()).not.toBeInTheDocument();

    await screen.getByRole("button", { name: "Buscar una pantalla o función" }).click();
    await expect.element(searchPanel()).toBeVisible();
    await userEvent.click(document.body, { position: { x: 4, y: 700 } });
    await expect.element(searchPanel()).not.toBeInTheDocument();
  });

  it("opening it with the keyboard closes the name menu, as it does today", async () => {
    const { screen } = await open();
    await screen.getByRole("button", { name: /^Menú de / }).click();
    await expect.element(screen.getByRole("menu")).toBeVisible();

    await userEvent.keyboard("{Control>}k{/Control}");

    await expect.element(field()).toHaveFocus();
    await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
  });

  it("without a session the key stays the browser's", async () => {
    const harness = createAppHarness({});
    const screen = await render(harness.wrap(<AppGate />));
    await expect.element(screen.getByRole("button", { name: "Crear cuenta" })).toBeVisible();

    const key = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(key);

    expect(key.defaultPrevented).toBe(false);
    expect(searchPanel().elements()).toHaveLength(0);
  });

  it("with a window open it does not open over it, and says why", async () => {
    const { screen } = await open();
    await screen.getByRole("button", { name: /^Menú de / }).click();
    await screen.getByRole("menuitem", { name: "Cambiar mi clave" }).click();
    await expect
      .element(screen.getByRole("dialog", { name: "Cambiar mi contraseña" }))
      .toBeVisible();

    await userEvent.keyboard("{Control>}k{/Control}");

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Cerrá la ventana abierta para usar el buscador.");
    expect(searchPanel().elements()).toHaveLength(0);
  });

  it("while a ZIP is generated it does not open, and says why", async () => {
    await openAlone({ generation: BUSY });

    await userEvent.keyboard("{Control>}k{/Control}");

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Esperá a que termine de generar el ZIP.");
    expect(searchPanel().elements()).toHaveLength(0);
    await expect.element(page.getByText("Lo que flota")).toBeVisible();
  });

  it("what floats closes when it opens, by the button too", async () => {
    await openAlone({});
    await expect.element(page.getByText("Lo que flota")).toBeVisible();

    await page.getByRole("button", { name: "Abrir" }).click({ position: { x: 1, y: 1 } });

    await expect.element(field()).toHaveFocus();
    expect(page.getByText("Lo que flota").elements()).toHaveLength(0);
  });

  it("if its code does not arrive it says so, and it can be tried again", async () => {
    const load = vi
      .fn<LoadWindow>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(loadSearchWindow);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await openAlone({ load });

    await page.getByRole("button", { name: "Abrir" }).click();
    await expect.element(page.getByRole("alert")).toMatchTextContent(/No se pudo abrir/);
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();

    await page.getByRole("button", { name: "Abrir" }).click();
    await expect.element(field()).toHaveFocus();
    quiet.mockRestore();
  });

  it("a place that cannot be opened says so", async () => {
    const goToTab = vi.fn<(tab: string) => void>(() => {
      throw new Error("roto");
    });
    await openAlone({ goToTab });

    await page.getByRole("button", { name: "Abrir" }).click();
    await field().fill("flyer galicia");
    await userEvent.keyboard("{Enter}");

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("No se pudo abrir «Flyer Galicia».");
  });
});

describe("going somewhere", () => {
  it("takes to Activas of Promociones and to Masivo, and what was used last goes first", async () => {
    await open();

    await goTo("activas");
    await expect.element(headerTab("Promociones")).toHaveAttribute("aria-selected", "true");
    await expect
      .element(
        page.getByRole("tablist", { name: "Modo de promociones" }).getByRole("tab", {
          name: "Activas",
        }),
      )
      .toHaveAttribute("aria-selected", "true");

    await goTo("masivo");
    await expect.element(headerTab("Flyer Galicia")).toHaveAttribute("aria-selected", "true");
    await expect
      .element(
        page.getByRole("tablist", { name: "Modo de armado" }).getByRole("tab", {
          name: "Masivo",
        }),
      )
      .toHaveAttribute("aria-selected", "true");

    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")).toEqual([
      "tab:masivo",
      "pro:activas",
    ]);
    await userEvent.keyboard("{Control>}k{/Control}");
    await expect.element(searchPanel().getByRole("option").first()).toHaveTextContent("Masivo");
  });

  it("the dark mode changes without moving, and the next time it says Modo claro", async () => {
    await open();

    await goTo("modo oscuro");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await expect.element(headerTab("Flyer Galicia")).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{Control>}k{/Control}");
    await field().fill("modo");
    await expect
      .element(searchPanel().getByRole("option").first())
      .toMatchTextContent(/Modo claro/);
    await userEvent.keyboard("{Enter}");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("leaving the session is not remembered", async () => {
    const { screen } = await open();

    await goTo("salir");

    await expect.element(screen.getByRole("banner")).not.toBeInTheDocument();
    expect(localStorage.getItem(RECENT_KEY)).toBeNull();
  });
});

describe("Base de datos", () => {
  it("opens on its pane, and going elsewhere asks about what is not saved", async () => {
    await open();

    await goTo("mis asesores");
    const database = page.getByRole("dialog", { name: /Base de datos/ });
    await expect
      .element(database.getByRole("tab", { name: "Mis asesores" }))
      .toHaveAttribute("aria-selected", "true");
    await database.getByRole("button", { name: /Agregar asesor/ }).click();

    await goTo("promociones");
    const question = page.getByRole("alertdialog");
    await expect.element(question).toMatchTextContent(/cambios sin guardar en tus asesores/);
    await question.getByRole("button", { name: "Seguir editando" }).click();
    await expect.element(database).toBeVisible();
    await expect.element(headerTab("Flyer Galicia")).toHaveAttribute("aria-selected", "true");

    await goTo("promociones");
    await page.getByRole("alertdialog").getByRole("button", { name: "Salir sin guardar" }).click();
    await expect.element(database).not.toBeInTheDocument();
    await expect.element(headerTab("Promociones")).toHaveAttribute("aria-selected", "true");
  });
});

describe("the administrator", () => {
  it("opens the panel on a sheet, changes sheet with it open, and closes it to go elsewhere", async () => {
    await open({ profile: profileWith("admin") });
    const panel = page.getByTestId("admin-panel");

    await goTo("auditoria");
    await expect
      .element(panel.getByRole("tab", { name: "Auditoría", exact: true }))
      .toHaveAttribute("aria-selected", "true");

    await goTo("legales");
    await expect
      .element(panel.getByRole("tab", { name: "Legales", exact: true }))
      .toHaveAttribute("aria-selected", "true");

    await goTo("promociones");
    await expect.element(panel).not.toBeInTheDocument();
    await expect.element(headerTab("Promociones")).toHaveAttribute("aria-selected", "true");
  });

  it("goes to a flyer of another tab, from another screen", async () => {
    await open({ profile: profileWith("admin") });

    await goTo("promociones");
    await goTo("rubros ypf");

    await expect.element(headerTab("Flyer Rubros")).toHaveAttribute("aria-selected", "true");
    await vi.waitFor(() => {
      expect(workspaceOnScreen().getState().slot.option).toBe(4);
    });
  });
});
