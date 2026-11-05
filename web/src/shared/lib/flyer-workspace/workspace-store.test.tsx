import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  EMPTY_FLYER_SLOT,
  type FlyerScene,
  resolveCalibration,
} from "@/shared/flyer-engine/index.ts";
import { failure, success } from "@/shared/supabase/index.ts";
import { allowedOptions, emptyFormValues, firstOptionOf, tabOfOption } from "./flyer-tab.ts";
import { FlyerWorkspaceProvider } from "./FlyerWorkspaceProvider.tsx";
import { createOptionLoader, type LoadedOption } from "./option-loader.ts";
import { activeFile, legalFile } from "./option-files.ts";
import { workspaceOnScreen } from "./testing/painted-flyer.ts";
import { useFlyerWorkspace, useWorkspaceValue } from "./workspace-context.ts";
import { workspaceReadings } from "./workspace-readings.ts";
import { blockReason, createFlyerWorkspace } from "./workspace-store.ts";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";

function sceneOf(key: string, width = 400, height = 600): FlyerScene {
  const art = document.createElement("canvas");
  art.width = width;
  art.height = height;
  return {
    art,
    artKey: key,
    calibration: resolveCalibration({}),
    singleCashback: false,
    whole: { art, artKey: key, rawCalibration: {} },
    cuts: [],
  };
}

function workspaceWith(loadOption = vi.fn<(option: number) => Promise<LoadedOption>>()) {
  return {
    loadOption,
    workspace: createFlyerWorkspace({
      loadOption,
      fetchLogo: () => Promise.reject(new Error("No logos here")),
      initialForm: emptyFormValues("flyer"),
    }),
  };
}

const LOADED = (key: string, legal = "Legal"): LoadedOption => ({
  scene: sceneOf(key),
  failure: null,
  legal,
});

function canAllButTwo(key: string): boolean {
  return key !== "opcion_2";
}

function fakeBucket(active: unknown, legal: unknown) {
  return {
    readJson: vi.fn<(file: string) => Promise<unknown>>((file) =>
      Promise.resolve(file.startsWith("_active") ? active : legal),
    ),
    publicUrl: vi.fn<() => string>(),
    upload: vi.fn<() => void>(),
    list: vi.fn<() => void>(),
    remove: vi.fn<() => void>(),
  };
}

function smallImage(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 10;
  canvas.height = 10;
  return canvas.toDataURL();
}

function read(active: unknown, legal: unknown, option = 9) {
  const reader = fakeBucket(active, legal);
  // @ts-expect-error -- the answers are what a file can say, whatever its shape.
  return createOptionLoader(reader)(option, { singleCashback: false });
}

function ShowsZoom() {
  useFlyerWorkspace();
  const zoom = useWorkspaceValue((state) => state.zoom);
  return <p>Zoom {zoom}</p>;
}

