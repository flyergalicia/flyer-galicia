// The screen of the Hunter over a simulated cloud: what is not a detail of the drawing.
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { saveFlyerPdf } from "@/shared/flyer-engine/index.ts";
import {
  createCommercialDesk,
  type RegisterableCompany,
} from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { failure, success } from "@/shared/supabase/index.ts";
import {
  deferred,
  jsonResponse,
  type RecordedRequest,
} from "@/shared/supabase/testing/recording-fetch.ts";
import { company, openHunter, OWNER } from "../testing/hunter-on-screen.tsx";

const saving = vi.hoisted((): { result: () => ReturnType<typeof saveFlyerPdf> } => ({
  result: () => Promise.resolve({ ok: true, value: true }),
}));

vi.mock("@/shared/flyer-engine/index.ts", async (original) => ({
  ...(await original<typeof import("@/shared/flyer-engine/index.ts")>()),
  saveFlyerPdf: () => saving.result(),
}));

const CUT = () => {
  throw new TypeError("Failed to fetch");
};
const NOTHING = () => undefined;
const ALL_FLYERS = { opcion_9: true, opcion_8: true, opcion_11: true, opcion_12: true };
const WITH_PROPOSALS = { opcion_9: true, proponer_oficiales: true };

const list = () => page.getByTestId("hunter-list");
const status = () => page.getByTestId("hunter-status");
const rows = () => page.getByTestId("hunter-row");
const row = (name: string) => rows().filter({ hasText: name });
const search = () => page.getByRole("textbox", { name: "Empresa", exact: true });
const message = () => page.getByTestId("hunter-preview-message");
const picture = () => page.getByRole("img", { name: "Flyer de la empresa elegida" });
const downloadButton = () => page.getByTestId("hunter-download");
const notice = () => page.getByRole("status");
const percent = () => page.getByTestId("zoom-percent");
const retry = () => page.getByRole("button", { name: /Reintentar/ });
const choose = (name: string) => row(name).getByText(name, { exact: true }).click();
const names = () =>
  Array.from(
    document.querySelectorAll('[data-testid="hunter-row"] [data-part="company"]'),
    (part) => part.textContent,
  );

function textsDrawn(): string[] {
  const texts: string[] = [];
  const context = CanvasRenderingContext2D.prototype;
  const real: CanvasRenderingContext2D["fillText"] = Reflect.get(context, "fillText");
  vi.spyOn(context, "fillText").mockImplementation(function spy(
    this: CanvasRenderingContext2D,
    text,
    x,
    y,
    maxWidth,
  ) {
    texts.push(text);
    real.call(this, text, x, y, maxWidth);
  });
  return texts;
}

const valuesOnPreview = (): unknown =>
  Reflect.get(Object(window["__flyerProbe"]?.["hunterPreview"]?.()), "values");

function focusOn(element: Element): void {
  if (element instanceof HTMLElement) element.focus();
}

function zipsDownloaded(): Blob[] {
  const zips: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (blob instanceof Blob) zips.push(blob);
    return "blob:zip";
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(NOTHING);
  return zips;
}

beforeEach(() => {
  saving.result = () => Promise.resolve(success(true));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the list", () => {
  it("comes ordered by name, whatever the order of the database", async () => {
    await openHunter({ companies: [company("BETA"), company("ALFA"), company("Ñandú")] });
    await expect.element(status()).toHaveTextContent("3 empresas cargadas");
    expect(names()).toEqual(["ALFA", "BETA", "Ñandú"]);
  });

  it("says who is who: tax id, cashback, officers, flyer and what is missing", async () => {
    await openHunter({
      companies: [company("ACME SA", { config: "SIN", asesores: [] })],
    });
    await expect.element(row("ACME SA")).toMatchTextContent(/30-71111111-1/);
    await expect.element(row("ACME SA")).toMatchTextContent(/SIN CASHBACK/);
    await expect.element(row("ACME SA")).toMatchTextContent(/Flyer Galicia · Combustible/);
    await expect
      .element(row("ACME SA"))
      .toMatchTextContent(
        /el flyer sale sin datos de contacto\s+·\s+sin cashback: sale sin importes/,
      );
  });

  it("a row with no name says so", async () => {
    await openHunter({ companies: [company("", { cuits: ["30711111111"] })] });
    await expect.element(rows()).toMatchTextContent(/\(sin nombre\)/);
  });

  it("reads every page: it is not cut at 1000", async () => {
    const all = Array.from({ length: 1500 }, (_, at) => company(`EMPRESA ${String(at)}`));
    const answer = ({ query }: RecordedRequest) => {
      const from = Number(query.get("offset") ?? 0);
      const limit = Number(query.get("limit") ?? 1000);
      return jsonResponse(all.slice(from, from + limit));
    };
    const { harness } = await openHunter({ companies: answer });
    await expect.element(status()).toMatchTextContent(/^1500 empresas cargadas/);
    expect(harness.network.to("/rest/v1/padron_empresas").length).toBeGreaterThanOrEqual(2);
    await search().fill("EMPRESA 1499");
    await expect.element(rows()).toMatchTextContent(/EMPRESA 1499/);
  });

  it("is not filtered by owner: who sees what is decided by the database", async () => {
    const { harness } = await openHunter({ companies: [company("ACME SA")] });
    await expect.element(rows()).toBeVisible();
    const [read] = harness.network.to("/rest/v1/padron_empresas");
    expect(read?.query.has("user_id")).toBe(false);
    expect(read?.query.get("select")).toContain("user_id");
  });

  it("the search ignores the dots and says how many it found", async () => {
    await openHunter({ companies: [company("BETA S.A."), company("GAMA SRL")] });
    await expect.element(status()).toHaveTextContent("2 empresas cargadas");
    await search().fill("beta sa");
    await expect.element(status()).toHaveTextContent("1 de 2");
    expect(names()).toEqual(["BETA S.A."]);
  });

  it("what is not there says so, with what was written as text", async () => {
    await openHunter({ companies: [company("ACME SA")] });
    await expect.element(rows()).toBeVisible();
    await search().fill("<b>nada</b>");
    await expect
      .element(page.getByTestId("hunter-notice"))
      .toMatchTextContent(
        /No figura\..*Ninguna de las 1 empresas cargadas coincide con «<b>nada<\/b>»/,
      );
    await expect.element(status()).toHaveTextContent("");
  });

  it("Escape clears the search", async () => {
    await openHunter({ companies: [company("ACME SA"), company("BETA SA")] });
    await expect.element(status()).toHaveTextContent("2 empresas cargadas");
    await search().fill("beta");
    await userEvent.keyboard("{Escape}");
    await expect.element(search()).toHaveValue("");
    await expect.element(status()).toHaveTextContent("2 empresas cargadas");
  });

  it("with no companies at all, it says it", async () => {
    await openHunter({ companies: [] });
    await expect.element(list()).toHaveTextContent("Todavía no hay ninguna empresa cargada.");
    await expect.element(status()).toHaveTextContent("");
  });

  it("the cursor goes to the search on arriving, and on coming back", async () => {
    const { show } = await openHunter({ companies: [company("ACME SA")] }, false);
    await expect.element(rows()).toBeInTheDocument();
    expect(document.activeElement).not.toBe(search().element());
    await show(true);
    await expect.element(search()).toHaveFocus();

    search().element().dispatchEvent(new FocusEvent("blur"));
    focusOn(page.getByRole("button", { name: "Acercar" }).element());
    await show(false);
    await show(true);
    await expect.element(search()).toHaveFocus();
  });
});

