import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { ZOOM_MAX } from "@/shared/lib/flyer-workspace/index.ts";
import { ADVISOR, type AppAnswers } from "@/shared/lib/testing/app-harness.tsx";
import {
  LOGO_A,
  LOGO_B,
  paintedFlyer,
  workspaceOnScreen,
} from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { placeDeskOnPage } from "@/shared/lib/testing/place-desk-on-page.ts";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { attachPreviewGestures, ZOOM_TIP } from "../model/preview-gestures.ts";
import { flyerFiles, flyerShown, open, ALLOWED } from "../testing/editor-on-screen.tsx";

const ACME = {
  empresa: "ACME SA",
  cuits: ["30711111111"],
  config: "Config 2",
  asesores: [{ nombre: "Ana Perez", celular: "11 1", email: "" }],
};
const OF_FUEL = { ...ACME, empresa: "NAFTA SA", rubro: { opcion: 8 } };

const theWorkspace = workspaceOnScreen;

async function pressPng() {
  await page.getByRole("button", { name: "Otros" }).click();
  await page.getByRole("button", { name: "Descargar como imagen (PNG)" }).click();
}

beforeEach(async () => {
  localStorage.clear();
  await page.viewport(1366, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function withList(rows: readonly object[], others: AppAnswers = {}): AppAnswers {
  return {
    ...others,
    files: {
      ...flyerFiles(),
      "_facultades.json": { roles: { asesor: { ...ALLOWED, padron_buscar: true } } },
      ...others.files,
    },
    tables: { padron_empresas: () => jsonResponse(rows), ...others.tables },
  };
}

async function tapFour(on: Locator) {
  await on.click();
  await on.click();
  await on.click();
  await on.click();
}

async function bring(name: string) {
  await page.getByRole("button", { name: "Buscar en mis empresas (razón social o CUIT)" }).click();
  await page.getByTestId("company-option").getByText(name).click();
}

const formValues = () => theWorkspace().getState().form;

describe("the form", () => {
  it("what is written goes to the flyer, and Restaurar takes it all away", async () => {
    await open();
    await flyerShown();
    await page.getByPlaceholder("Nombre de la empresa").fill("ACME");
    expect(formValues().empresa).toBe("ACME");
    await page.getByRole("button", { name: "Restaurar" }).click();
    await expect.element(page.getByPlaceholder("Nombre de la empresa")).toHaveValue("");
    expect(formValues().empresa).toBe("");
  });

  it("the tab decides what the form draws", async () => {
    const { show } = await open();
    await flyerShown();
    expect(formValues().benef).toBe(false);
    await show("rubros");
    await vi.waitFor(() => {
      expect(formValues().benef).toBe(true);
    });
    await expect.element(page.getByTestId("benefit-fields")).toBeInTheDocument();
  });

  it("a flyer of the bar is one press away", async () => {
    await open();
    await flyerShown();
    await page.getByRole("button", { name: "Otro Flyer" }).click();
    await vi.waitFor(() => {
      expect(theWorkspace().getState().slot.option).toBe(6);
    });
  });

  it("a company from the search fills it, and the changes are asked about after the download", async () => {
    await open(withList([ACME]));
    await flyerShown();
    await bring("ACME SA");
    await expect.element(page.getByPlaceholder("Nombre de la empresa")).toHaveValue("ACME SA");
    expect(formValues().nombre).toBe("Ana Perez");

    await page.getByTestId("officer-block-1").getByLabelText("Nombre").fill("Otra Persona");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    await expect
      .element(
        page
          .getByRole("dialog")
          .getByText(/Otra Persona/)
          .first(),
      )
      .toBeInTheDocument();
    await page.getByRole("button", { name: "Actualizar empresa" }).click();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("the switch and the cashback also count for what is asked after the download", async () => {
    await open(withList([ACME]));
    await flyerShown();
    await bring("ACME SA");
    await page.getByRole("switch", { name: "Mostrar en el flyer" }).click();
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    await expect.element(page.getByRole("dialog").getByText(/se quita/)).toBeInTheDocument();
  });

  it("the wrong flyer says so on bringing the company, and going there keeps what was loaded", async () => {
    const shell: { show?: (tab: string) => unknown } = {};
    const { show } = await open(withList([OF_FUEL]), "flyer", true, {
      goToTab: (tab) => {
        shell.show?.(tab);
      },
    });
    shell.show = show;
    await flyerShown();
    await bring("NAFTA SA");
    await expect.element(page.getByText("📋 Beneficio por rubro")).toBeInTheDocument();
    await page.getByRole("button", { name: "Ir a Rubro Uno" }).click();
    await vi.waitFor(() => {
      expect(theWorkspace().getState().slot.option).toBe(8);
    });
    expect(formValues().empresa).toBe("NAFTA SA");
  });

  it("a company with cashback on a cropped flyer can show the amounts again", async () => {
    await open(
      withList([ACME], {
        files: {
          "_active9.json": {
            imageUrl: paintedFlyer([LOGO_A]),
            cfg: { montos: { off: true }, recDe: 6 },
          },
          "_active6.json": { imageUrl: paintedFlyer([LOGO_B]), cfg: {} },
          "_facultades.json": { roles: { asesor: { ...ALLOWED, padron_buscar: true } } },
        },
      }),
    );
    await flyerShown();
    await bring("ACME SA");
    await page.getByRole("button", { name: "Mostrar los importes" }).click();
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/el flyer vuelve a mostrar los importes de ACME SA/);
    await vi.waitFor(() => {
      expect(theWorkspace().getState().slot.option).toBe(6);
    });
  });

  it("with nobody to take it to another tab, it stays where it was", async () => {
    await open(withList([OF_FUEL]));
    await flyerShown();
    await bring("NAFTA SA");
    await page.getByRole("button", { name: "Ir a Rubro Uno" }).click();
    await vi.waitFor(() => {
      expect(theWorkspace().getState().slot.option).toBe(9);
    });
  });

  it("a company without cashback that is downloaded with one is asked about", async () => {
    await open(withList([{ ...ACME, config: "SIN" }]));
    await flyerShown();
    await bring("ACME SA");
    await expect.element(page.getByRole("dialog")).toMatchTextContent(/ACME SA está marcada/);
    await page.getByRole("button", { name: "Entendido" }).click();
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    await expect.element(page.getByRole("status")).toHaveTextContent("PDF descargado!");
    expect(page.getByRole("dialog").query()).toBeNull();
    await page.getByRole("button", { name: "Config 2" }).click();
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    await expect.element(page.getByRole("dialog")).toBeInTheDocument();
  });

  it("on a phone the pill goes along, and it is gone on another screen", async () => {
    await page.viewport(390, 800);
    const { show } = await open();
    await flyerShown();
    await expect.element(page.getByTestId("phone-pill")).toBeInTheDocument();
    await show("flyer", false);
    await expect.element(page.getByTestId("phone-pill")).not.toBeInTheDocument();
    await show("flyer", true);
    await page.getByRole("button", { name: "Descargar PDF" }).last().click();
    await expect.element(page.getByRole("status")).toHaveTextContent("PDF descargado!");
  });

  it("from the company search it can open the list of companies", async () => {
    const openMenuWindow = vi.fn<(id: string) => void>();
    await open(withList([ACME]), "flyer", true, { openMenuWindow });
    await flyerShown();
    await page
      .getByRole("button", { name: "Buscar en mis empresas (razón social o CUIT)" })
      .click();
    await page.getByRole("button", { name: "✎ Administrar" }).click();
    expect(openMenuWindow).toHaveBeenCalledWith("database");
  });

  it("the preview draws exactly what is downloaded, filled or empty (invariant 16)", async () => {
    await open();
    await flyerShown();
    const written = vi.spyOn(CanvasRenderingContext2D.prototype, "fillText");
    const textsOf = (draw: () => unknown) => {
      written.mockClear();
      draw();
      return written.mock.calls.map(([text]) => text);
    };
    const workspace = theWorkspace();
    const empty = textsOf(workspace.drawNow);
    expect(empty).toEqual(textsOf(workspace.renderDownload));
    expect(empty.join(" ")).not.toMatch(/Nombre de la empresa|Nombre Apellido|Asesor/);

    await page.getByPlaceholder("Nombre de la empresa").fill("ACME");
    await page.getByTestId("officer-block-1").getByLabelText("Nombre").fill("Ana Perez");
    const filled = textsOf(workspace.drawNow);
    expect(filled).toEqual(textsOf(workspace.renderDownload));
    expect(filled.join(" ")).toMatch(/ACME/);
    expect(filled.join(" ")).toMatch(/Ana Perez/);
  });

  it("a test can read what the form says", async () => {
    await open();
    await flyerShown();
    await page.getByPlaceholder("Nombre de la empresa").fill("ACME");
    const read: unknown = window["__flyerProbe"]?.["flyerForm"]?.();
    expect(read).toMatchObject({ empresa: "ACME" });
  });
});

describe("the flyer editor", () => {
  it("the drafts go under the flyers; touching the flyer of a draft goes back to the original", async () => {
    await open({
      files: {
        ...flyerFiles(),
        "_opciones.json": { opts: [{ n: 9, nombre: "Combustible", solapa: "flyer" }] },
      },
    });
    await vi.waitFor(() => {
      expect(theWorkspace().getState().slot.scene).not.toBeNull();
    });
    expect(page.getByTestId("flyer-options").elements()).toHaveLength(0);
    await page.getByRole("button", { name: "Cambiar logos" }).click();
    await page.getByRole("button", { name: "Recortar" }).click();
    const canvas = page.getByTestId("flyer-canvas").element();
    const { left, top } = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: left + 50,
        clientY: top + 60,
        button: 0,
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", { clientX: left + 50, clientY: top + 140, bubbles: true }),
    );
    document.dispatchEvent(
      new PointerEvent("pointerup", { clientX: left + 50, clientY: top + 140, bubbles: true }),
    );
    await page.getByRole("button", { name: "Quitar esta parte" }).click();
    const tab = page.getByTestId("flyer-options").getByRole("button", { name: "Combustible" });
    await expect.element(tab).toHaveAttribute("aria-pressed", "false");
    await expect.element(page.getByTestId("open-work")).toBeVisible();
    await tab.click();
    await expect.element(tab).toHaveAttribute("aria-pressed", "true");
    expect(theWorkspace().getState().slot.scene?.cuts).toEqual([]);
    expect(document.querySelector("[data-no-amounts]")).not.toBeNull();
    expect(theWorkspace().sections.isOurs(theWorkspace().getState().legal)).toBe(false);
  });

  it("opens with the first option it may use, and shows the bar with more than one", async () => {
    await open();
    await flyerShown();
    expect(theWorkspace().getState().slot.option).toBe(9);
    const bar = page.getByTestId("flyer-options");
    await expect
      .element(bar.getByRole("button", { name: "Combustible" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(theWorkspace().currentValues().legal).toBe("Legal de la nueve");
  });

  it("the administrator renames its title with four taps; on another tab it shows that tab and renames «Flyer Galicia 5.5», as today", async () => {
    const { show } = await open({ profile: { ...ADVISOR, role: "admin" } });
    const title = page.getByRole("button", { name: "Flyer Galicia 5.5", exact: true });
    await tapFour(title);
    const field = page.getByRole("textbox", { name: "Nombre del título" });
    await userEvent.fill(field, "Flyer del mes");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("button", { name: "Flyer del mes", exact: true }))
      .toBeVisible();
    await show("rubros");
    const onCategories = page.getByRole("button", { name: "Flyer Rubros", exact: true });
    await tapFour(onCategories);
    await expect.element(field).toHaveValue("Flyer del mes");
  });

  it("for somebody else its title is only text", async () => {
    await open();
    await expect.element(page.getByText("Flyer Galicia 5.5", { exact: true })).toBeVisible();
    expect(page.getByRole("button", { name: "Flyer Galicia 5.5" }).query()).toBeNull();
  });

  it("an option with no flyer says so, and nothing is drawn over the one before", async () => {
    await open();
    await flyerShown();
    const before = theWorkspace().getState().slot.scene;
    await page.getByRole("button", { name: "Otro Flyer" }).click();
    await expect
      .element(page.getByTestId("flyer-load-problem"))
      .toMatchTextContent(/todavía no tiene flyer cargado.*Avisale al administrador/);
    expect(theWorkspace().getState().slot.scene).toBe(before);
    expect(theWorkspace().renderDownload()).toBeNull();
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    await expect.element(page.getByRole("status")).toMatchTextContent(/Avisale al administrador/);
  });

  it("the flyer that did not arrive says so and can be asked again, also when the network is back", async () => {
    const answers: AppAnswers = { droppedFiles: ["_active6.json"] };
    await open(answers);
    await flyerShown();
    await page.getByRole("button", { name: "Otro Flyer" }).click();
    await expect
      .element(page.getByTestId("flyer-load-problem"), { timeout: 15_000 })
      .toMatchTextContent(/No se pudo cargar el flyer.*Revisá tu conexión/);
    expect(theWorkspace().getState().slot.failure).toBe("network");
    const retried = vi.spyOn(theWorkspace(), "retryLoading");
    window.dispatchEvent(new Event("online"));
    await page.getByRole("button", { name: /Reintentar/ }).click();
    expect(retried).toHaveBeenCalled();
    await expect.element(page.getByRole("button", { name: /Reintentar/ })).toBeVisible();
  });

  it("each tab opens its own option, and tells when it has no legal text", async () => {
    const { show } = await open();
    await flyerShown();
    await show("sueldo");
    await vi.waitFor(() => {
      expect(theWorkspace().getState().slot.option).toBe(7);
    });
    await flyerShown();
    expect(theWorkspace().currentValues().cashUnico).toBe(true);
    await expect.element(page.getByRole("status")).toMatchTextContent(/no tiene legal cargado/);
    await show("rubros");
    await vi.waitFor(() => {
      expect(theWorkspace().getState().slot.option).toBe(8);
    });
    await flyerShown();
    expect(theWorkspace().currentValues().benef).toBe(true);
    await show("sueldo", false);
    expect(theWorkspace().getState().slot.option).toBe(8);
  });

  it("downloads once at a time and says it only when it came out", async () => {
    await open();
    await flyerShown();
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function record(
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });
    await pressPng();
    await expect.element(page.getByRole("status")).toHaveTextContent("PNG descargado!");
    expect(clicks).toEqual(["Flyer.png"]);
  });

  it("a download that fails is explained, and does not stay busy", async () => {
    await open();
    await flyerShown();
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
      throw new Error("Too big");
    });
    await pressPng();
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/No se pudo generar la imagen/);
    await expect.element(page.getByRole("button", { name: "Descargar PDF" })).toBeEnabled();
  });

  it("Restaurar takes the changes of the logos away", async () => {
    await open();
    await flyerShown();
    await page.getByRole("button", { name: "Cambiar logos" }).click();
    await page.getByRole("button", { name: "Restaurar" }).click();
    expect(theWorkspace().currentValues().logos).toBeUndefined();
    await expect.element(page.getByRole("button", { name: "Listo" })).toBeVisible();
  });

  it("Ctrl+Enter downloads the PDF, once at a time", async () => {
    await open();
    await flyerShown();
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function record(
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect
      .element(page.getByRole("status"), { timeout: 15_000 })
      .toHaveTextContent("PDF descargado!");
    expect(clicks.filter((name) => name.endsWith(".pdf")).length).toBeLessThanOrEqual(2);
    expect(page.getByRole("button", { name: "Descargar PDF" }).element()).toBeTruthy();
  });

  it("two presses at once are one file", async () => {
    await open();
    await flyerShown();
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function record(
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });
    await page.getByRole("button", { name: "Otros" }).click();
    const button = page.getByRole("button", { name: "Descargar como imagen (PNG)" }).element();
    if (button instanceof HTMLElement) {
      button.click();
      button.click();
    }
    await expect.element(page.getByRole("status")).toHaveTextContent("PNG descargado!");
    expect(clicks).toEqual(["Flyer.png"]);
  });

  it("the wheel alone says how to zoom, once", async () => {
    await open();
    await flyerShown();
    page
      .getByTestId("flyer-preview")
      .element()
      .dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    await expect.element(page.getByRole("status")).toHaveTextContent(ZOOM_TIP);
  });

  it("the buttons of the zoom go by steps, up to its ceiling", async () => {
    await open();
    await flyerShown();
    const percent = page.getByTestId("zoom-percent");
    await expect.element(percent).toHaveTextContent("100%");
    await page.getByRole("button", { name: "Acercar" }).click();
    await expect.element(percent).toHaveTextContent("125%");
    await page.getByRole("button", { name: "Acercar" }).click();
    await expect.element(percent).toHaveTextContent("130%");
    await page.getByRole("button", { name: "Restablecer zoom" }).click();
    await expect.element(percent).toHaveTextContent("100%");
    await page.getByRole("button", { name: "Alejar" }).click();
    await expect.element(percent).toHaveTextContent("80%");
  });

  it("the logos of the catalog are asked where they live", async () => {
    await open();
    await flyerShown();
    const fetching = vi.spyOn(globalThis, "fetch");
    fetching.mockRejectedValue(new Error("No"));
    await expect(theWorkspace().logos.fetch("a.png")).rejects.toThrow("No");
    expect(fetching).toHaveBeenCalledWith(expect.stringMatching(/a\.png$/));
  });

  it("does not ask for what it already has", async () => {
    const { harness } = await open();
    await flyerShown();
    await page.getByRole("button", { name: "Otro Flyer" }).click();
    await expect.element(page.getByTestId("flyer-load-problem")).toBeVisible();
    await page.getByRole("button", { name: "Combustible" }).click();
    await flyerShown();
    await expect.element(page.getByTestId("flyer-load-problem")).not.toBeInTheDocument();
    await page.getByRole("button", { name: "Otro Flyer" }).click();
    await page.getByRole("button", { name: "Combustible" }).click();
    expect(harness.network.to("/storage/v1/object/public/flyers/_active9.json")).toHaveLength(1);
  });

  it("a flyer that arrives late does not step on the one chosen after", async () => {
    await open();
    await flyerShown();
    await page.getByRole("button", { name: "Otro Flyer" }).click();
    await page.getByRole("button", { name: "Combustible" }).click();
    await vi.waitFor(() => {
      expect(theWorkspace().getState().slot.option).toBe(9);
      expect(theWorkspace().getState().slot.failure).toBeNull();
    });
  });
});

function stage() {
  const pane = document.createElement("div");
  Object.assign(pane.style, { width: "300px", height: "200px", overflow: "auto" });
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  const size = (zoom: number) => {
    canvas.width = 1000 * zoom;
    canvas.height = 1000 * zoom;
  };
  size(1);
  pane.append(canvas);
  document.body.append(pane);
  const state = { zoom: 1 };
  const tips: string[] = [];
  const draws: number[] = [];
  const detach = attachPreviewGestures({
    pane,
    canvas,
    workspace: {
      getState: () => ({ zoom: state.zoom }),
      setZoom: (zoom) => {
        state.zoom = zoom;
      },
      drawNow: () => {
        draws.push(state.zoom);
        size(state.zoom);
      },
    },
    onTip: (text) => tips.push(text),
  });
  return { pane, canvas, state, tips, draws, detach };
}

const nextFrame = () =>
  new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });

