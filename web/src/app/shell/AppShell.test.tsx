import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Locator, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { NO_TITLES } from "@/shared/domain/screen-titles.ts";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { AppGate } from "../AppGate.tsx";
import { type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import type { NoticeSourceProps, WaitingNotice } from "@/shared/lib/view-props.ts";
import { AppShell } from "./AppShell.tsx";
import { SearchButton } from "./SearchButton.tsx";
import { LazyView } from "./ViewHost.tsx";
import { LOGO_A, paintedFlyer } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";

const PROMOTIONS = { promos_buscar: true };

/** The shell by itself, once inside: what the slices that have something to say will give it. */
function ReportOnce({ notice, report }: NoticeSourceProps & { readonly notice: WaitingNotice }) {
  useEffect(() => {
    report(notice);
  }, [notice, report]);
  return null;
}

function sourcesOf(notices: readonly WaitingNotice[]) {
  return Object.fromEntries(
    notices.map((notice, index) => [
      `source-${String(index)}`,
      ({ report }: NoticeSourceProps) => <ReportOnce notice={notice} report={report} />,
    ]),
  );
}

function ShellInside({ notices }: { readonly notices: readonly WaitingNotice[] }) {
  const [sources] = useState(() => sourcesOf(notices));
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return (
    <AppShell
      session={session}
      titles={NO_TITLES}
      flyerOptions={sanitizeFlyerOptions(null)}
      commercialActionsOn={false}
      noticeSources={sources}
    />
  );
}

function permissions(asesor: Record<string, boolean>) {
  return { roles: { asesor, hunter: asesor, lider: asesor } };
}

async function open(answers: AppAnswers = {}) {
  const harness = createAppHarness({
    ...answers,
    files: {
      "_facultades.json": permissions(PROMOTIONS),
      "_opciones.json": { opts: [{ n: 1 }] },
      ...answers.files,
    },
  });
  harness.storeSession();
  const screen = await render(harness.wrap(<AppGate />));
  await expect.element(screen.getByRole("banner")).toBeVisible();
  return { harness, screen };
}

function profileWith(role: string, others: Record<string, unknown> = {}) {
  return { role, full_name: "Ana Inventada", status: "active", es_prueba: false, ...others };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the screens", () => {
  it("each tab shows its place, and the others stay out", async () => {
    const { screen } = await open();

    await expect
      .element(
        screen.getByRole("tablist", { name: "Pantallas" }).getByRole("tab", { selected: true }),
      )
      .toHaveTextContent("Flyer Galicia");
    expect(document.querySelector('[data-screen="flyer-layout"]')).not.toBeNull();
    expect(document.querySelector('[data-screen="promotions"]')).toBeNull();

    await screen.getByRole("tab", { name: "Promociones" }).click();

    await expect
      .element(
        screen.getByRole("tablist", { name: "Pantallas" }).getByRole("tab", { selected: true }),
      )
      .toHaveTextContent("Promociones");
    await vi.waitFor(() => {
      expect(document.querySelector('[data-screen="promotions"]')?.hasAttribute("hidden")).toBe(
        false,
      );
    });
  });

  it("the one that was left stays mounted, hidden: what was being done is still there", async () => {
    const { screen } = await open();

    await screen.getByRole("tab", { name: "Promociones" }).click();

    const flyer = document.querySelector('[data-screen="flyer-layout"]');
    expect(flyer?.hasAttribute("hidden")).toBe(true);
    await screen.getByRole("tab", { name: "Flyer Galicia" }).click();
    expect(document.querySelector('[data-screen="flyer-layout"]')).toBe(flyer);
    expect(flyer?.hasAttribute("hidden")).toBe(false);
  });

  it("the tabs answer to the keyboard", async () => {
    const { screen } = await open();
    const tab = screen.getByRole("tab", { name: "Promociones" });

    focus(tab);
    await userEvent.keyboard("{Enter}");
    await expect.element(tab).toHaveAttribute("aria-selected", "true");

    focus(screen.getByRole("tab", { name: "Flyer Galicia" }));
    await userEvent.keyboard(" ");
    await expect
      .element(screen.getByRole("tab", { name: "Flyer Galicia" }))
      .toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("a");
    await expect
      .element(screen.getByRole("tab", { name: "Flyer Galicia" }))
      .toHaveAttribute("aria-selected", "true");
  });

  it("the page knows when it is on the flyer editor", async () => {
    const { screen } = await open();
    expect(document.body.dataset.flyerEditor).toBe("true");

    await screen.getByRole("tab", { name: "Promociones" }).click();

    await vi.waitFor(() => {
      expect(document.body.dataset.flyerEditor).toBe("false");
    });
  });
});