describe("the option on screen", () => {
  it("a flyer that arrives late does not step on the one chosen after (invariant 6)", async () => {
    const answers = new Map<number, (loaded: LoadedOption) => void>();
    const { workspace } = workspaceWith(
      vi.fn<(option: number) => Promise<LoadedOption>>(
        (option) =>
          new Promise((resolve) => {
            answers.set(option, resolve);
          }),
      ),
    );
    void workspace.selectOption(1, false);
    void workspace.selectOption(2, false);
    answers.get(2)?.(LOADED("two", "Legal dos"));
    await vi.waitFor(() => {
      expect(workspace.getState().slot.scene?.artKey).toBe("two");
    });
    answers.get(1)?.(LOADED("one", "Legal uno"));
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(workspace.getState().slot.scene?.artKey).toBe("two");
    expect(workspace.getState().legal).toBe("Legal dos");
  });

  it("an option with no picture does not touch what is drawn (invariant 23)", async () => {
    const { workspace, loadOption } = workspaceWith();
    loadOption.mockResolvedValueOnce(LOADED("one"));
    loadOption.mockResolvedValueOnce({ scene: null, failure: "no-flyer", legal: "" });
    await workspace.selectOption(1, false);
    await vi.waitFor(() => {
      expect(workspace.getState().slot.scene?.artKey).toBe("one");
    });
    workspace.fitToWidth(400);
    await workspace.selectOption(2, false);
    await vi.waitFor(() => {
      expect(workspace.getState().slot.failure).toBe("no-flyer");
    });
    expect(workspace.getState().slot.scene?.artKey).toBe("one");
    expect(workspace.renderDownload()).toBeNull();
  });

  it("a fact is remembered; what could not arrive is asked again (invariant 24)", async () => {
    const { workspace, loadOption } = workspaceWith();
    loadOption.mockResolvedValue({ scene: null, failure: "no-flyer", legal: "" });
    await workspace.selectOption(1, false);
    await workspace.selectOption(1, false);
    expect(loadOption).toHaveBeenCalledTimes(1);
    loadOption.mockResolvedValue({ scene: null, failure: "network", legal: null });
    await workspace.selectOption(2, false);
    await workspace.selectOption(2, false);
    expect(loadOption).toHaveBeenCalledTimes(3);
    loadOption.mockResolvedValue(LOADED("two"));
    await workspace.retryLoading(false);
    await vi.waitFor(() => {
      expect(workspace.getState().slot.scene?.artKey).toBe("two");
    });
    await workspace.selectOption(2, false);
    expect(loadOption).toHaveBeenCalledTimes(4);
  });

  it("two asking at once are one request, and with nothing on screen there is nothing to retry", async () => {
    const { workspace, loadOption } = workspaceWith();
    expect(await workspace.retryLoading(false)).toBeNull();
    loadOption.mockResolvedValue(LOADED("one"));
    await Promise.all([workspace.selectOption(1, false), workspace.selectOption(1, false)]);
    expect(loadOption).toHaveBeenCalledTimes(1);
  });

  it("the scale goes with the room and the zoom, and a frame needs both", async () => {
    const { workspace, loadOption } = workspaceWith();
    expect(workspace.readFrame()).toBeNull();
    loadOption.mockResolvedValue(LOADED("one"));
    await workspace.selectOption(1, false);
    await vi.waitFor(() => {
      expect(workspace.getState().slot.scene).not.toBeNull();
    });
    expect(workspace.readFrame()).toBeNull();
    workspace.fitToWidth(100);
    expect(workspace.getState().scale).toBeCloseTo(0.5, 5);
    workspace.setZoom(1.25);
    expect(workspace.getState().scale).toBeCloseTo(0.625, 5);
    workspace.fitToWidth(10_000);
    expect(workspace.getState().scale).toBeCloseTo(0.55 * 1.25, 5);
    expect(workspace.readFrame()?.values.legal).toBe("Legal");
  });

  it("the values carry the logos only when there are some, and restoring goes back to the legal", async () => {
    const { workspace, loadOption } = workspaceWith();
    loadOption.mockResolvedValue(LOADED("one", "Legal guardado"));
    await workspace.selectOption(1, false);
    await vi.waitFor(() => {
      expect(workspace.getState().slot.scene).not.toBeNull();
    });
    expect(workspace.currentValues().logos).toBeUndefined();
    workspace.setLogoChanges([{ x: 0, y: 0, w: 1, h: 1, bg: "red" }], "otro");
    expect(workspace.currentValues().logos).toBeUndefined();
    workspace.setLogoChanges([{ x: 0, y: 0, w: 1, h: 1, bg: "red" }], "one");
    expect(workspace.currentValues()).toMatchObject({ logosSrc: "one" });
    expect(workspace.currentValues().logos).toHaveLength(1);
    workspace.restoreForm(emptyFormValues("flyer"));
    expect(workspace.getState().legal).toBe("Legal guardado");
    workspace.setForm(emptyFormValues("rubros"));
    expect(workspace.getState().form.benef).toBe(true);
    const canvas = workspace.renderDownload();
    expect(canvas?.width).toBe(400);
  });

  it("tells who listens, until it stops; and draws through the preview it was given", () => {
    const { workspace } = workspaceWith();
    const heard = vi.fn<() => void>();
    const stop = workspace.subscribe(heard);
    workspace.noteDrawn(10);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(workspace.getState()).toMatchObject({ extra: 10, draws: 1 });
    stop();
    workspace.noteDrawn(10);
    expect(heard).toHaveBeenCalledTimes(1);
    const preview = {
      drawNow: vi.fn<() => void>(),
      requestDraw: vi.fn<() => void>(),
      dispose: vi.fn<() => void>(),
    };
    workspace.drawNow();
    workspace.attachPreview(preview);
    workspace.drawNow();
    workspace.requestDraw();
    expect(preview.drawNow).toHaveBeenCalledTimes(1);
    expect(preview.requestDraw).toHaveBeenCalledTimes(1);
  });
});