describe("a cut in the network", () => {
  it("is not an empty list: it says so, and Reintentar brings the companies", async () => {
    let up = false;
    await openHunter({
      companies: () => (up ? jsonResponse([company("ACME SA")]) : CUT()),
    });
    await expect.element(list()).toMatchTextContent(/No se pudo conectar para traer las empresas/);
    await expect.element(list()).not.toHaveTextContent("Todavía no hay");
    await expect.element(status()).toHaveTextContent("");

    up = true;
    await retry().click();
    await expect.element(row("ACME SA")).toBeVisible();
    await expect.element(status()).toHaveTextContent("1 empresa cargada");
  });

  it("while it tries again it says it is looking", async () => {
    let up = false;
    const answer = deferred<Response>();
    await openHunter({
      companies: () => (up ? answer.promise : CUT()),
    });
    await expect.element(retry()).toBeVisible();
    up = true;
    await retry().click();
    await expect.element(status()).toHaveTextContent("Buscando las empresas cargadas…");
    await expect.element(retry()).not.toBeInTheDocument();
    answer.resolve(jsonResponse([company("ACME SA")]));
    await expect.element(row("ACME SA")).toBeVisible();
  });

  it("on the flyers it says that, and asks again only what it could not", async () => {
    const dropped = ["_active9.json"];
    const { harness } = await openHunter({
      companies: [company("ACME SA")],
      permissions: ALL_FLYERS,
      droppedFiles: dropped,
    });
    await expect.element(list()).toMatchTextContent(/No se pudo conectar para traer los flyers/);
    await expect.element(rows()).not.toBeInTheDocument();

    dropped.length = 0;
    await retry().click();
    await expect.element(row("ACME SA")).toHaveAttribute("data-can-draw", "true");
    const asked = (file: string) =>
      harness.network.to(`/storage/v1/object/public/flyers/${file}`).length;
    expect(asked("_active9.json")).toBe(2);
    expect(asked("_active8.json")).toBe(1);
  });

  it("coming back to the screen asks for the flyers it could not", async () => {
    const dropped = ["_active9.json"];
    const { show } = await openHunter({
      companies: [company("ACME SA")],
      droppedFiles: dropped,
    });
    await expect.element(list()).toMatchTextContent(/traer los flyers/);
    await show(false);
    dropped.length = 0;
    await show(true);
    await expect.element(row("ACME SA")).toHaveAttribute("data-can-draw", "true");
  });

  it("what failed is not kept as a list, nor an option written down as having none", async () => {
    await openHunter({ companies: CUT, droppedFiles: ["_active9.json"] });
    await expect.element(retry()).toBeVisible();
    const read: unknown = window["__flyerProbe"]?.["hunterScreen"]?.();
    expect(read).toEqual({
      loadedCompanies: null,
      companiesFailed: true,
      flyersFailed: true,
      flyersSettled: true,
      hasFlyer: {},
    });
  });

  it("coming back to the screen tries again by itself", async () => {
    let up = false;
    const { show } = await openHunter({
      companies: () => (up ? jsonResponse([company("ACME SA")]) : CUT()),
    });
    await expect.element(retry()).toBeVisible();
    await show(false);
    up = true;
    await show(true);
    await expect.element(row("ACME SA")).toBeVisible();
  });
});