describe("what a test may read", () => {
  it("what a profile starts with when the administrator has not touched it", async () => {
    await open();
    const probe = window["__flyerProbe"]?.["permissions"];
    expect(typeof probe).toBe("function");
    const read: unknown = probe?.();
    const startsAllowed: unknown =
      typeof read === "object" && read !== null ? Reflect.get(read, "startsAllowed") : null;
    if (typeof startsAllowed !== "function") throw new Error("No permissions probe");
    expect(startsAllowed("vip", "notas")).toBe(true);
    expect(startsAllowed("asesor", "benchmark")).toBe(false);
  });
});

describe("the tabs each person has", () => {
  it("without the permission, the tab is not there", async () => {
    const { screen } = await open({ files: { "_facultades.json": permissions({}) } });

    await expect.element(screen.getByRole("tab", { name: "Flyer Galicia" })).toBeVisible();
    await expect.element(screen.getByRole("tab", { name: "Promociones" })).not.toBeInTheDocument();
  });

  it("a hunter goes to their screen, without the flyer editor", async () => {
    const { screen } = await open({
      profile: profileWith("hunter"),
      files: { "_facultades.json": permissions({}) },
    });

    await expect
      .element(
        screen.getByRole("tablist", { name: "Pantallas" }).getByRole("tab", { selected: true }),
      )
      .toHaveTextContent("Buscar flyer");
    await expect
      .element(screen.getByRole("tab", { name: "Flyer Galicia" }))
      .not.toBeInTheDocument();
  });

  it("a leader goes to Gestiones", async () => {
    const { screen } = await open({ profile: profileWith("lider"), commercialFlag: "on" });

    await expect
      .element(
        screen.getByRole("tablist", { name: "Pantallas" }).getByRole("tab", { selected: true }),
      )
      .toHaveTextContent("Gestiones");
  });

  it("the names can be changed by the administrator for everybody", async () => {
    const { screen } = await open({ files: { "_titulos.json": { promos: "Beneficios" } } });

    await expect.element(screen.getByRole("tab", { name: "Beneficios" })).toBeVisible();
  });
});

async function openWith(notices: readonly WaitingNotice[]) {
  const harness = createAppHarness({
    files: {
      "_facultades.json": permissions(PROMOTIONS),
      "_opciones.json": { opts: [{ n: 1 }] },
    },
  });
  harness.storeSession();
  const screen = await render(harness.wrap(<ShellInside notices={notices} />));
  await expect.element(screen.getByRole("banner")).toBeVisible();
  return screen;
}

describe("what is waiting for the person", () => {
  it("shows on the name, with what it is", async () => {
    const screen = await openWith([
      { count: 1, hint: "1 novedad en Gestiones" },
      { count: 2, hint: "2 cambios para revisar" },
    ]);

    await expect.element(screen.getByTestId("header-notice")).toHaveTextContent("3");
    await expect
      .element(screen.getByRole("button", { name: /^Menú de / }))
      .toHaveAttribute("title", "Tenés 1 novedad en Gestiones y 2 cambios para revisar");
  });

  it("many are counted up to 9", async () => {
    const screen = await openWith([{ count: 12, hint: "12 cosas", tabId: "promos" }]);

    await expect.element(screen.getByTestId("header-notice")).toHaveTextContent("9+");
    await expect
      .element(screen.getByRole("tab", { name: /Promociones/ }))
      .toMatchTextContent(/9\+/);
  });

  it("a number on a tab shows as it is", async () => {
    const screen = await openWith([{ count: 2, hint: "2 cosas", tabId: "promos" }]);

    await expect.element(screen.getByRole("tab", { name: /Promociones/ })).toMatchTextContent(/2/);
  });

  it("with nothing waiting, nothing shows", async () => {
    const screen = await openWith([{ count: 0, hint: "nada", tabId: "promos" }]);

    await expect.element(screen.getByTestId("header-notice")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /^Menú de / }))
      .toHaveAttribute("title", "");
  });
});