describe("why it cannot be downloaded", () => {
  const scene = sceneOf("one");
  it("says each reason in words", () => {
    const base = { ...EMPTY_FLYER_SLOT, option: 1 };
    expect(blockReason({ ...base, loading: true }, "A", false)).toMatch(/todavía se está cargando/);
    expect(blockReason({ ...base, failure: "network" }, "A", false)).toMatch(/Reintentar/);
    expect(blockReason({ ...base, failure: "no-flyer" }, "A", false)).toMatch(/Avisale/);
    expect(blockReason({ ...base, failure: "no-flyer" }, "A", true)).toMatch(/Config → Flyers/);
    expect(blockReason(base, "A", false)).toMatch(/Todavía no se cargó/);
    expect(blockReason({ ...base, scene }, "A", false)).toBe("");
  });
});

describe("the tabs of the flyer editor", () => {
  const options = sanitizeFlyerOptions([
    { n: 1 },
    { n: 2, solapa: "rubros" },
    { n: 3, solapa: "rubros" },
    { n: 4, solapa: "sueldo" },
  ]);

  it("an option lives in a tab, and each tab has its options", () => {
    expect(tabOfOption(options, 2)).toBe("rubros");
    expect(tabOfOption(options, 99)).toBe("flyer");
    expect(allowedOptions(options, "rubros", canAllButTwo)).toEqual([3]);
  });

  it("everybody starts on option 1 if they have it, or on the first, or where they were", () => {
    expect(firstOptionOf([3, 1])).toBe(1);
    expect(firstOptionOf([3, 2])).toBe(3);
    expect(firstOptionOf([])).toBe(1);
    expect(firstOptionOf([3, 2], 2)).toBe(2);
    expect(firstOptionOf([3, 2], 9)).toBe(3);
  });

  it("each tab draws its own: rubros the benefit, sueldo one cashback", () => {
    expect(emptyFormValues("rubros")).toMatchObject({ benef: true, cashUnico: false });
    expect(emptyFormValues("sueldo", { m1: "$1" }, "BAU")).toMatchObject({
      cashUnico: true,
      m1: "$1",
      config: "BAU",
    });
  });

  it("option 1 has no number in the names of its files", () => {
    expect(activeFile(1)).toBe("_active.json");
    expect(activeFile(9)).toBe("_active9.json");
    expect(legalFile(1)).toBe("_legal.json");
    expect(legalFile(9)).toBe("_legal9.json");
  });
});

describe("reading an option", () => {
  const notFound = failure({ kind: "not-found", status: 404 } as const);
  const noNetwork = failure({ kind: "unreachable", status: null } as const);
  const notJson = failure({ kind: "invalid", status: 200 } as const);

  it("with no file or no picture, it is a fact: there is no flyer", async () => {
    expect(await read(notFound, success({ text: "L" }))).toEqual({
      scene: null,
      failure: "no-flyer",
      legal: "L",
    });
    expect((await read(success({ imageUrl: "" }), notFound)).failure).toBe("no-flyer");
    expect((await read(success(null), success({ text: 3 }))).legal).toBe("");
  });

  it("what could not be fetched, or does not read, is not a fact", async () => {
    expect((await read(noNetwork, notFound)).failure).toBe("network");
    expect((await read(notJson, notFound)).failure).toBe("network");
    expect(await read(success({ imageUrl: smallImage() }), noNetwork)).toEqual({
      scene: null,
      failure: "network",
      legal: null,
    });
  });

  it("a legal text that is not JSON is as if there was none, and a broken picture is a failure", async () => {
    const good = await read(success({ imageUrl: smallImage(), cfg: { imgW: 10 } }), notJson);
    expect(good.scene?.calibration.imgW).toBe(10);
    expect(good.legal).toBe("");
    const without = await read(success({ imageUrl: smallImage(), cfg: 3 }), notFound);
    expect(without.scene).not.toBeNull();
    expect(
      (await read(success({ imageUrl: "data:image/png;base64,AAAA" }), notFound)).failure,
    ).toBe("network");
  });
});

