// What comes out of the editor, whole: the window of Vista previa, the history and the flyer half made.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import {
  LOGO_A,
  paintedFlyer,
  workspaceOnScreen,
} from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import type { AppAnswers } from "@/shared/lib/testing/app-harness.tsx";
import { INVENTED_USER } from "@/shared/supabase/testing/recording-fetch.ts";
import { artFileName, type FlyerValues } from "@/shared/flyer-engine/index.ts";
import type { HistoryItem } from "../model/stored-flyer.ts";
import { ALLOWED, flyerFiles, flyerShown, open } from "../testing/editor-on-screen.tsx";

const HISTORY_KEY = `fg_hist_${INVENTED_USER.id}`;
const DRAFT_KEY = `fg_draft_${INVENTED_USER.id}`;
const SECOND_CAP = { benef: { lineas: [{ t: "Tope {importe2}" }] } };

const previewButton = () => page.getByRole("button", { name: "Vista previa", exact: true });
const previewWindow = () => page.getByRole("dialog", { name: "Vista previa" });
const shownPicture = () => page.getByTestId("preview-window-picture");
const status = () => page.getByRole("status");
const historyTab = () => page.getByRole("tab", { name: "Historial" });
const rows = () => page.getByTestId("history-row");
const companyField = () => page.getByLabelText("Nombre de la empresa", { exact: true });

function downloadsSeen() {
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function record(
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return names;
}

function withFaculties(faculties: Record<string, boolean>, others: AppAnswers = {}): AppAnswers {
  return {
    ...others,
    files: {
      ...flyerFiles(),
      ...others.files,
      "_facultades.json": { roles: { asesor: { ...ALLOWED, ...faculties } } },
    },
  };
}

function oldFlyer(company: string, others: Partial<HistoryItem> = {}): HistoryItem {
  return {
    v: { empresa: company, has1: true, nombre: "Vieja Oficial", legal: "Legal viejo" },
    fn: `Flyer ${company}`,
    thumb: "",
    hora: "1:00",
    ts: 1000,
    ac: 0,
    opt: 9,
    ...others,
  };
}

function inHistory(...items: readonly HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  return withFaculties({ guardar_trabajo: true });
}

const press = () => rows().getByRole("button", { name: /PDF/ }).click();
const edit = () =>
  rows()
    .getByRole("button", { name: /Editar/ })
    .click();
const offer = () => page.getByTestId("draft-offer");
const fillOfficerField = (name: string, value: string) =>
  page
    .elementLocator(document.querySelector(`[data-officer-field="${name}"]`) ?? document.body)
    .fill(value);

function withDraft(values: Partial<FlyerValues> = {}, others: Record<string, unknown> = {}) {
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      v: { empresa: "A MEDIO SA", ...values },
      ac: 0,
      opt: 9,
      filename: "Mi nombre",
      filenameManual: true,
      ts: Date.now(),
      ...others,
    }),
  );
  return withFaculties({ guardar_trabajo: true });
}

function logsOf({ network }: Awaited<ReturnType<typeof open>>["harness"]) {
  return network.to("/rest/v1/flyer_logs", "POST");
}