describe("the search button", () => {
  it("names the shortcut of each system", async () => {
    const mac = await render(<SearchButton onOpen={vi.fn<() => void>()} platform="MacIntel" />);
    await expect.element(mac.getByRole("button")).toMatchTextContent(/⌘K/);
    await mac.unmount();

    const other = await render(<SearchButton onOpen={vi.fn<() => void>()} platform="Win32" />);
    await expect.element(other.getByRole("button")).toMatchTextContent(/Ctrl K/);
  });
});

async function openMenu(screen: Awaited<ReturnType<typeof open>>["screen"]) {
  await screen.getByRole("button", { name: /^Menú de / }).click();
}

describe("the name menu", () => {
  it("shows who it is, and the items of an advisor", async () => {
    const { screen } = await open({
      files: { "_facultades.json": permissions({ notas: true, padron_buscar: true }) },
    });
    await openMenu(screen);

    await expect.element(screen.getByRole("menu")).toMatchTextContent(/^Ana InventadaAsesor/);
    const items = screen
      .getByRole("menuitem")
      .elements()
      .map(({ textContent }) => textContent);
    expect(items).toEqual([
      "Cambiar mi clave",
      "Modo oscuro",
      "Bloc de notas",
      "Base de datos",
      "Ver tutorial",
      "Salir",
    ]);
  });

  it("the dark mode changes and the menu stays open", async () => {
    const { screen } = await open();
    await openMenu(screen);

    await screen.getByRole("menuitem", { name: "Modo oscuro" }).click();

    await expect.element(screen.getByRole("menuitem", { name: "Modo claro" })).toBeVisible();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await screen.getByRole("menuitem", { name: "Modo claro" }).click();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("the theme is chosen there", async () => {
    const { screen } = await open();
    await openMenu(screen);

    await screen.getByRole("button", { name: "Cielo" }).click();

    expect(document.documentElement.classList.contains("t-cielo")).toBe(true);
    await screen.getByRole("button", { name: "Marfil" }).click();
  });

  it("leaving closes the session and goes back to the form", async () => {
    const { screen, harness } = await open();
    await openMenu(screen);

    await screen.getByRole("menuitem", { name: "Salir" }).click();

    await expect
      .element(screen.getByRole("heading", { name: "Flyer Galicia", level: 1 }))
      .toBeVisible();
    expect(harness.network.to("/auth/v1/logout", "POST")).toHaveLength(1);
  });

  it("a window opens from there, and closes", async () => {
    const { screen } = await open();
    await openMenu(screen);

    await screen.getByRole("menuitem", { name: "Cambiar mi clave" }).click();
    await expect
      .element(screen.getByRole("dialog", { name: "Cambiar mi contraseña" }))
      .toBeVisible();

    await screen.getByRole("button", { name: "Cancelar" }).click();
    await expect
      .element(screen.getByRole("dialog", { name: "Cambiar mi contraseña" }))
      .not.toBeInTheDocument();
  });

  it("a window that is not there yet closes by itself", async () => {
    const { screen } = await open();
    await openMenu(screen);

    await screen.getByRole("menuitem", { name: "Ver tutorial" }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("a test account has its two sections", async () => {
    const { screen } = await open({
      profile: profileWith("asesor", { es_prueba: true }),
      admin: () =>
        jsonResponse({
          ok: true,
          cuentas: [{ id: "u2", full_name: "Otra Persona", role: "hunter", email: "o@b.c" }],
        }),
    });
    await openMenu(screen);

    await expect.element(screen.getByRole("group", { name: "Cambiar de cuenta" })).toBeVisible();
    await expect
      .element(screen.getByRole("group", { name: "Probar como (cuenta de prueba)" }))
      .toBeVisible();
  });

  it("nobody else has them", async () => {
    const { screen, harness } = await open();
    await openMenu(screen);

    await expect
      .element(screen.getByRole("group", { name: "Cambiar de cuenta" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("group", { name: "Probar como (cuenta de prueba)" }))
      .not.toBeInTheDocument();
    expect(harness.adminCalls()).toEqual([]);
  });
});

/** One after the other: four at once would not be a person tapping. */
async function tapTimes(tab: Locator, times: number): Promise<void> {
  if (times === 0) return;
  await tab.click();
  await tapTimes(tab, times - 1);
}

function focus(tab: Locator): void {
  const element = tab.element();
  if (element instanceof HTMLElement) element.focus();
}

describe("the administrator", () => {
  const ADMIN = profileWith("admin");

  it("has the button of the panel, with the accounts that wait", async () => {
    const { screen } = await open({ profile: ADMIN, pendingAccounts: 3 });

    await expect
      .element(screen.getByRole("button", { name: /Admin/ }))
      .toMatchTextContent(/⚙ Admin\s*3/);
  });

  it("without any waiting there is no number", async () => {
    const { screen } = await open({ profile: ADMIN });

    await expect
      .element(screen.getByRole("button", { name: /Admin/ }))
      .toHaveTextContent("⚙ Admin");
  });

  it("the buttons of the header open what their slices bring", async () => {
    const { screen } = await open({ profile: ADMIN });

    await screen.getByRole("button", { name: /Admin/ }).click();
    await screen.getByRole("button", { name: /Buscar una pantalla/ }).click();

    await expect.element(screen.getByRole("banner")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("nobody else has it", async () => {
    const { screen } = await open();

    await expect.element(screen.getByRole("button", { name: /Admin/ })).not.toBeInTheDocument();
  });

  it("does not change the password from the menu, and sees test accounts", async () => {
    const { screen, harness } = await open({ profile: ADMIN });
    await screen.getByRole("button", { name: /^Menú de / }).click();

    await expect
      .element(screen.getByRole("menuitem", { name: "Cambiar mi clave" }))
      .not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(harness.adminCalls()).toEqual([{ action: "cuentas_prueba" }]);
    });
  });

  it("the tabs tell how they are moved and renamed", async () => {
    const { screen } = await open({ profile: ADMIN });

    await expect.element(screen.getByRole("tab", { name: "Flyer Galicia" })).toBeVisible();
    expect(
      screen.getByRole("tab", { name: "Flyer Galicia" }).element().getAttribute("title"),
    ).toMatch(/4 toques/);
    await expect
      .element(screen.getByRole("tab", { name: "Benchmark" }))
      .not.toHaveAttribute("title");
  });

  it("four taps let them rename a tab, for everybody", async () => {
    const { screen, harness } = await open({ profile: ADMIN });
    const tab = screen.getByRole("tab", { name: "Promociones" });

    await tapTimes(tab, 4);
    const field = screen.getByRole("textbox", { name: "Nombre de la solapa" });
    await expect.element(field).toHaveValue("Promociones");
    await field.fill("Beneficios");
    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("tab", { name: "Beneficios" })).toBeVisible();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Título guardado: Beneficios");
    expect(harness.network.to("/storage/v1/object/flyers/_titulos.json")).toHaveLength(1);
  });

  it("Escape leaves the name as it was, and nothing is saved", async () => {
    const { screen, harness } = await open({ profile: ADMIN });

    await tapTimes(screen.getByRole("tab", { name: "Promociones" }), 4);
    await screen.getByRole("textbox", { name: "Nombre de la solapa" }).fill("Otra");
    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("tab", { name: "Promociones" })).toBeVisible();
    expect(harness.network.to("/storage/v1/object/flyers/_titulos.json")).toEqual([]);
  });

  it("leaving the field saves too, unless it is the same name", async () => {
    const { screen, harness } = await open({ profile: ADMIN });

    await tapTimes(screen.getByRole("tab", { name: "Promociones" }), 4);
    await expect
      .element(screen.getByRole("textbox", { name: "Nombre de la solapa" }))
      .toBeVisible();
    const field = screen.getByRole("textbox", { name: "Nombre de la solapa" }).element();
    if (field instanceof HTMLElement) field.blur();

    await expect.element(screen.getByRole("tab", { name: "Promociones" })).toBeVisible();
    expect(harness.network.to("/storage/v1/object/flyers/_titulos.json")).toEqual([]);
  });

  it("if it cannot be saved, it says so", async () => {
    const { screen, harness } = await open({ profile: ADMIN });
    vi.spyOn(harness.backend.bucket, "upload").mockResolvedValue({
      ok: false,
      error: { kind: "transient", status: 500, message: "sin lugar" },
    });

    await tapTimes(screen.getByRole("tab", { name: "Promociones" }), 4);
    await screen.getByRole("textbox", { name: "Nombre de la solapa" }).fill("Otra");
    await userEvent.keyboard("{Enter}");

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Error al guardar el título: sin lugar");
  });

  it("writing in the name does not change of tab nor count as a tap", async () => {
    const { screen } = await open({ profile: ADMIN });

    await tapTimes(screen.getByRole("tab", { name: "Promociones" }), 4);
    const field = screen.getByRole("textbox", { name: "Nombre de la solapa" });
    await field.click();
    field.element().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    await expect.element(field).toBeVisible();
    await expect
      .element(
        screen.getByRole("tablist", { name: "Pantallas" }).getByRole("tab", { selected: true }),
      )
      .toMatchTextContent(/^$|Promociones/);
  });

  it("three taps do not rename, nor taps far apart", async () => {
    const { screen } = await open({ profile: ADMIN });
    const tab = screen.getByRole("tab", { name: "Promociones" });

    await tapTimes(tab, 3);
    await expect
      .element(screen.getByRole("textbox", { name: "Nombre de la solapa" }))
      .not.toBeInTheDocument();

    const later = Date.now() + 2000;
    const now = vi.spyOn(Date, "now").mockReturnValue(later);
    await tab.click();
    now.mockRestore();
    await expect
      .element(screen.getByRole("textbox", { name: "Nombre de la solapa" }))
      .not.toBeInTheDocument();
  });

  it("whoever is not an administrator does not rename", async () => {
    const { screen } = await open();

    await tapTimes(screen.getByRole("tab", { name: "Promociones" }), 4);

    await expect
      .element(screen.getByRole("textbox", { name: "Nombre de la solapa" }))
      .not.toBeInTheDocument();
  });
});

describe("what a screen can ask of the shell", () => {
  it("the flyer editor opens Base de datos from the company search", async () => {
    const { screen } = await open({
      files: {
        "_facultades.json": permissions({ padron_buscar: true, opcion_1: true }),
        "_active.json": { imageUrl: null },
      },
      tables: { padron_empresas: () => jsonResponse([]) },
    });
    await screen
      .getByRole("button", { name: "Buscar en mis empresas (razón social o CUIT)" })
      .click();
    await screen.getByRole("button", { name: "↑ Cargar mis empresas" }).click();
    await expect
      .element(screen.getByRole("dialog").first())
      .toMatchTextContent(/Base de datos|Mis empresas/);
  });
});

describe("a screen whose code does not arrive", () => {
  it("says so and can be tried again", async () => {
    const load = vi
      .fn<() => Promise<{ default: () => React.JSX.Element }>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({ default: () => <p>La pantalla</p> });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const screen = await render(
      <LazyView
        load={load}
        loadFailure="No se pudo cargar"
        isActive
        tabId="promos"
        goToTab={() => undefined}
        openMenuWindow={() => undefined}
      />,
    );

    await expect.element(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar");
    await screen.getByRole("button", { name: "Reintentar" }).click();
    await expect.element(screen.getByText("La pantalla")).toBeVisible();
    quiet.mockRestore();
  });
});

describe("moving the tabs", () => {
  it("holding one and dragging saves the new order for everybody", async () => {
    const { screen, harness } = await open({ profile: profileWith("admin") });
    const tab = screen.getByRole("tab", { name: "Promociones" }).element();
    const target = screen.getByRole("tab", { name: "Flyer Galicia" }).element();
    const box = target.getBoundingClientRect();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    tab.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
      }),
    );
    await vi.advanceTimersByTimeAsync(4000);
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Arrastrá para cambiar el orden y soltá");
    tab.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: box.left + 2, clientY: box.top }),
    );
    await expect.element(screen.getByRole("tab").first()).toHaveTextContent("Promociones");
    tab.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Orden de las solapas guardado");
    expect(harness.network.to("/storage/v1/object/flyers/_titulos.json")).toHaveLength(1);
    vi.useRealTimers();
  });

  it("whoever is not an administrator holds it in vain", async () => {
    const { screen, harness } = await open();
    const tab = screen.getByRole("tab", { name: "Promociones" }).element();
    const box = screen
      .getByRole("tab", { name: "Flyer Galicia" })
      .element()
      .getBoundingClientRect();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    tab.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
      }),
    );
    await vi.advanceTimersByTimeAsync(4000);
    tab.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: box.left + 2, clientY: box.top }),
    );
    expect(screen.getByRole("status").element().textContent).toBe("");
    tab.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    await expect.element(screen.getByRole("tab").first()).toHaveTextContent("Flyer Galicia");
    expect(harness.network.to("/storage/v1/object/flyers/_titulos.json")).toEqual([]);
    vi.useRealTimers();
  });

  it("dropping it where it was saves nothing", async () => {
    const { screen, harness } = await open({ profile: profileWith("admin") });
    const tab = screen.getByRole("tab", { name: "Promociones" }).element();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    tab.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
      }),
    );
    await vi.advanceTimersByTimeAsync(4000);
    tab.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

    await expect.element(screen.getByRole("status")).toMatchTextContent(/Arrastrá/);
    expect(harness.network.to("/storage/v1/object/flyers/_titulos.json")).toEqual([]);
    vi.useRealTimers();
  });

  it("if it cannot be saved, it says so", async () => {
    const { screen, harness } = await open({ profile: profileWith("admin") });
    vi.spyOn(harness.backend.bucket, "upload").mockResolvedValue({
      ok: false,
      error: { kind: "transient", status: 500, message: "sin lugar" },
    });
    const tab = screen.getByRole("tab", { name: "Promociones" }).element();
    const box = screen
      .getByRole("tab", { name: "Flyer Galicia" })
      .element()
      .getBoundingClientRect();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    tab.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
      }),
    );
    await vi.advanceTimersByTimeAsync(4000);
    tab.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: box.left + 2, clientY: box.top }),
    );
    await expect.element(screen.getByRole("tab").first()).toHaveTextContent("Promociones");
    tab.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Error al guardar el título: sin lugar");
    vi.useRealTimers();
  });
});