describe("the flyer of a company", () => {
  it("before choosing, it asks for one and there is nothing to download", async () => {
    await openHunter({ companies: [company("ACME SA")] });
    await expect
      .element(message())
      .toHaveTextContent("Elegí una empresa de la lista para ver su flyer.");
    await expect.element(downloadButton()).toBeDisabled();
    await expect.element(picture()).not.toBeInTheDocument();
  });

  it("choosing makes it, with its officer and the legal of that flyer", async () => {
    const texts = textsDrawn();
    await openHunter({ companies: [company("ACME SA")] });
    await choose("ACME SA");
    await expect.element(picture()).toBeVisible();
    await expect.element(downloadButton()).toBeEnabled();
    await expect.element(message()).not.toBeInTheDocument();
    await expect.element(row("ACME SA")).toHaveAttribute("data-selected", "true");
    expect(texts.join(" ")).toMatch(/Ana Perez/);
    expect(texts.join(" ")).toMatch(/Legal\s+de\s+la\s+nueve/);
  });

  it("Enter chooses the first one, with Ctrl it does not", async () => {
    await openHunter({ companies: [company("ACME SA"), company("BETA SA")] });
    await expect.element(status()).toHaveTextContent("2 empresas cargadas");
    await search().click();
    await userEvent.keyboard("{Enter}");
    await expect.element(picture()).toBeVisible();
    await expect.element(row("ACME SA")).toHaveAttribute("data-selected", "true");
  });

  it("the keyboard chooses a row too, and its button does not choose it", async () => {
    await openHunter({
      companies: [company("ACME SA")],
      permissions: WITH_PROPOSALS,
    });
    await expect.element(row("ACME SA")).toBeVisible();
    const button = row("ACME SA").getByRole("button", { name: "✎ Oficiales" });
    focusOn(button.element());
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByTestId("decision-dialog")).toBeVisible();
    await expect.element(picture()).not.toBeInTheDocument();
    await page.getByRole("button", { name: "Cancelar" }).click();
    focusOn(rows().element());
    await userEvent.keyboard("{Enter}");
    await expect.element(picture()).toBeVisible();
  });

  it("a key that is not for choosing does nothing on a row", async () => {
    await openHunter({ companies: [company("ACME SA")] });
    await expect.element(rows()).toBeVisible();
    focusOn(rows().element());
    await userEvent.keyboard("a");
    await expect.element(picture()).not.toBeInTheDocument();
  });

  it("a company it cannot draw says why, and never uses another flyer", async () => {
    await openHunter({
      companies: [company("ACME SA", { rubro: { opcion: 8 } })],
      permissions: { opcion_9: true },
    });
    await expect.element(row("ACME SA")).toHaveAttribute("data-can-draw", "false");
    await expect.element(row("ACME SA")).toMatchTextContent(/sin flyer para su rubro/);
    await choose("ACME SA");
    await expect.element(message()).toMatchTextContent(/No hay flyer para esta empresa\./);
    await expect.element(message()).toMatchTextContent(/no está habilitado para tu perfil/);
    await expect.element(picture()).not.toBeInTheDocument();
    await expect.element(downloadButton()).toBeDisabled();
  });

  it("of a category, the flyer in force with its legal and its cap", async () => {
    const texts = textsDrawn();
    await openHunter({
      companies: [company("RUBRO SA", { rubro: { opcion: 8, importe: "30000" } })],
      permissions: ALL_FLYERS,
    });
    await expect.element(rows()).toMatchTextContent(/Rubro nuevo/);
    await choose("RUBRO SA");
    await expect.element(picture()).toBeVisible();
    expect(texts.join(" ")).toMatch(/Legal\s+nuevo/);
  });

  it("its own cap goes on the flyer, and with none the one of the template", async () => {
    await openHunter({
      companies: [
        company("CON TOPE SA", { rubro: { opcion: 11, importe: "41000" } }),
        company("SIN TOPE SA", { rubro: { opcion: 11 } }),
      ],
      permissions: ALL_FLYERS,
    });
    await expect.element(row("SIN TOPE SA")).toMatchTextContent(/sin tope cargado: sale \$24\.000/);
    await choose("CON TOPE SA");
    await expect.element(picture()).toBeVisible();
    await vi.waitFor(() => {
      expect(valuesOnPreview()).toMatchObject({ benef: true, importe: "$41.000" });
    });
    await choose("SIN TOPE SA");
    await vi.waitFor(() => {
      expect(valuesOnPreview()).toMatchObject({ benef: true, importe: "$24.000" });
    });
  });

  it("a flyer that turned out to have no picture says so and is not offered again", async () => {
    const { bucketFiles } = await openHunter({ companies: [company("ACME SA")] });
    await expect.element(row("ACME SA")).toHaveAttribute("data-can-draw", "true");
    bucketFiles["_active9.json"] = { imageUrl: null };
    await choose("ACME SA");
    await expect.element(message()).toMatchTextContent(/Ese flyer todavía no está cargado\./);
    await expect
      .element(message())
      .toMatchTextContent(/«Combustible» no tiene ningún flyer subido: avisale al administrador/);
    await expect.element(row("ACME SA")).toHaveAttribute("data-can-draw", "false");
    await expect.element(picture()).not.toBeInTheDocument();
  });

  it("if it cannot be brought it says so, and it is not written down as having none", async () => {
    const dropped: string[] = [];
    const { harness } = await openHunter({
      companies: [company("ACME SA")],
      droppedFiles: dropped,
    });
    await expect.element(row("ACME SA")).toHaveAttribute("data-can-draw", "true");
    dropped.push("_legal9.json");
    await choose("ACME SA");
    await expect.element(message()).toMatchTextContent(/No se pudo cargar el flyer\./);
    await expect.element(row("ACME SA")).toHaveAttribute("data-can-draw", "true");

    dropped.length = 0;
    await choose("ACME SA");
    await expect.element(picture()).toBeVisible();
    expect(
      harness.network.to("/storage/v1/object/public/flyers/_legal9.json").length,
    ).toBeGreaterThan(1);
  });

  it("a flyer that does not arrive never comes out on the picture of the one before", async () => {
    const dropped: string[] = [];
    await openHunter({
      companies: [company("ACME SA"), company("RUBRO SA", { rubro: { opcion: 11 } })],
      permissions: ALL_FLYERS,
      droppedFiles: dropped,
    });
    await choose("ACME SA");
    await expect.element(picture()).toBeVisible();
    dropped.push("_legal11.json");
    await choose("RUBRO SA");
    await expect.element(message()).toMatchTextContent(/No se pudo cargar el flyer\./);
    await expect.element(picture()).not.toBeInTheDocument();
    await expect.element(downloadButton()).toBeDisabled();
  });

  it("if it cannot be drawn it says so and there is nothing to download", async () => {
    vi.spyOn(console, "error").mockImplementation(NOTHING);
    vi.spyOn(CanvasRenderingContext2D.prototype, "fillText").mockImplementation(() => {
      throw new Error("Se rompió");
    });
    await openHunter({ companies: [company("ACME SA")] });
    await choose("ACME SA");
    await expect.element(message()).toMatchTextContent(/No se pudo armar el flyer\.\s*Se rompió/);
    await expect.element(downloadButton()).toBeDisabled();
  });

  it("one at a time: while it is being made, a touch on another one does nothing", async () => {
    const waiting = deferred<Response>();
    const { harness } = await openHunter({
      companies: [company("ACME SA"), company("BETA SA")],
    });
    await expect.element(status()).toHaveTextContent("2 empresas cargadas");
    harness.network.answerWith((request) =>
      request.path.endsWith("_legal9.json") ? waiting.promise : jsonResponse({ imageUrl: null }),
    );
    await choose("ACME SA");
    await expect.element(message()).toHaveTextContent("Armando el flyer…");
    await choose("BETA SA");
    await expect.element(row("BETA SA")).toHaveAttribute("data-selected", "false");
    await expect.element(row("ACME SA")).toHaveAttribute("data-selected", "true");
    waiting.resolve(jsonResponse({ text: "Legal" }));
    await expect.element(message()).toMatchTextContent(/Ese flyer todavía no está cargado/);
  });

  it("a flyer with no legal text warns", async () => {
    await openHunter({
      companies: [company("ACME SA")],
      files: { "_legal9.json": { text: "" } },
    });
    await choose("ACME SA");
    await expect
      .element(notice())
      .toMatchTextContent(/Combustible no tiene legal cargado — avisá a la central/);
  });

  it("a new company goes back to 100%", async () => {
    await openHunter({ companies: [company("ACME SA"), company("BETA SA")] });
    await choose("ACME SA");
    await expect.element(picture()).toBeVisible();
    await page.getByRole("button", { name: "Acercar" }).click();
    await expect.element(percent()).toHaveTextContent("125%");
    await page.getByRole("button", { name: "Restablecer zoom" }).click();
    await expect.element(percent()).toHaveTextContent("100%");
    await page.getByRole("button", { name: "Alejar" }).click();
    await expect.element(percent()).toHaveTextContent("80%");
    await choose("BETA SA");
    await expect.element(percent()).toHaveTextContent("100%");
  });
});