beforeEach(async () => {
  localStorage.clear();
  await page.viewport(1366, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the window of Vista previa", () => {
  it("shows exactly what is downloaded, not the preview at its scale (invariant 16)", async () => {
    await open();
    await flyerShown();
    await companyField().fill("ACME SA");
    await previewButton().click();
    await expect.element(previewWindow()).toBeVisible();
    const download = workspaceOnScreen().renderDownload();
    const address = download?.toDataURL("image/jpeg", 0.85);
    expect(shownPicture().element().getAttribute("src")).toBe(address);
    const picture = shownPicture().element();
    if (!(picture instanceof HTMLImageElement)) throw new Error("It is no picture");
    await picture.decode();
    expect(picture.naturalWidth).toBe(download?.width);
    expect(picture.naturalHeight).toBe(download?.height);
  });

  it("a flyer that did not load has nothing to show, and it says why (invariant 23)", async () => {
    await open({ droppedFiles: ["_active9.json"] });
    await expect.element(page.getByTestId("flyer-load-problem")).toBeVisible();
    await previewButton().click();
    await expect.element(status()).toMatchTextContent(/No se pudo cargar el flyer/);
    expect(previewWindow().query()).toBeNull();
  });

  it("PDF takes what is shown, closes the window and leaves its record; it says nothing more", async () => {
    const { harness } = await open();
    await flyerShown();
    await companyField().fill("ACME SA");
    await previewButton().click();
    await previewWindow().getByRole("button", { name: "PDF", exact: true }).click();
    await expect.element(previewWindow()).not.toBeInTheDocument();
    await vi.waitFor(
      () => {
        expect(logsOf(harness)).toHaveLength(1);
      },
      { timeout: 10_000 },
    );
    expect(logsOf(harness)[0]?.body).toMatchObject({
      format: "pdf",
      empresa: "ACME SA",
      config_name: "Flyer_ACME SA",
    });
    expect(status().element().textContent).not.toMatch(/descargado/);
  });

  it("PNG too", async () => {
    const names = downloadsSeen();
    const { harness } = await open();
    await flyerShown();
    await previewButton().click();
    await previewWindow().getByRole("button", { name: "PNG", exact: true }).click();
    await vi.waitFor(() => {
      expect(names).toEqual(["Flyer.png"]);
    });
    await vi.waitFor(() => {
      expect(logsOf(harness)[0]?.body).toMatchObject({ format: "png" });
    });
  });

  it("a flyer that went out of reach while the window was open is not saved", async () => {
    const names = downloadsSeen();
    await open();
    await flyerShown();
    await previewButton().click();
    const { selectOption } = workspaceOnScreen();
    void selectOption(6, false);
    await page.getByRole("dialog").getByRole("button", { name: "PNG", exact: true }).click();
    await expect.element(status()).toMatchTextContent(/todavía|no tiene flyer/);
    expect(names).toEqual([]);
  });

  it("Compartir goes with what is shown", async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    try {
      await open();
      await flyerShown();
      await previewButton().click();
      await previewWindow().getByRole("button", { name: "Compartir" }).click();
      await expect.element(previewWindow()).not.toBeInTheDocument();
      await vi.waitFor(() => {
        expect(share).toHaveBeenCalledOnce();
      });
    } finally {
      Reflect.deleteProperty(navigator, "canShare");
      Reflect.deleteProperty(navigator, "share");
    }
  });
});

describe("what a download leaves behind", () => {
  it("in the history and in the log, and nothing when it fails", async () => {
    const names = downloadsSeen();
    const { harness } = await open();
    await flyerShown();
    await companyField().fill("ACME SA");
    await page.getByRole("button", { name: "Otros" }).click();
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementationOnce(() => {
      throw new Error("Too big");
    });
    await page.getByRole("button", { name: "Descargar como imagen (PNG)" }).click();
    await expect.element(status()).toMatchTextContent(/No se pudo generar la imagen/);
    expect(names).toEqual([]);
    expect(logsOf(harness)).toEqual([]);
    await historyTab().click();
    expect(rows().query()).toBeNull();

    await page.getByRole("tab", { name: "Individual" }).click();
    await page.getByRole("button", { name: "Otros" }).click();
    await page.getByRole("button", { name: "Descargar como imagen (PNG)" }).click();
    await expect.element(status()).toHaveTextContent("PNG descargado!");
    await vi.waitFor(() => {
      expect(logsOf(harness)).toHaveLength(1);
    });
    expect(logsOf(harness)[0]?.body).toMatchObject({
      format: "png",
      empresa: "ACME SA",
      config_name: "Flyer_ACME SA",
      is_bulk: false,
      user_id: INVENTED_USER.id,
    });
    await historyTab().click();
    await expect.element(rows()).toMatchTextContent(/ACME SA/);
  });

  it("the log says if the sign prints a second cap", async () => {
    downloadsSeen();
    const { harness } = await open(
      {
        files: {
          ...flyerFiles(),
          "_active8.json": { imageUrl: paintedFlyer([LOGO_A]), cfg: SECOND_CAP },
        },
      },
      "rubros",
    );
    await flyerShown();
    await page.getByRole("button", { name: "Otros" }).click();
    await page.getByRole("button", { name: "Descargar como imagen (PNG)" }).click();
    await vi.waitFor(() => {
      expect(logsOf(harness)).toHaveLength(1);
    });
    expect(String(Reflect.get(Object(logsOf(harness)[0]?.body), "flyer_type"))).toContain(
      "importe2",
    );
  });

  it("a test can read what stays in the history, that the screen does not show", async () => {
    await open(inHistory(oldFlyer("VIEJA SA")));
    await flyerShown();
    const read: unknown = window["__flyerProbe"]?.["flyerHistory"]?.();
    expect(read).toHaveLength(1);
  });

  it("what is wrong is said a moment after, the fields are marked and it came out anyway", async () => {
    const names = downloadsSeen();
    await open();
    await flyerShown();
    await fillOfficerField("nombre1", "Ana");
    await fillOfficerField("celular1", "123");
    await page.getByRole("button", { name: "Otros" }).click();
    await page.getByRole("button", { name: "Descargar como imagen (PNG)" }).click();
    await expect.element(status()).toHaveTextContent("PNG descargado!");
    expect(names).toEqual(["Flyer.png"]);
    await expect
      .element(status(), { timeout: 4000 })
      .toMatchTextContent(/Ojo: revisá el celular de Ana \(se generó igual\)\./);
  });

  it("with nothing wrong nothing more is said", async () => {
    downloadsSeen();
    await open();
    await flyerShown();
    await page.getByRole("button", { name: "Otros" }).click();
    await page.getByRole("button", { name: "Descargar como imagen (PNG)" }).click();
    await expect.element(status()).toHaveTextContent("PNG descargado!");
    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
    expect(status().element().textContent).toBe("PNG descargado!");
  });
});