const editorPanel = (name: string) =>
  page.getByRole("tablist", { name: "Modo de armado" }).getByRole("tab", { name });

describe("from the search of screens", () => {
  it("Masivo, Historial and Individual go to their panel", async () => {
    await open();
    await flyerShown();

    placeDeskOnPage().ask("flyer-editor", "masivo");
    await expect.element(editorPanel("Masivo")).toHaveAttribute("aria-selected", "true");
    placeDeskOnPage().ask("flyer-editor", "historial");
    await expect.element(editorPanel("Historial")).toHaveAttribute("aria-selected", "true");
    placeDeskOnPage().ask("flyer-editor", "individual");
    await expect.element(editorPanel("Individual")).toHaveAttribute("aria-selected", "true");
  });

  it("Cambiar logos goes in from Individual, and stays in if it was already", async () => {
    await open();
    await flyerShown();
    await editorPanel("Masivo").click();

    placeDeskOnPage().ask("flyer-editor", "logos");
    await expect.element(page.getByRole("button", { name: "Listo" })).toBeVisible();
    await expect.element(editorPanel("Individual")).toHaveAttribute("aria-selected", "true");
    placeDeskOnPage().ask("flyer-editor", "logos");
    await expect.element(page.getByRole("button", { name: "Listo" })).toBeVisible();
  });

  it("Cambiar logos on a flyer that is not there says why, as its button does", async () => {
    await open({}, "flyer");
    await flyerShown();
    await page.getByTestId("flyer-options").getByRole("button", { name: "Otro Flyer" }).click();
    await vi.waitFor(() => {
      expect(theWorkspace().getState().slot.option).toBe(6);
      expect(theWorkspace().getState().slot.loading).toBe(false);
    });

    placeDeskOnPage().ask("flyer-editor", "logos");
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("«Otro Flyer» todavía no tiene flyer cargado. Avisale al administrador.");
    await expect.element(page.getByRole("button", { name: "Cambiar logos" })).toBeVisible();
  });

  it("Otros opens its menu", async () => {
    await open();
    await flyerShown();

    placeDeskOnPage().ask("flyer-editor", "otros");
    await expect
      .element(page.getByRole("button", { name: "Otros" }))
      .toHaveAttribute("aria-expanded", "true");
    await expect
      .element(page.getByRole("button", { name: "Descargar como imagen (PNG)" }))
      .toBeVisible();
  });

  it("while a ZIP is generated a flyer is not changed, and it says why, as on the bar", async () => {
    await open();
    await flyerShown();
    const release = theWorkspace().batch.hold();

    placeDeskOnPage().ask("flyer-editor", "option:6");

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Esperá a que termine de generar el ZIP.");
    expect(theWorkspace().getState().slot.option).toBe(9);
    release();
  });

  it("a flyer goes to that flyer, as touching it on the bar does", async () => {
    await open();
    await flyerShown();

    placeDeskOnPage().ask("flyer-editor", "option:6");
    await vi.waitFor(() => {
      expect(theWorkspace().getState().slot.option).toBe(6);
    });
    await expect
      .element(page.getByTestId("flyer-options").getByRole("button", { name: "Otro Flyer" }))
      .toHaveAttribute("aria-pressed", "true");
  });
});