describe("the legal text of an option that never saved one", () => {
  const notFound = failure({ kind: "not-found", status: 404 } as const);
  const noNetwork = failure({ kind: "unreachable", status: null } as const);

  it("option 1 keeps the text it always had; the others have none", async () => {
    expect((await read(success({ imageUrl: "" }), notFound, 1)).legal).toMatch(
      /^Cartera de Consumo/,
    );
    expect((await read(success({ imageUrl: "" }), success({ text: 3 }), 1)).legal).toMatch(
      /^Cartera de Consumo/,
    );
    expect((await read(success({ imageUrl: "" }), notFound, 2)).legal).toBe("");
  });

  it("saved empty on purpose is empty, and what could not arrive is not known", async () => {
    expect((await read(success({ imageUrl: "" }), success({ text: "" }), 1)).legal).toBe("");
    expect((await read(success({ imageUrl: "" }), noNetwork, 1)).legal).toBeNull();
  });
});

async function onScreen(option: number) {
  const opened = workspaceWith();
  opened.loadOption.mockImplementation((asked) =>
    Promise.resolve(LOADED(String(asked), `Guardado ${String(asked)}`)),
  );
  await opened.workspace.selectOption(option, false);
  await vi.waitFor(() => {
    expect(opened.workspace.getState().legal).toBe(`Guardado ${String(option)}`);
  });
  return opened;
}

describe("the legal text that was edited", () => {
  it("stays with its option on going and coming back", async () => {
    const { workspace } = await onScreen(1);
    workspace.setLegal("Editado");
    await workspace.selectOption(2, false);
    await vi.waitFor(() => {
      expect(workspace.getState().legal).toBe("Guardado 2");
    });
    expect(workspace.optionLegal()).toBe("Guardado 2");

    await workspace.selectOption(1, false);
    expect(workspace.getState().legal).toBe("Editado");
    expect(workspace.optionLegal()).toBe("Editado");
  });

  it("the same as the saved one is not an edit", async () => {
    const { workspace } = await onScreen(1);
    workspace.setLegal("Editado");
    await workspace.selectOption(2, false);
    await workspace.selectOption(1, false);
    workspace.setLegal("Guardado 1");
    expect(workspace.optionLegal()).toBe("Editado");
    await workspace.selectOption(2, false);
    await workspace.selectOption(1, false);
    expect(workspace.optionLegal()).toBe("Guardado 1");
  });

  it("while another one is on its way there is no legal of anybody", async () => {
    const { workspace, loadOption } = await onScreen(1);
    const coming: ((loaded: LoadedOption) => void)[] = [];
    loadOption.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          coming.push(resolve);
        }),
    );
    const going = workspace.selectOption(2, false);
    expect(workspace.getState().legal).toBe("");
    // A second click during the load: the empty field is not an edit of the one that is coming.
    void workspace.selectOption(2, false);
    coming[0]?.(LOADED("2", "Guardado 2"));
    await going;
    await vi.waitFor(() => {
      expect(workspace.getState().legal).toBe("Guardado 2");
    });
  });

  it("restoring forgets the edit, of that option only", async () => {
    const { workspace } = await onScreen(1);
    workspace.setLegal("Editado");
    await workspace.selectOption(2, false);
    workspace.setLegal("Otro editado");
    workspace.restoreForm(emptyFormValues("flyer"));
    expect(workspace.getState().legal).toBe("Guardado 2");
    await workspace.selectOption(1, false);
    expect(workspace.getState().legal).toBe("Editado");
  });

  it("an option that says nothing of its legal keeps what it had", async () => {
    const { workspace, loadOption } = await onScreen(1);
    loadOption.mockResolvedValueOnce({ scene: sceneOf("3"), failure: null, legal: null });
    await workspace.selectOption(3, false);
    await vi.waitFor(() => {
      expect(workspace.getState().slot.scene?.artKey).toBe("3");
    });
    expect(workspace.getState().legal).toBe("");
    expect(workspace.optionLegal()).toBe("");
    workspace.setLegal("Escrito");
    await workspace.selectOption(1, false);
    expect(workspace.getState().legal, "with no base it is not known to be an edit").toBe(
      "Guardado 1",
    );
  });

  it("restoring with nothing on screen leaves the field", () => {
    const { workspace } = workspaceWith();
    workspace.setLegal("Algo");
    workspace.restoreForm(emptyFormValues("flyer"));
    expect(workspace.getState().legal).toBe("Algo");
  });
});