describe("downloading a flyer of the history again", () => {
  it("with what it had, without touching what is on screen", async () => {
    const { harness } = await open(inHistory(oldFlyer("VIEJA SA")));
    await flyerShown();
    await companyField().fill("OTRA SA");
    await historyTab().click();
    await press();
    await vi.waitFor(
      () => {
        expect(logsOf(harness)).toHaveLength(1);
      },
      { timeout: 10_000 },
    );
    expect(logsOf(harness)[0]?.body).toMatchObject({
      empresa: "VIEJA SA",
      // The name of the file comes from what the field says now.
      config_name: "Flyer_OTRA SA",
    });
    expect(workspaceOnScreen().getState().form.empresa).toBe("OTRA SA");
  });

  it("if the file does not come out it says so, and leaves no record", async () => {
    const { harness } = await open(inHistory(oldFlyer("VIEJA SA")));
    await flyerShown();
    await historyTab().click();
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementationOnce(() => {
      throw new Error("Too big");
    });
    await press();
    await expect
      .element(status(), { timeout: 15_000 })
      .toMatchTextContent(/No se pudo generar el PDF/);
    expect(logsOf(harness)).toEqual([]);
    await expect.element(rows()).toBeVisible();
  });

  it("a format that is gone, or not enabled, says so and nothing comes out", async () => {
    const names = downloadsSeen();
    await open(
      inHistory(oldFlyer("IDA", { opt: 77, ts: 2 }), oldFlyer("AJENA", { opt: 1, ts: 1 })),
    );
    await flyerShown();
    await historyTab().click();
    await rows().first().getByRole("button", { name: /PDF/ }).click();
    await expect.element(status()).toMatchTextContent(/ya no existe\. No se puede volver/);
    await rows().nth(1).getByRole("button", { name: /PDF/ }).click();
    await expect.element(status()).toMatchTextContent(/que hoy no está habilitado/);
    expect(names).toEqual([]);
    expect(workspaceOnScreen().getState().slot.option).toBe(9);
  });

  it("on another flyer it goes there first and says so; if that one has no picture, nothing comes out", async () => {
    const names = downloadsSeen();
    await open(inHistory(oldFlyer("SIN FLYER", { opt: 6 })));
    await flyerShown();
    await historyTab().click();
    await press();
    await vi.waitFor(() => {
      expect(workspaceOnScreen().getState().slot.option).toBe(6);
    });
    await expect.element(status()).toMatchTextContent(/no tiene flyer/);
    expect(names).toEqual([]);
  });

  it("with its cut, and if the flyer changed since then it comes out whole and says so", async () => {
    const values: FlyerValues = {
      empresa: "CORTADA",
      recortes: [{ y: 10, h: 20 }],
      recBase: "otra-imagen.jpg",
    };
    const { harness } = await open(inHistory(oldFlyer("CORTADA", { v: values })));
    await flyerShown();
    await historyTab().click();
    await press();
    await expect
      .element(status(), { timeout: 10_000 })
      .toHaveTextContent("El flyer cambió desde que se descargó ese: sale sin el recorte.");
    await vi.waitFor(
      () => {
        expect(logsOf(harness)).toHaveLength(1);
      },
      { timeout: 10_000 },
    );
  });

  it("a section that does not arrive leaves a gap, and says so", async () => {
    const files = flyerFiles();
    const values: FlyerValues = {
      empresa: "CON SECCION",
      recortes: [{ y: 10, h: 20, ins: { u: "https://afuera.test/s.jpg", sy: 0, sh: 20 } }],
      recBase: artFileName(files["_active9.json"].imageUrl),
    };
    localStorage.setItem(HISTORY_KEY, JSON.stringify([oldFlyer("CON SECCION", { v: values })]));
    const { harness } = await open(withFaculties({ guardar_trabajo: true }, { files }));
    await flyerShown();
    await historyTab().click();
    await press();
    await expect
      .element(status())
      .toMatchTextContent(
        /No se pudo bajar la sección insertada: en su lugar queda un espacio vacío/,
      );
    await vi.waitFor(
      () => {
        expect(logsOf(harness)).toHaveLength(1);
      },
      { timeout: 10_000 },
    );
  });
});