describe("Generar flyers from another screen", () => {
  it("brings the flyer editor to the page, and it stays on the screen it was on", async () => {
    const image = paintedFlyer([LOGO_A]);
    const created = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:zip");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { screen } = await open({
      files: {
        "_facultades.json": permissions({
          promos_buscar: true,
          padron_buscar: true,
          opcion_1: false,
          opcion_9: true,
          opcion_8: true,
        }),
        "_opciones.json": {
          opts: [
            { n: 9, nombre: "Combustible", solapa: "flyer" },
            { n: 8, nombre: "Rubro", solapa: "rubros" },
          ],
        },
        "_titulos.json": { orden: ["promos", "flyer", "rubros"] },
        "_active9.json": { imageUrl: image, cfg: {} },
        "_active8.json": { imageUrl: image, cfg: {} },
      },
      tables: {
        padron_empresas: () =>
          jsonResponse([
            { empresa: "ACME", cuits: [], config: "BAU", asesores: [], rubro: { opcion: 8 } },
          ]),
      },
    });
    const selectedTab = screen
      .getByRole("tablist", { name: "Pantallas" })
      .getByRole("tab", { selected: true });
    await expect.element(selectedTab).toHaveTextContent("Promociones");

    await screen.getByRole("button", { name: /^Menú de / }).click();
    await screen.getByRole("menuitem", { name: "Base de datos" }).click();
    await screen.getByRole("button", { name: /Generar flyers/ }).click();
    await screen.getByRole("button", { name: "Todas" }).click();
    await screen.getByRole("button", { name: /Generar ZIP/ }).click();
    await screen.getByRole("button", { name: "Generar", exact: true }).click();

    await expect.element(screen.getByText("✓ Flyers generados")).toBeVisible();
    expect(created).toHaveBeenCalledTimes(1);
    await expect.element(selectedTab).toHaveTextContent("Promociones");
  });
});