describe("what a test reads of the flyer", () => {
  it("the parts in bold of a legal text", () => {
    const readings = workspaceReadings(workspaceWith().workspace);
    expect(readings.boldParts("uno **dos** tres **cuatro **")).toEqual(["dos", "cuatro"]);
    expect(readings.boldParts("nada")).toEqual([]);
  });

  it("whether an option arrived, and whether it is ready", async () => {
    const { workspace, loadOption } = await onScreen(1);
    const readings = workspaceReadings(workspace);
    expect(readings.optionStatus(1)).toEqual({ settled: true, hasArtwork: true, ready: true });
    expect(readings.optionStatus(2)).toEqual({ settled: false, hasArtwork: null, ready: false });
    loadOption.mockResolvedValueOnce({ scene: null, failure: "no-flyer", legal: "" });
    await workspace.selectOption(2, false);
    await vi.waitFor(() => {
      expect(workspace.getState().slot.failure).toBe("no-flyer");
    });
    expect(readings.optionStatus(2)).toEqual({ settled: true, hasArtwork: false, ready: false });
    expect(readings.optionStatus(1).ready).toBe(false);
  });

  it("draws a flyer of another moment only if there is one", async () => {
    const made = vi.spyOn(document, "createElement");
    workspaceReadings(workspaceWith().workspace).renderWith({ empresa: "BETA" });
    expect(made).not.toHaveBeenCalledWith("canvas");
    const { workspace } = await onScreen(1);
    workspaceReadings(workspace).renderWith({ empresa: "BETA" });
    expect(made).toHaveBeenCalledWith("canvas");
    made.mockRestore();
  });
});

describe("whether an option has a flyer", () => {
  it("is known only once it came", async () => {
    const { workspace, loadOption } = workspaceWith();
    expect(workspace.hasFlyer(1)).toBeUndefined();
    loadOption.mockResolvedValueOnce(LOADED("one"));
    await workspace.selectOption(1, false);
    expect(workspace.hasFlyer(1)).toBe(true);
    loadOption.mockResolvedValueOnce({ scene: null, failure: "no-flyer", legal: "" });
    await workspace.selectOption(2, false);
    expect(workspace.hasFlyer(2)).toBe(false);
    loadOption.mockResolvedValueOnce({ scene: null, failure: "network", legal: null });
    await workspace.selectOption(3, false);
    expect(workspace.hasFlyer(3), "it could not be asked").toBeUndefined();
  });
});

describe("the context", () => {
  it("needs its provider", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(render(<ShowsZoom />)).rejects.toThrow(/FlyerWorkspaceProvider/);
    vi.restoreAllMocks();
  });
});

describe("what a test reads of it", () => {
  it("says so when there is none on screen", () => {
    const probes = window["__flyerProbe"];
    Reflect.deleteProperty(window, "__flyerProbe");
    expect(workspaceOnScreen).toThrow(/not on screen/);
    window["__flyerProbe"] = { flyerWorkspace: () => 3 };
    expect(workspaceOnScreen).toThrow(/not on screen/);
    window["__flyerProbe"] = {};
    expect(workspaceOnScreen).toThrow(/not on screen/);
    Reflect.set(window, "__flyerProbe", probes);
  });
});