describe("bringing a flyer of the history back", () => {
  it("fills the form, goes back to Individual and brings its legal text", async () => {
    await open(inHistory(oldFlyer("VIEJA SA")));
    await flyerShown();
    await historyTab().click();
    await edit();
    await expect.element(companyField()).toBeVisible();
    await expect.element(companyField()).toHaveValue("VIEJA SA");
    await expect.element(status()).toHaveTextContent("Datos cargados");
    expect(workspaceOnScreen().getState().legal).toBe("Legal viejo");
    expect(document.querySelector('[data-testid="open-work"]'), "nothing to open").toBeNull();
  });

  it("a press on the row does the same", async () => {
    await open(inHistory(oldFlyer("VIEJA SA")));
    await flyerShown();
    await historyTab().click();
    await rows().getByRole("button", { name: "Cargar VIEJA SA" }).click();
    await expect.element(companyField()).toHaveValue("VIEJA SA");
  });

  it("on another flyer it goes there first", async () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([oldFlyer("VIEJA SA", { opt: 6 })]));
    await open(
      withFaculties(
        { guardar_trabajo: true },
        { files: { "_active6.json": { imageUrl: paintedFlyer([LOGO_A]), cfg: {} } } },
      ),
    );
    await flyerShown();
    await historyTab().click();
    await edit();
    await vi.waitFor(() => {
      expect(workspaceOnScreen().getState().slot.option).toBe(6);
    });
    await expect.element(companyField()).toHaveValue("VIEJA SA");
  });

  it("while its own flyer is still loading, it waits for it", async () => {
    await open(inHistory(oldFlyer("VIEJA SA")));
    await historyTab().click();
    await edit();
    await expect.element(companyField()).toHaveValue("VIEJA SA");
    expect(workspaceOnScreen().getState().slot.loading).toBe(false);
  });

  it("with a format that is gone the data comes to the flyer on screen, and it says so", async () => {
    await open(inHistory(oldFlyer("AJENA SA", { opt: 77 })));
    await flyerShown();
    await historyTab().click();
    await edit();
    await expect
      .element(status())
      .toMatchTextContent(/ya no existe\. Se cargaron los datos en «Combustible»/);
    await expect.element(companyField()).toHaveValue("AJENA SA");
    expect(document.querySelector('[data-testid="open-work"]')).toBeNull();
  });

  it("with its logos it opens in a draft, and the original stays clean", async () => {
    const files = flyerFiles();
    const logo = { x: 10, y: 10, w: 20, h: 20, bg: "#fff", tipo: "txt", texto: "Hola" };
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        oldFlyer("CON LOGOS", {
          v: {
            empresa: "CON LOGOS",
            logos: [logo],
            logosSrc: files["_active9.json"].imageUrl,
            legal: "Suyo",
          },
        }),
      ]),
    );
    await open(withFaculties({ guardar_trabajo: true }, { files }));
    await flyerShown();
    await historyTab().click();
    await edit();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="open-work"]')).not.toBeNull();
    });
    await expect.element(status()).toMatchTextContent(/quedaron en «Borrador 1»/);
    await vi.waitFor(() => {
      expect(workspaceOnScreen().currentValues().logos).toHaveLength(1);
    });
    expect(workspaceOnScreen().getState().legal).toBe("Suyo");
  });

  it("on a flyer of another tab it goes to that tab too", async () => {
    const tabs: string[] = [];
    const opened = await open(inHistory(oldFlyer("RUBRO SA", { opt: 8 })), "flyer", true, {
      goToTab: (id) => {
        tabs.push(id);
        void opened.show(id);
      },
    });
    await flyerShown();
    await historyTab().click();
    await edit();
    await vi.waitFor(() => {
      expect(workspaceOnScreen().getState().slot.option).toBe(8);
    });
    expect(tabs).toContain("rubros");
    await expect.element(companyField()).toHaveValue("RUBRO SA");
  });

  it("logos of another version of the flyer are not brought, and it says so", async () => {
    const logo = { x: 10, y: 10, w: 20, h: 20, bg: "#fff", tipo: "txt", texto: "Hola" };
    await open(
      inHistory(
        oldFlyer("OTRA VERSION", {
          v: { empresa: "OTRA VERSION", logos: [logo], logosSrc: "otra.jpg" },
        }),
      ),
    );
    await flyerShown();
    await historyTab().click();
    await edit();
    await expect
      .element(status())
      .toHaveTextContent("Los logos de ese flyer eran de otra versión del flyer y no se cargaron.");
    expect(document.querySelector('[data-testid="open-work"]')).toBeNull();
  });

  it("a cut of a flyer that changed is not brought, and it says so", async () => {
    await open(
      inHistory(
        oldFlyer("CORTADA", {
          v: { empresa: "CORTADA", recortes: [{ y: 10, h: 20 }], recBase: "otra.jpg" },
        }),
      ),
    );
    await flyerShown();
    await historyTab().click();
    await edit();
    await expect
      .element(status())
      .toHaveTextContent(
        "El flyer cambió desde entonces: se cargaron los datos, sin el recorte ni los logos.",
      );
    expect(document.querySelector('[data-testid="open-work"]')).toBeNull();
  });

  it("if its flyer did not load, its changes do not go on another picture", async () => {
    const logo = { x: 10, y: 10, w: 20, h: 20, bg: "#fff", tipo: "txt", texto: "Hola" };
    await open(
      inHistory(
        oldFlyer("SIN FLYER", {
          opt: 6,
          v: { empresa: "SIN FLYER", logos: [logo], logosSrc: "x" },
        }),
      ),
    );
    await flyerShown();
    await historyTab().click();
    await edit();
    await vi.waitFor(() => {
      expect(workspaceOnScreen().getState().slot.option).toBe(6);
    });
    await expect.element(companyField()).toHaveValue("SIN FLYER");
    expect(document.querySelector('[data-testid="open-work"]')).toBeNull();
  });
});