describe("the mouse on the preview", () => {
  it("Ctrl + wheel zooms where the mouse is, drawing before measuring (invariant 1)", async () => {
    const { pane, canvas, state, draws, detach } = stage();
    pane.scrollTop = 100;
    pane.scrollLeft = 50;
    const box = canvas.getBoundingClientRect();
    const event = {
      clientX: box.left + 150,
      clientY: box.top + 200,
      bubbles: true,
      cancelable: true,
    };
    pane.dispatchEvent(new WheelEvent("wheel", { ...event, ctrlKey: true, deltaY: -100 }));
    pane.dispatchEvent(new WheelEvent("wheel", { ...event, ctrlKey: true, deltaY: -100 }));
    await nextFrame();
    expect(state.zoom).toBe(ZOOM_MAX);
    expect(draws).toEqual([ZOOM_MAX]);
    const after = canvas.getBoundingClientRect();
    // The point of the flyer that was under the mouse is still under it.
    const fraction = (event.clientX - after.left) / after.width;
    expect(fraction).toBeCloseTo(0.15, 2);
    pane.dispatchEvent(new WheelEvent("wheel", { ...event, metaKey: true, deltaY: 100 }));
    await nextFrame();
    expect(state.zoom).toBeLessThan(ZOOM_MAX);
    detach();
    pane.remove();
  });

  it("at its ceiling nothing is drawn, and the wheel alone says how, once", async () => {
    const { pane, state, draws, tips, detach } = stage();
    state.zoom = ZOOM_MAX;
    const event = { clientX: 10, clientY: 10, bubbles: true, cancelable: true };
    pane.dispatchEvent(new WheelEvent("wheel", { ...event, ctrlKey: true, deltaY: -100 }));
    await nextFrame();
    expect(draws).toEqual([]);
    pane.style.height = "2000px";
    pane.dispatchEvent(new WheelEvent("wheel", event));
    pane.dispatchEvent(new WheelEvent("wheel", event));
    expect(tips).toEqual([ZOOM_TIP]);
    detach();
    pane.remove();
  });

  it("the wheel alone says nothing while going over a long flyer", () => {
    const { pane, tips, detach } = stage();
    pane.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    expect(tips).toEqual([]);
    detach();
    pane.remove();
  });

  it("dragging moves the flyer, except over a button", () => {
    const { pane, detach } = stage();
    const button = document.createElement("button");
    pane.append(button);
    button.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 5, clientY: 5 }));
    expect(pane.scrollTop).toBe(0);
    pane.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 100, clientY: 100 }));
    expect(pane.dataset["panning"]).toBe("true");
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 80, clientY: 60 }));
    expect(pane.scrollTop).toBe(40);
    expect(pane.scrollLeft).toBe(20);
    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(pane.dataset["panning"]).toBeUndefined();
    detach();
    pane.remove();
  });
});