describe("the provider", () => {
  it("is what lets everything below read the store", async () => {
    const { createAppHarness } = await import("@/shared/lib/testing/app-harness.tsx");
    const harness = createAppHarness();
    const screen = await render(
      harness.wrap(
        <FlyerWorkspaceProvider>
          <ShowsZoom />
        </FlyerWorkspaceProvider>,
      ),
    );
    await expect.element(screen.getByText("Zoom 1")).toBeVisible();
    expect(workspaceOnScreen().getState().zoom).toBe(1);
  });

  it("what a test reads with nothing on screen, and the legal text of a draft", async () => {
    const { workspace, loadOption } = workspaceWith();
    const readings = workspaceReadings(workspace);
    expect(readings.legalWith("{cashback}")).toBe("");
    expect(readings.optionCalibration(1)).toEqual({});
    expect(workspace.optionLegal()).toBe("");
    workspace.setCuts([{ y: 1, h: 1 }]);
    expect(workspace.getState().slot.scene).toBeNull();
    loadOption.mockResolvedValueOnce(LOADED("one", "Legal uno"));
    await workspace.selectOption(1, false);
    await vi.waitFor(() => {
      expect(workspace.getState().legal).toBe("Legal uno");
    });
    workspace.setLegal("Otro");
    expect(workspace.getState().legal).toBe("Otro");
    expect(workspace.optionLegal()).toBe("Legal uno");
    expect(readings.optionCalibration(1)).toEqual(workspace.optionScene(1)?.calibration);
    expect(workspace.sections.isOurs("x")).toBe(false);
  });

  it("a picture that arrives comes whole and with its calibration, whatever was cut (invariant 22)", async () => {
    const { workspace, loadOption } = workspaceWith();
    loadOption.mockResolvedValueOnce(LOADED("one"));
    loadOption.mockResolvedValueOnce(LOADED("two"));
    await workspace.selectOption(1, false);
    await vi.waitFor(() => {
      expect(workspace.getState().slot.scene?.artKey).toBe("one");
    });
    const whole = workspace.getState().slot.scene?.art;
    workspace.setCuts([{ y: 10, h: 20 }]);
    const cut = workspace.getState().slot.scene;
    expect(cut?.artKey).toBe("one#rec=10-20");
    expect(cut?.art).not.toBe(whole);
    expect(workspace.currentValues().recortes).toEqual([{ y: 10, h: 20 }]);
    await workspace.selectOption(2, false);
    await vi.waitFor(() => {
      expect(workspace.getState().slot.scene?.artKey).toBe("two");
    });
    expect(workspace.getState().slot.scene?.cuts).toEqual([]);
    expect(workspace.currentValues().recortes).toBeUndefined();
    // Coming back, it is not the cropped one that was left.
    await workspace.selectOption(1, false);
    await vi.waitFor(() => {
      expect(workspace.getState().slot.scene?.artKey).toBe("one");
    });
    expect(workspace.getState().slot.scene?.art).toBe(whole);
  });

  it("cuts are counted from the whole flyer: a second one does not cut what was cut", async () => {
    const { workspace, loadOption } = workspaceWith();
    loadOption.mockResolvedValueOnce(LOADED("one"));
    await workspace.selectOption(1, false);
    await vi.waitFor(() => {
      expect(workspace.getState().slot.scene?.artKey).toBe("one");
    });
    const height = workspace.getState().slot.scene?.art.height ?? 0;
    workspace.setCuts([{ y: 10, h: 20 }]);
    workspace.setCuts([{ y: 10, h: 20 }]);
    expect(workspace.getState().slot.scene?.art.height).toBe(height - 20);
    workspace.setCuts([]);
    expect(workspace.getState().slot.scene?.art.height).toBe(height);
    expect(workspace.getState().slot.scene?.artKey).toBe("one");
  });
});