const wheelOnPreview = (fields: WheelEventInit) =>
  page
    .getByTestId("hunter-preview")
    .element()
    .dispatchEvent(new WheelEvent("wheel", { cancelable: true, ...fields }));

describe("the zoom", () => {
  it("the wheel alone says how to zoom, and with Ctrl it zooms", async () => {
    await openHunter({ companies: [company("ACME SA")] });
    await choose("ACME SA");
    await expect.element(picture()).toBeVisible();
    wheelOnPreview({});
    await expect
      .element(notice())
      .toHaveTextContent(
        "Para acercar el flyer: Ctrl + ruedita (o pellizcá en el touchpad). También con + y −.",
      );
    await expect.element(percent()).toHaveTextContent("100%");

    wheelOnPreview({ ctrlKey: true, deltaY: -100 });
    await expect.element(percent()).toHaveTextContent("125%");
  });
});

describe("the download", () => {
  it("leaves its log and nothing else, and says it after the file came out", async () => {
    const { harness } = await openHunter({ companies: [company("BETA S.A.")] });
    await expect.element(rows()).toBeVisible();
    const before = harness.network.requests.length;
    await choose("BETA S.A.");
    await expect.element(picture()).toBeVisible();
    await downloadButton().click();
    await expect.element(notice()).toHaveTextContent("Flyer descargado");
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/flyer_logs", "POST")).toHaveLength(1);
    });
    const [log] = harness.network.to("/rest/v1/flyer_logs", "POST");
    expect(log?.body).toMatchObject({
      empresa: "BETA S.A.",
      config_name: "Flyer BETA S.A",
      format: "pdf",
      is_bulk: false,
    });
    const writes = harness.network.requests
      .slice(before)
      .filter(({ method, path }) => !["GET", "HEAD"].includes(method) && path.startsWith("/rest/"));
    expect(writes.map(({ path }) => path)).toEqual(["/rest/v1/flyer_logs"]);
  });

  it("a file that did not come out is not said to be downloaded, nor logged", async () => {
    saving.result = () => Promise.resolve(failure({ kind: "generation", detail: "Sin memoria" }));
    const { harness } = await openHunter({ companies: [company("ACME SA")] });
    await choose("ACME SA");
    await expect.element(picture()).toBeVisible();
    await downloadButton().click();
    await expect.element(notice()).toHaveTextContent("No se pudo armar el PDF: Sin memoria");
    expect(harness.network.to("/rest/v1/flyer_logs", "POST")).toHaveLength(0);
  });

  it("Ctrl+Enter downloads the one on screen; with nothing on screen, nothing", async () => {
    const { harness } = await openHunter({ companies: [company("ACME SA")] });
    await expect.element(rows()).toBeVisible();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect.element(notice()).not.toHaveTextContent("Flyer descargado");
    await choose("ACME SA");
    await expect.element(picture()).toBeVisible();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect.element(notice()).toHaveTextContent("Flyer descargado");
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/flyer_logs", "POST")).toHaveLength(1);
    });
  });

  it("a second press while the first one is on its way does nothing", async () => {
    const answer = deferred<void>();
    saving.result = () => answer.promise.then(() => success(true));
    const { harness } = await openHunter({ companies: [company("ACME SA")] });
    await choose("ACME SA");
    await expect.element(picture()).toBeVisible();
    await downloadButton().click();
    await downloadButton().click();
    answer.resolve();
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/flyer_logs", "POST")).toHaveLength(1);
    });
  });
});

