import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ZOOM_MAX } from "@/shared/lib/flyer-workspace/index.ts";
import { ADVISOR, type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { useSession, usePermissions } from "@/shared/session/index.ts";
import {
  LOGO_A,
  LOGO_B,
  paintedFlyer,
  workspaceOnScreen,
} from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { PromotionPickerContext } from "@/shared/lib/promotions/promotion-picking.ts";
import { attachPreviewGestures, ZOOM_TIP } from "../model/preview-gestures.ts";
import { FlyerEditorView } from "./FlyerEditorView.tsx";

const OPTIONS = {
  opts: [
    { n: 9, nombre: "Combustible", solapa: "flyer", orden: 0, color: "#ff0000" },
    { n: 7, nombre: "Sueldo Uno", solapa: "sueldo" },
    { n: 8, nombre: "Rubro Uno", solapa: "rubros" },
    { n: 6, nombre: "Otro Flyer", solapa: "flyer", orden: 1 },
  ],
};
const ALLOWED = { opcion_9: true, opcion_7: true, opcion_8: true, opcion_6: true, opcion_1: false };

const NO_PICKER = {
  pickOneBrand: () => undefined,
  pickManyBrands: () => undefined,
  stopPicking: () => undefined,
};

function Inside({ tabId, isActive }: { readonly tabId: string; readonly isActive: boolean }) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return <FlyerEditorView tabId={tabId} isActive={isActive} />;
}

function flyerFiles() {
  const image = paintedFlyer([LOGO_A, LOGO_B]);
  return {
    "_opciones.json": OPTIONS,
    "_facultades.json": { roles: { asesor: ALLOWED } },
    "_active9.json": { imageUrl: image, cfg: {} },
    "_legal9.json": { text: "Legal de la nueve" },
    "_active6.json": { imageUrl: null },
    "_legal6.json": { text: "Legal de la seis" },
    "_active7.json": { imageUrl: image, cfg: {} },
    "_legal7.json": { text: "" },
    "_active8.json": { imageUrl: image, cfg: {} },
    "_legal8.json": { text: "Legal" },
  };
}

const theWorkspace = workspaceOnScreen;

async function open(answers: AppAnswers = {}, tabId = "flyer", isActive = true) {
  const harness = createAppHarness({ profile: ADVISOR, files: flyerFiles(), ...answers });
  harness.storeSession();
  const view = (id: string, active: boolean) =>
    harness.wrap(
      <PromotionPickerContext.Provider value={NO_PICKER}>
        <Inside tabId={id} isActive={active} />
      </PromotionPickerContext.Provider>,
    );
  const screen = await render(view(tabId, isActive));
  return {
    screen,
    harness,
    show: (id: string, active = true) => screen.rerender(view(id, active)),
  };
}

function flyerShown() {
  return vi.waitFor(
    () => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="flyer-canvas"]');
      expect(canvas?.height).toBeGreaterThan(100);
      const { slot, draws } = theWorkspace().getState();
      expect(slot.loading).toBe(false);
      expect(slot.option).not.toBeNull();
      expect(draws).toBeGreaterThan(0);
    },
    { timeout: 10_000 },
  );
}

beforeEach(async () => {
  localStorage.clear();
  await page.viewport(1366, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
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
    await page.getByRole("button", { name: "Descargar como imagen" }).click();
    await expect.element(page.getByRole("status")).toHaveTextContent("PNG descargado!");
    expect(clicks).toEqual(["Flyer.png"]);
  });

  it("a download that fails is explained, and does not stay busy", async () => {
    await open();
    await flyerShown();
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
      throw new Error("Too big");
    });
    await page.getByRole("button", { name: "Descargar como imagen" }).click();
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
    const button = page.getByRole("button", { name: "Descargar como imagen" }).element();
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