describe("the flyer half made", () => {
  it("is offered once, and the empty form does not step on it", async () => {
    await open(withDraft());
    await flyerShown();
    await expect.element(offer()).toMatchTextContent(/Tenés un flyer a medio armar: A MEDIO SA/);
    window.dispatchEvent(new Event("pagehide"));
    expect(localStorage.getItem(DRAFT_KEY)).toContain("A MEDIO SA");
    page.getByRole("button", { name: "Restaurar" }).element().parentElement?.click();
    await new Promise((resolve) => {
      setTimeout(resolve, 900);
    });
    expect(localStorage.getItem(DRAFT_KEY)).toContain("A MEDIO SA");
  });

  it("without its moment it says the one of now", async () => {
    await open(withDraft({}, { ts: 0 }));
    await flyerShown();
    await expect.element(offer()).toMatchTextContent(/· \d{1,2}:\d{2}/);
  });

  it("one with no company at all can still be offered", async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: { legal: "Mio" }, opt: 9, ts: 1 }));
    await open(withFaculties({ guardar_trabajo: true }));
    await flyerShown();
    await expect.element(offer()).toMatchTextContent(/un flyer sin empresa/);
  });

  it("with no company it says so", async () => {
    await open(withDraft({ empresa: "", nombre2: "Luis" }));
    await flyerShown();
    await expect.element(offer()).toMatchTextContent(/un flyer sin empresa/);
  });

  it("Seguir con ese brings it all, with the name of the file and what is wrong marked", async () => {
    await open(withDraft({ has1: true, nombre: "Ana", celular: "Cel: 123", legal: "Editado" }));
    await flyerShown();
    await offer().getByRole("button", { name: "Seguir con ese" }).click();
    await expect.element(offer()).not.toBeInTheDocument();
    await expect.element(companyField()).toHaveValue("A MEDIO SA");
    await expect.element(page.getByTestId("file-name")).toHaveValue("Mi nombre");
    expect(workspaceOnScreen().getState().legal).toBe("Editado");
    await expect.element(page.getByText(/Faltan números/)).toBeVisible();
  });

  it("without a name of its own the file keeps the one it has", async () => {
    await open(withDraft({}, { filename: "" }));
    await flyerShown();
    await offer().getByRole("button", { name: "Seguir con ese" }).click();
    await expect.element(companyField()).toHaveValue("A MEDIO SA");
    await expect.element(page.getByTestId("file-name")).toHaveValue("Flyer {empresa}");
  });

  it("Descartar forgets it", async () => {
    await open(withDraft());
    await flyerShown();
    await offer().getByRole("button", { name: "Descartar" }).click();
    await expect.element(status()).toHaveTextContent("Borrador descartado");
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    await expect.element(offer()).not.toBeInTheDocument();
  });

  it("writing elsewhere means another flyer: the offer goes, and it is saved over a moment later", async () => {
    await open(withDraft());
    await flyerShown();
    await companyField().fill("NUEVA SA");
    await expect.element(offer()).not.toBeInTheDocument();
    await vi.waitFor(
      () => {
        expect(localStorage.getItem(DRAFT_KEY)).toContain("NUEVA SA");
      },
      { timeout: 3000 },
    );
  });

  it("the legal text travels only if it was edited", async () => {
    await open(withFaculties({ guardar_trabajo: true }));
    await flyerShown();
    await companyField().fill("UNA SA");
    await vi.waitFor(
      () => {
        expect(localStorage.getItem(DRAFT_KEY)).toContain("UNA SA");
      },
      { timeout: 3000 },
    );
    expect(localStorage.getItem(DRAFT_KEY)).not.toContain("Legal de la nueve");
    await page.getByTestId("legal-text").fill("Editado por mí");
    await vi.waitFor(
      () => {
        expect(localStorage.getItem(DRAFT_KEY)).toContain("Editado por mí");
      },
      { timeout: 3000 },
    );
  });

  it("on leaving the page it is saved at once, and only if something changed", async () => {
    await open(withFaculties({ guardar_trabajo: true }));
    await flyerShown();
    await companyField().fill("SE VA SA");
    window.dispatchEvent(new Event("pagehide"));
    expect(localStorage.getItem(DRAFT_KEY)).toContain("SE VA SA");
    localStorage.removeItem(DRAFT_KEY);
    window.dispatchEvent(new Event("pagehide"));
    expect(localStorage.getItem(DRAFT_KEY), "the same thing again").toBeNull();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await companyField().fill("OTRA VEZ SA");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(localStorage.getItem(DRAFT_KEY)).toContain("OTRA VEZ SA");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await companyField().fill("TODAVIA SA");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(localStorage.getItem(DRAFT_KEY)).not.toContain("TODAVIA SA");
  });

  it("Restaurar forgets it", async () => {
    await open(withFaculties({ guardar_trabajo: true }));
    await flyerShown();
    await companyField().fill("BORRAME SA");
    window.dispatchEvent(new Event("pagehide"));
    await page.getByRole("button", { name: "Restaurar" }).click();
    expect(localStorage.getItem(DRAFT_KEY) ?? "").not.toContain("BORRAME SA");
  });

  it("without the faculty nothing is offered or kept", async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: { empresa: "VIEJA" }, ts: 1 }));
    await open();
    await flyerShown();
    expect(offer().query()).toBeNull();
    await companyField().fill("OTRA SA");
    window.dispatchEvent(new Event("pagehide"));
    expect(localStorage.getItem(DRAFT_KEY)).not.toContain("OTRA SA");
  });
});