const othersToggle = () =>
  page.getByTestId("hunter-others").getByRole("button", { name: /^Otros/ });
const board = () => page.getByRole("link", { name: "Beneficios Haberes" });

describe("the menu Otros", () => {
  it("opens over what is below, with the board and Descarga múltiple", async () => {
    await openHunter({ companies: [company("ACME SA")] });
    await othersToggle().click();
    await expect.element(board()).toBeVisible();
    expect(board().element().getAttribute("target")).toBe("_blank");
    expect(board().element().getAttribute("rel")).toContain("noopener");
    await expect.element(page.getByRole("button", { name: "Descarga múltiple" })).toBeVisible();
  });

  it("closes by touching outside, with Escape and with its own button", async () => {
    await openHunter({ companies: [company("ACME SA")] });
    await othersToggle().click();
    await page.getByTestId("hunter-preview-message").click();
    await expect.element(board()).not.toBeInTheDocument();

    await othersToggle().click();
    await expect.element(board()).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(board()).not.toBeInTheDocument();

    await othersToggle().click();
    await othersToggle().click();
    await expect.element(board()).not.toBeInTheDocument();
  });
});

const startMultiple = async () => {
  await othersToggle().click();
  await page.getByRole("button", { name: "Descarga múltiple" }).click();
};
const bar = () => page.getByTestId("hunter-multiple-bar");
const zip = () => page.getByTestId("hunter-zip");
const tick = (name: string) => row(name).getByRole("checkbox");
const ticked = () =>
  Array.from(
    document.querySelectorAll('[data-testid="hunter-ticked-row"] [data-part="company"]'),
    (part) => part.textContent,
  );

