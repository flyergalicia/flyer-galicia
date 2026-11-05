import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { createFlyerPdf } from "@/shared/flyer-engine/index.ts";
import { FlyerWorkspaceProvider, useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import {
  LOGO_A,
  paintedFlyer,
  readingsOnScreen,
} from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { failure } from "@/shared/supabase/index.ts";
import { FlyerFormProvider } from "../ui/FlyerFormProvider.tsx";
import { useFlyerForm } from "./form-context.ts";
import { withOfficerField } from "./form-state.ts";
import { canSharePdf, useFlyerShare } from "./use-flyer-share.ts";

const creating = vi.hoisted((): { failing: boolean | "library" } => ({ failing: false }));

vi.mock("@/shared/flyer-engine/index.ts", async (original) => {
  const engine = await original<typeof import("@/shared/flyer-engine/index.ts")>();
  const real = engine.createFlyerPdf;
  return {
    ...engine,
    createFlyerPdf: (canvas: Parameters<typeof createFlyerPdf>[0]) =>
      creating.failing
        ? Promise.resolve(
            failure({
              kind: creating.failing === "library" ? "library" : "generation",
              detail: "No",
            }),
          )
        : real(canvas),
  };
});

interface Device {
  readonly canShare?: () => boolean;
  readonly share?: (data: ShareData) => Promise<void>;
}

function device({ canShare, share }: Device) {
  Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
}

/** What the browser of the tests has: no way of sharing a file. */
function noDevice() {
  Reflect.deleteProperty(navigator, "canShare");
  Reflect.deleteProperty(navigator, "share");
}

function Buttons({
  checkBefore,
  afterDownload,
}: {
  readonly checkBefore?: (goOn: () => void) => boolean;
  readonly afterDownload?: () => void;
}) {
  const { share, sharing, isOffered } = useFlyerShare({
    ...(checkBefore ? { checkBefore } : {}),
    ...(afterDownload ? { afterDownload } : {}),
  });
  const workspace = useFlyerWorkspace();
  const form = useFlyerForm();
  return (
    <>
      <span data-testid="offered">{String(isOffered)}</span>
      <button
        type="button"
        onClick={() => {
          share();
        }}
      >
        {sharing ? "Compartiendo" : "Compartir"}
      </button>
      <button
        type="button"
        onClick={() => {
          share(document.createElement("canvas"));
        }}
      >
        Lo que se ve
      </button>
      <button
        type="button"
        onClick={() => {
          void workspace.selectOption(9, false);
        }}
      >
        Traer
      </button>
      <button
        type="button"
        onClick={() => {
          form.update((state) =>
            withOfficerField(withOfficerField(state, 0, "nombre", "Ana"), 0, "celular", "123"),
          );
        }}
      >
        Mal celular
      </button>
    </>
  );
}

async function open(props: Parameters<typeof Buttons>[0] = {}) {
  const harness = createAppHarness({
    files: {
      "_active9.json": { imageUrl: paintedFlyer([LOGO_A]), cfg: {} },
      "_legal9.json": { text: "Legal" },
    },
  });
  harness.storeSession();
  const screen = await render(
    harness.wrap(
      <FlyerWorkspaceProvider>
        <FlyerFormProvider>
          <Buttons {...props} />
        </FlyerFormProvider>
      </FlyerWorkspaceProvider>,
    ),
  );
  return { screen, harness };
}

async function withFlyer(screen: Awaited<ReturnType<typeof open>>["screen"]) {
  await screen.getByRole("button", { name: "Traer" }).click();
  await vi.waitFor(() => {
    expect(readingsOnScreen().blockText()).toBe("");
  });
}

beforeEach(() => {
  creating.failing = false;
  localStorage.clear();
  noDevice();
});

describe("whether it can be offered", () => {
  it("a browser with no way of sharing a file is not offered it", () => {
    expect(canSharePdf()).toBe(false);
    Object.defineProperty(navigator, "share", { value: () => undefined, configurable: true });
    expect(canSharePdf(), "sharing, but no way of asking").toBe(false);
  });

  it("one that says yes, or no", () => {
    device({ canShare: () => true, share: () => Promise.resolve() });
    expect(canSharePdf()).toBe(true);
    device({ canShare: () => false, share: () => Promise.resolve() });
    expect(canSharePdf()).toBe(false);
  });

  it("one that throws, as if it said no", () => {
    device({
      canShare: () => {
        throw new TypeError("No");
      },
      share: () => Promise.resolve(),
    });
    expect(canSharePdf()).toBe(false);
  });
});

describe("sharing", () => {
  it("sends a PDF with the name of the file, says so, and leaves its record", async () => {
    const shared: ShareData[] = [];
    device({
      canShare: () => true,
      share: (data) => {
        shared.push(data);
        return Promise.resolve();
      },
    });
    const afterDownload = vi.fn<() => void>();
    const { screen, harness } = await open({ afterDownload });
    await expect.element(screen.getByTestId("offered")).toHaveTextContent("true");
    await withFlyer(screen);
    await screen.getByRole("button", { name: "Compartir" }).click();
    await expect.element(screen.getByRole("status")).toHaveTextContent("Flyer compartido");
    const [{ files, title } = {}] = shared;
    expect(title).toBe("Flyer");
    expect(files?.[0]?.type).toBe("application/pdf");
    expect(files?.[0]?.name).toBe("Flyer.pdf");
    expect(afterDownload).toHaveBeenCalledOnce();
    const [log] = harness.network.to("/rest/v1/flyer_logs", "POST");
    expect(log?.body).toMatchObject({ format: "compartir" });
  });

  it("what is wrong is said after, and it went anyway", async () => {
    device({ canShare: () => true, share: () => Promise.resolve() });
    const { screen } = await open();
    await withFlyer(screen);
    await screen.getByRole("button", { name: "Mal celular" }).click();
    await screen.getByRole("button", { name: "Compartir" }).click();
    await expect.element(screen.getByRole("status")).toHaveTextContent("Flyer compartido");
    await expect
      .element(screen.getByRole("status"), { timeout: 4000 })
      .toMatchTextContent(/Ojo: revisá el celular de Ana \(se generó igual\)/);
  });

  it("while it shares it does not go again", async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(
      () =>
        new Promise(() => {
          // The menu of the device stays open.
        }),
    );
    device({ canShare: () => true, share });
    const { screen } = await open();
    await withFlyer(screen);
    await screen.getByRole("button", { name: "Compartir" }).click();
    await expect.element(screen.getByRole("button", { name: "Compartiendo" })).toBeVisible();
    await screen.getByRole("button", { name: "Compartiendo" }).click();
    await vi.waitFor(() => {
      expect(share).toHaveBeenCalledOnce();
    });
  });

  it("closing the menu of the device is not an error, and leaves no record", async () => {
    device({
      canShare: () => true,
      share: () => Promise.reject(new DOMException("Closed", "AbortError")),
    });
    const { screen, harness } = await open();
    await withFlyer(screen);
    await screen.getByRole("button", { name: "Compartir" }).click();
    await expect.element(screen.getByRole("button", { name: "Compartir" })).toBeVisible();
    expect(harness.network.to("/rest/v1/flyer_logs", "POST")).toEqual([]);
    expect(screen.getByRole("status").element().textContent).not.toMatch(/compartido/);
  });

  const refusals: readonly (readonly [string, Error, RegExp])[] = [
    [
      "the gesture was lost",
      new DOMException("Late", "NotAllowedError"),
      /Tocá Compartir de nuevo/,
    ],
    ["another reason", new Error("Boom"), /No se pudo abrir el menú de compartir/],
  ];
  for (const [what, cause, text] of refusals) {
    it(`${what} is explained`, async () => {
      device({ canShare: () => true, share: () => Promise.reject(cause) });
      const { screen, harness } = await open();
      await withFlyer(screen);
      await screen.getByRole("button", { name: "Compartir" }).click();
      await expect.element(screen.getByRole("status")).toMatchTextContent(text);
      expect(harness.network.to("/rest/v1/flyer_logs", "POST")).toEqual([]);
    });
  }

  it("a PDF that cannot be made is said, with its reason", async () => {
    device({ canShare: () => true, share: () => Promise.resolve() });
    const { screen } = await open();
    await withFlyer(screen);
    creating.failing = true;
    await screen.getByRole("button", { name: "Compartir" }).click();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("No se pudo armar el PDF. Probá con Descargar PDF.");
    creating.failing = "library";
    await screen.getByRole("button", { name: "Compartir" }).click();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("No se pudo cargar la librería del PDF. Revisá la conexión.");
  });

  it("with no flyer loaded it says why, and nothing is drawn over another (invariant 23)", async () => {
    device({ canShare: () => true, share: () => Promise.resolve() });
    const { screen } = await open();
    await screen.getByRole("button", { name: "Compartir" }).click();
    await expect.element(screen.getByRole("status")).toMatchTextContent(/Todavía no se cargó/);
  });

  it("if the browser stopped being able to, it says so", async () => {
    device({ canShare: () => true, share: () => Promise.resolve() });
    const { screen } = await open();
    await withFlyer(screen);
    device({ canShare: () => false, share: () => Promise.resolve() });
    await screen.getByRole("button", { name: "Compartir" }).click();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Este navegador no permite compartir archivos. Usá Descargar PDF.");
  });

  it("a warning stops it until it is answered", async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
    device({ canShare: () => true, share });
    const stopped: (() => void)[] = [];
    const { screen } = await open({
      checkBefore: (goOn) => {
        stopped.push(goOn);
        return true;
      },
    });
    await withFlyer(screen);
    await screen.getByRole("button", { name: "Compartir" }).click();
    expect(share).not.toHaveBeenCalled();
    stopped[0]?.();
    await vi.waitFor(() => {
      expect(share).toHaveBeenCalledOnce();
    });
  });

  it("from the window, what is seen there goes", async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
    device({ canShare: () => true, share });
    const { screen } = await open();
    await withFlyer(screen);
    await screen.getByRole("button", { name: "Lo que se ve" }).click();
    await vi.waitFor(() => {
      expect(share).toHaveBeenCalledOnce();
    });
  });
});
