import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { saveFlyerPdf } from "@/shared/flyer-engine/index.ts";
import {
  createFlyerWorkspace,
  emptyFormValues,
  FlyerWorkspaceProvider,
  useFlyerWorkspace,
} from "@/shared/lib/flyer-workspace/index.ts";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { failure, success } from "@/shared/supabase/index.ts";
import { LOGO_A, paintedFlyer } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { useFlyerDownload } from "./use-flyer-download.ts";
import { attachPreviewDrawing } from "./preview-drawing.ts";

const saving = vi.hoisted((): { result: () => ReturnType<typeof saveFlyerPdf> } => ({
  result: () => Promise.resolve({ ok: true, value: true }),
}));

vi.mock("@/shared/flyer-engine/index.ts", async (original) => ({
  ...(await original<typeof import("@/shared/flyer-engine/index.ts")>()),
  saveFlyerPdf: () => saving.result(),
}));

function Buttons() {
  const { download, busy } = useFlyerDownload();
  const workspace = useFlyerWorkspace();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void download("pdf");
        }}
      >
        {busy ? "Ocupado" : "Bajar"}
      </button>
      <button
        type="button"
        onClick={() => {
          void workspace.selectOption(9, false);
        }}
      >
        Traer
      </button>
    </>
  );
}

async function open() {
  const harness = createAppHarness({
    files: {
      "_active9.json": { imageUrl: paintedFlyer([LOGO_A]), cfg: {} },
      "_legal9.json": { text: "Legal" },
    },
  });
  const screen = await render(
    harness.wrap(
      <FlyerWorkspaceProvider>
        <Buttons />
      </FlyerWorkspaceProvider>,
    ),
  );
  return { screen, harness };
}

beforeEach(() => {
  saving.result = () => Promise.resolve(success(true));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloading", () => {
  it("before there is a flyer it says to wait", async () => {
    const { screen } = await open();
    await screen.getByRole("button", { name: "Bajar" }).click();
    await expect.element(screen.getByRole("status")).toMatchTextContent(/Todavía no se cargó/);
  });

  it("while the flyer changes it waits, and after it says what it did", async () => {
    const { screen } = await open();
    await screen.getByRole("button", { name: "Traer" }).click();
    await screen.getByRole("button", { name: "Bajar" }).click();
    await expect
      .element(screen.getByRole("status"))
      .toMatchTextContent(/todavía se está cargando|descargado|Generando/);
    await vi.waitFor(async () => {
      await screen.getByRole("button", { name: "Bajar" }).click();
      await expect
        .element(screen.getByRole("status"), { timeout: 500 })
        .toHaveTextContent("PDF descargado!");
    });
  });

  it("a library that does not arrive says to check the connection", async () => {
    const { screen } = await open();
    await screen.getByRole("button", { name: "Traer" }).click();
    saving.result = () => Promise.resolve(failure({ kind: "library", detail: "No" }));
    await vi.waitFor(async () => {
      await screen.getByRole("button", { name: "Bajar" }).click();
      await expect
        .element(screen.getByRole("status"), { timeout: 500 })
        .toHaveTextContent("No se pudo preparar el PDF. Revisá la conexión y probá de nuevo.");
    });
    await expect.element(screen.getByRole("button", { name: "Bajar" })).toBeVisible();
  });

  it("something that breaks while generating is said, and frees the button", async () => {
    const { screen } = await open();
    await screen.getByRole("button", { name: "Traer" }).click();
    saving.result = () => Promise.reject(new Error("Boom"));
    await vi.waitFor(async () => {
      await screen.getByRole("button", { name: "Bajar" }).click();
      await expect
        .element(screen.getByRole("status"), { timeout: 500 })
        .toMatchTextContent(/No se pudo generar el PDF/);
    });
  });
});

describe("the drawing of the preview", () => {
  it("with the pane hidden it does not measure, and stops when it is asked", () => {
    const pane = document.createElement("div");
    pane.hidden = true;
    document.body.append(pane);
    const canvas = document.createElement("canvas");
    const workspace = createFlyerWorkspace({
      loadOption: () => Promise.resolve({ scene: null, failure: "no-flyer", legal: "" }),
      fetchLogo: () => Promise.reject(new Error("No")),
      initialForm: emptyFormValues("flyer"),
    });
    const fitting = vi.spyOn(workspace, "fitToWidth");
    const asking = vi.spyOn(workspace, "attachPreview");
    const stop = attachPreviewDrawing({ canvas, pane, workspace, onTip: () => undefined });
    expect(fitting).not.toHaveBeenCalled();
    stop();
    expect(asking).toHaveBeenLastCalledWith(null);
    pane.remove();
  });
});