describe("Descarga múltiple", () => {
  it("comes with its bar, and its ticks do not choose the company", async () => {
    await openHunter({ companies: [company("ACME SA"), company("BETA SA")] });
    await expect.element(bar()).not.toBeVisible();
    await startMultiple();
    await expect.element(bar()).toBeVisible();
    await expect.element(zip()).toBeDisabled();
    await expect.element(zip()).toHaveTextContent("Descargar ZIP");

    await tick("ACME SA").click();
    await expect
      .element(page.getByTestId("hunter-ticked-count"))
      .toHaveTextContent("1 empresa tildada");
    await expect.element(zip()).toHaveTextContent("Descargar ZIP (1)");
    await expect.element(picture()).not.toBeInTheDocument();
    await expect.element(row("ACME SA")).toHaveAttribute("data-selected", "false");
    await tick("BETA SA").click();
    await expect
      .element(page.getByTestId("hunter-ticked-count"))
      .toHaveTextContent("2 empresas tildadas");
  });

  it("the ticked ones stay on top even if the search shows others, in the order of the list", async () => {
    await openHunter({ companies: [company("ACME SA"), company("BETA SA"), company("GAMA SA")] });
    await startMultiple();
    await tick("GAMA SA").click();
    await tick("ACME SA").click();
    await search().fill("beta");
    await expect
      .element(page.getByTestId("hunter-ticked"))
      .toMatchTextContent(/Seleccionadas \(2\)/);
    expect(ticked()).toEqual(["ACME SA", "GAMA SA"]);
    await page.getByRole("button", { name: "Quitar" }).first().click();
    await vi.waitFor(() => {
      expect(ticked()).toEqual(["GAMA SA"]);
    });
  });

  it("Tildar todas takes those on sight that can come out, and takes them away", async () => {
    await openHunter({
      companies: [company("ACME SA"), company("NO SA", { rubro: { opcion: 8 } })],
    });
    await startMultiple();
    await expect.element(tick("NO SA")).toBeDisabled();
    await page.getByRole("checkbox", { name: "Tildar todas" }).click();
    expect(ticked()).toEqual(["ACME SA"]);
    await page.getByRole("checkbox", { name: "Tildar todas" }).click();
    await expect.element(page.getByTestId("hunter-ticked")).not.toBeInTheDocument();
  });

  it("a company with no name says so among the ticked ones too", async () => {
    await openHunter({ companies: [company("", { cuits: ["30711111111"] })] });
    await startMultiple();
    await rows().getByRole("checkbox").click();
    await expect
      .element(page.getByTestId("hunter-ticked-row"))
      .toMatchTextContent(/\(sin nombre\)/);
  });

  it("Cancelar leaves nothing ticked, and neither does the menu turning it off", async () => {
    await openHunter({ companies: [company("ACME SA")] });
    await startMultiple();
    await tick("ACME SA").click();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect.element(bar()).not.toBeVisible();
    await expect.element(tick("ACME SA")).not.toBeInTheDocument();

    await startMultiple();
    await expect.element(tick("ACME SA")).not.toBeChecked();
    await tick("ACME SA").click();
    await startMultiple();
    await expect.element(bar()).not.toBeVisible();
  });

  it("the ZIP asks first, each one on its flyer, and leaves its log", async () => {
    const zips = zipsDownloaded();
    const { harness } = await openHunter({
      companies: [company("ACME SA"), company("RUBRO SA", { rubro: { opcion: 11 } })],
      permissions: ALL_FLYERS,
    });
    await startMultiple();
    await tick("ACME SA").click();
    await tick("RUBRO SA").click();
    await zip().click();
    const question = page.getByRole("alertdialog");
    await expect.element(question).toMatchTextContent(/Se van a generar 2 flyers/);
    await question.getByRole("button", { name: "Generar", exact: true }).click();
    await expect
      .element(page.getByTestId("decision-dialog"))
      .toMatchTextContent(/✓ Flyers generados/);
    const [file] = zips;
    if (!file) throw new Error("There is no ZIP");
    const content = await JSZip.loadAsync(await file.arrayBuffer());
    expect(Object.keys(content.files)).toEqual(
      expect.arrayContaining([
        "Flyer Galicia - Combustible/Flyer ACME SA.pdf",
        "Flyer Rubros - Rubro nuevo/Flyer RUBRO SA.pdf",
        "Resumen.txt",
      ]),
    );
    await expect
      .element(page.getByTestId("hunter-batch-progress"))
      .toHaveTextContent("✓ ZIP con 2 flyers.");
    await vi.waitFor(() => {
      const logs = harness.network.to("/rest/v1/flyer_logs", "POST");
      expect(logs.at(-1)?.body).toMatchObject({ is_bulk: true, bulk_count: 2 });
    });
  });

  it("Ctrl+Enter downloads the ticked ones, not the one on screen", async () => {
    const zips = zipsDownloaded();
    const { harness } = await openHunter({ companies: [company("ACME SA"), company("BETA SA")] });
    await choose("BETA SA");
    await expect.element(picture()).toBeVisible();
    await startMultiple();
    await tick("ACME SA").click();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    const question = page.getByRole("alertdialog");
    await expect.element(question).toMatchTextContent(/Se van a generar 1 flyers/);
    await question.getByRole("button", { name: "Generar", exact: true }).click();
    await vi.waitFor(() => {
      expect(zips).toHaveLength(1);
    });
    expect(
      harness.network.to("/rest/v1/flyer_logs", "POST").map(({ body }) => body),
    ).not.toContainEqual(expect.objectContaining({ is_bulk: false }));
  });

  it("while it is generating, a touch on a row says to wait and changes nothing", async () => {
    zipsDownloaded();
    const waiting = deferred<Response>();
    // The shell watches it: meanwhile the search of screens does not open (`_pgBusy`).
    const watched = new Set<() => boolean>();
    const { harness } = await openHunter({
      companies: [company("ACME SA"), company("RUBRO SA", { rubro: { opcion: 11 } })],
      permissions: ALL_FLYERS,
      watchBatch: (isRunning) => {
        watched.add(isRunning);
        return () => {
          watched.delete(isRunning);
        };
      },
    });
    const generating = () => Array.from(watched).some((isRunning) => isRunning());
    expect(generating()).toBe(false);
    await startMultiple();
    await tick("RUBRO SA").click();
    await expect.element(tick("RUBRO SA")).toBeChecked();
    const before = harness.network.requests.length;
    harness.network.answerWith((request) =>
      request.path.endsWith("_legal11.json") ? waiting.promise : jsonResponse({ imageUrl: null }),
    );
    await zip().click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Generar", exact: true })
      .click();
    await expect.element(zip()).toBeDisabled();
    expect(generating()).toBe(true);
    expect(harness.network.requests.length).toBeGreaterThan(before);
    await choose("ACME SA");
    await expect.element(notice()).toHaveTextContent("Esperá a que termine de generar el ZIP.");
    await expect.element(row("ACME SA")).toHaveAttribute("data-selected", "false");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
    waiting.resolve(jsonResponse({ text: "" }));
    await expect.element(page.getByTestId("decision-dialog")).toBeVisible();
    expect(generating()).toBe(false);
  });
});

const proposeButton = (name: string) => row(name).getByRole("button", { name: "✎ Oficiales" });
const dialog = () => page.getByTestId("decision-dialog");
const send = () => dialog().getByRole("button", { name: "Enviar propuesta" });

describe("proposing officers", () => {
  it("without the permission there is no button", async () => {
    const { harness } = await openHunter({ companies: [company("ACME SA")] });
    await expect.element(rows()).toBeVisible();
    await expect.element(proposeButton("ACME SA")).not.toBeInTheDocument();
    expect(harness.network.to("/rest/v1/padron_propuestas")).toHaveLength(0);
  });

  it("goes through the request, with its owner, and never touches the list", async () => {
    const proposals: unknown[] = [];
    const { harness } = await openHunter({
      companies: [company("ACME SA")],
      permissions: WITH_PROPOSALS,
      proposals: () => jsonResponse(proposals),
    });
    await proposeButton("ACME SA").click();
    await expect.element(dialog()).toMatchTextContent(/Proponer un cambio de oficiales/);
    await expect.element(picture()).not.toBeInTheDocument();
    await expect.element(send()).toBeDisabled();
    await dialog().getByRole("textbox", { name: "Nombre del oficial 1" }).fill("Carla Nueva");
    await dialog().getByTestId("proposal-note").fill("El celular cambió");
    proposals.push({
      id: "p1",
      dueno_id: OWNER,
      empresa_key: "acme sa",
      empresa: "ACME SA",
      estado: "pendiente",
      asesores: [],
      asesores_antes: [],
      created_at: "2026-10-20T10:00:00Z",
    });
    await send().click();
    await expect
      .element(notice())
      .toHaveTextContent("Propuesta enviada: queda pendiente de aprobación.");
    await expect.element(dialog()).not.toBeInTheDocument();
    await expect
      .element(row("ACME SA"))
      .toMatchTextContent(/Propusiste un cambio: pendiente de aprobación/);
    await expect.element(proposeButton("ACME SA")).not.toBeInTheDocument();
    const [request] = harness.network.to("/rest/v1/rpc/padron_propuesta_crear");
    expect(request?.body).toMatchObject({
      p_empresa: "ACME SA",
      p_dueno: OWNER,
      p_nota: "El celular cambió",
    });
    expect(JSON.stringify(request?.body)).toContain("Carla Nueva");
    expect(harness.network.to("/rest/v1/rpc/padron_replace")).toHaveLength(0);
  });

  it("with no note it goes as null", async () => {
    const { harness } = await openHunter({
      companies: [company("ACME SA")],
      permissions: WITH_PROPOSALS,
    });
    await proposeButton("ACME SA").click();
    await dialog().getByRole("textbox", { name: "Nombre del oficial 1" }).fill("Carla Nueva");
    await send().click();
    await expect.element(dialog()).not.toBeInTheDocument();
    const [request] = harness.network.to("/rest/v1/rpc/padron_propuesta_crear");
    expect(request?.body).toMatchObject({ p_nota: null });
  });

  it("what cannot be sent says so, keeps the window and can be sent again", async () => {
    let fails = true;
    const { harness } = await openHunter({
      companies: [company("ACME SA")],
      permissions: WITH_PROPOSALS,
      rpc: () =>
        fails
          ? jsonResponse({ message: "falla simulada", code: "XX000" }, 500)
          : jsonResponse(null),
    });
    await proposeButton("ACME SA").click();
    await dialog().getByRole("textbox", { name: "Nombre del oficial 1" }).fill("Carla Nueva");
    await send().click();
    await expect.element(notice()).toHaveTextContent("No se pudo enviar: falla simulada");
    await expect.element(dialog()).toBeVisible();
    fails = false;
    await send().click();
    await expect.element(dialog()).not.toBeInTheDocument();
    expect(harness.network.to("/rest/v1/rpc/padron_propuesta_crear")).toHaveLength(2);
  });

  it("Cancelar sends nothing", async () => {
    const { harness } = await openHunter({
      companies: [company("ACME SA")],
      permissions: WITH_PROPOSALS,
    });
    await proposeButton("ACME SA").click();
    await dialog().getByRole("button", { name: "Cancelar" }).click();
    await expect.element(dialog()).not.toBeInTheDocument();
    expect(harness.network.to("/rest/v1/rpc/padron_propuesta_crear")).toHaveLength(0);
  });

  it("a company with no owner says it cannot be proposed", async () => {
    const { user_id: _owner, ...withNoOwner } = company("ACME SA");
    await openHunter({ companies: [withNoOwner], permissions: WITH_PROPOSALS });
    await proposeButton("ACME SA").click();
    await expect
      .element(notice())
      .toHaveTextContent("No se pudo identificar al oficial dueño de esta empresa.");
    await expect.element(dialog()).not.toBeInTheDocument();
  });

  it("a question waits on the row, which sends to Mis propuestas", async () => {
    await openHunter({
      companies: [company("ACME SA"), company("BETA SA")],
      permissions: WITH_PROPOSALS,
      proposals: [
        {
          id: "p1",
          dueno_id: OWNER,
          empresa_key: "acme sa",
          empresa: "ACME SA",
          estado: "consulta",
        },
        {
          id: "p2",
          dueno_id: OWNER,
          empresa_key: "beta sa",
          empresa: "BETA SA",
          estado: "aprobada",
        },
      ],
    });
    await expect
      .element(row("ACME SA"))
      .toMatchTextContent(/El oficial te hizo una consulta · tu nombre → Mis propuestas/);
    await expect.element(proposeButton("ACME SA")).not.toBeInTheDocument();
    await expect.element(proposeButton("BETA SA")).toBeVisible();
  });

  it("looks again on coming back to the screen", async () => {
    const { harness, show } = await openHunter({
      companies: [company("ACME SA")],
      permissions: WITH_PROPOSALS,
    });
    await expect.element(proposeButton("ACME SA")).toBeVisible();
    await show(false);
    const before = harness.network.to("/rest/v1/padron_propuestas").length;
    await show(true);
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/padron_propuestas").length).toBeGreaterThan(before);
    });
  });
});

const registerButton = () => page.getByTestId("hunter-register");

function deskAround() {
  const goTo = vi.fn<(tabId: string) => void>();
  const register = vi.fn<(company: RegisterableCompany) => void>();
  return { goTo, register, desk: createCommercialDesk({ goTo, onRegister: register }) };
}

describe("Gestiones on this screen", () => {
  const WITH_COMMERCIAL = { opcion_9: true, gestiones: true };

  it("with Gestiones off there is no button, and Alt+G does nothing", async () => {
    const { desk, register } = deskAround();
    await openHunter({ companies: [company("ACME SA")], desk, permissions: WITH_COMMERCIAL });
    await choose("ACME SA");
    await expect.element(downloadButton()).toBeEnabled();
    await expect.element(registerButton()).not.toBeInTheDocument();
    await userEvent.keyboard("{Alt>}g{/Alt}");
    expect(register).not.toHaveBeenCalled();
  });

  it("with Gestiones on it registers the company chosen", async () => {
    const { desk, register } = deskAround();
    await openHunter({
      companies: [company("ACME SA")],
      desk,
      commercialFlag: "on",
      permissions: WITH_COMMERCIAL,
    });
    await expect.element(registerButton()).toBeVisible();
    await expect
      .element(registerButton())
      .toHaveAttribute("title", "Registrar gestión de la empresa elegida (Alt+G)");

    await registerButton().click();
    await expect.element(notice()).toHaveTextContent("Elegí primero una empresa de la lista.");
    expect(register).not.toHaveBeenCalled();

    await choose("ACME SA");
    await registerButton().click();
    expect(register.mock.calls[0]?.[0]).toMatchObject({ empresa: "ACME SA", user_id: OWNER });
  });

  it("Alt+G does the same, only with the screen on top and no window open", async () => {
    const { desk, register } = deskAround();
    const { show } = await openHunter({
      companies: [company("ACME SA")],
      desk,
      commercialFlag: "on",
      permissions: WITH_COMMERCIAL,
    });
    await choose("ACME SA");
    await expect.element(registerButton()).toBeVisible();

    await userEvent.keyboard("{Alt>}g{/Alt}");
    expect(register).toHaveBeenCalledOnce();

    await userEvent.keyboard("{Control>}{Alt>}g{/Alt}{/Control}");
    expect(register).toHaveBeenCalledOnce();

    await show(false);
    await userEvent.keyboard("{Alt>}g{/Alt}");
    expect(register).toHaveBeenCalledOnce();
  });

  it("Alt+G does nothing with a window on top", async () => {
    const { desk, register } = deskAround();
    await openHunter({
      companies: [company("ACME SA")],
      desk,
      commercialFlag: "on",
      permissions: WITH_COMMERCIAL,
    });
    await choose("ACME SA");
    await expect.element(registerButton()).toBeVisible();
    const somethingOnTop = document.createElement("div");
    somethingOnTop.setAttribute("aria-modal", "true");
    document.body.append(somethingOnTop);

    await userEvent.keyboard("{Alt>}g{/Alt}");
    expect(register).not.toHaveBeenCalled();

    somethingOnTop.remove();
    await userEvent.keyboard("{Alt>}g{/Alt}");
    expect(register).toHaveBeenCalledOnce();
  });

  it("does not take a company with no officer", async () => {
    const { desk, register } = deskAround();
    await openHunter({
      companies: [company("ACME SA", { user_id: null })],
      desk,
      commercialFlag: "on",
      permissions: WITH_COMMERCIAL,
    });
    await choose("ACME SA");
    await registerButton().click();
    await expect
      .element(notice())
      .toHaveTextContent("No se pudo identificar al oficial de esa empresa. Volvé a buscarla.");
    expect(register).not.toHaveBeenCalled();
  });

  it('"Ver su flyer" leaves the company written and chooses the first one', async () => {
    const { desk } = deskAround();
    await openHunter({ companies: [company("ACME SA"), company("BETA SA")], desk });
    await expect.element(row("BETA SA")).toBeVisible();

    desk.showFlyer("hunter", { company: " BETA SA ", taxIds: null });

    await expect.element(search()).toHaveValue("BETA SA");
    await expect.element(downloadButton()).toBeEnabled();
  });

  it("if it arrives before the list, it waits for it", async () => {
    const { desk } = deskAround();
    desk.showFlyer("hunter", { company: "BETA SA", taxIds: null });
    await openHunter({ companies: [company("BETA SA")], desk });
    await expect.element(search()).toHaveValue("BETA SA");
    await expect.element(downloadButton()).toBeEnabled();
  });

  it("if it is not there, it says so", async () => {
    const { desk } = deskAround();
    await openHunter({ companies: [company("ACME SA")], desk });
    await expect.element(row("ACME SA")).toBeVisible();
    desk.showFlyer("hunter", { company: "NINGUNA", taxIds: null });
    await expect
      .element(notice())
      .toHaveTextContent("No encontré «NINGUNA» en las empresas que podés bajar.");
  });

  it("if the companies could not be read, it does not say it is not there", async () => {
    const { desk } = deskAround();
    await openHunter({ companies: CUT, desk });
    await expect.element(retry()).toBeVisible();
    desk.showFlyer("hunter", { company: "NINGUNA", taxIds: null });
    await expect.element(search()).toHaveValue("NINGUNA");
    await expect.element(page.getByText(/No encontré/)).not.toBeInTheDocument();
  });
});
