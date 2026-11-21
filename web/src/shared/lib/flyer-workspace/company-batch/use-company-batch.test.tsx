import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { Company } from "@/shared/domain/company-registry/index.ts";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { testScene } from "@/shared/flyer-engine/testing/test-scene.ts";
import { ADVISOR, type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { useSession } from "@/shared/session/index.ts";
import { paintedCanvas } from "@/shared/flyer-engine/testing/test-scene.ts";
import { FlyerWorkspaceProvider } from "../FlyerWorkspaceProvider.tsx";
import { useFlyerWorkspace } from "../workspace-context.ts";
import type { OptionLoader } from "../option-loader.ts";
import { type CompanyBatch, useCompanyBatch } from "./use-company-batch.tsx";

const OPTIONS = sanitizeFlyerOptions([
  { n: 9, nombre: "Combustible", solapa: "flyer" },
  { n: 7, nombre: "Rota", solapa: "flyer" },
  { n: 8, nombre: "Rubro", solapa: "rubros" },
]);
const RULES = { options: OPTIONS, tabLabel: () => "Flyer Galicia" };
const SCENE = testScene({ art: paintedCanvas(124, 646) });

function company(empresa: string, fields: Partial<Company> = {}): Company {
  return {
    empresa,
    cuits: [],
    config: "BAU",
    asesores: [{ nombre: "Ana", celular: "", email: "a@x.com" }],
    rubro: { opcion: 0, importe: "", importe2: "", txt: "" },
    ...fields,
  };
}

function optionOf({ empresa }: Company): number {
  if (empresa.startsWith("rota")) return 7;
  if (empresa.startsWith("prohibida")) return -8;
  if (empresa.startsWith("nada")) return 0;
  return 9;
}

const loadOption: OptionLoader = (option) =>
  Promise.resolve(
    option === 7
      ? { scene: null, failure: "network", legal: null }
      : { scene: SCENE, failure: null, legal: `Legal ${String(option)}` },
  );

function Stage({ onReady }: { readonly onReady: (batch: CompanyBatch) => void }) {
  const workspace = useFlyerWorkspace();
  const batch = useCompanyBatch({
    rules: RULES,
    optionOf,
    goTo: (option) => workspace.selectOption(option, false),
    goBack: (option) => {
      void workspace.selectOption(option, false);
    },
    formCap: () => "$24.000",
  });
  onReady(batch);
  return batch.dialogs;
}

function Signed({ onReady }: { readonly onReady: (batch: CompanyBatch) => void }) {
  const session = useSession();
  if (session.status !== "signed-in") return <span>entrando</span>;
  return (
    <FlyerWorkspaceProvider options={{ loadOption }}>
      <Stage onReady={onReady} />
      <span>adentro</span>
    </FlyerWorkspaceProvider>
  );
}

async function open(answers: AppAnswers = {}) {
  const harness = createAppHarness({ profile: ADVISOR, ...answers });
  harness.storeSession();
  const seen: { batch: CompanyBatch | null } = { batch: null };
  await render(
    harness.wrap(
      <Signed
        onReady={(batch) => {
          seen.batch = batch;
        }}
      />,
    ),
  );
  await expect.element(page.getByText("adentro")).toBeVisible();
  return {
    harness,
    generate: (companies: readonly Company[], others = {}) => {
      if (!seen.batch) throw new Error("It is not on the page");
      return seen.batch.generate({
        companies,
        format: "pdf",
        onProgress: () => undefined,
        ...others,
      });
    },
    isGenerating: () => seen.batch?.isGenerating(),
  };
}

function zipsDownloaded() {
  const zips: { blob: Blob; name: string }[] = [];
  const pending: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (blob instanceof Blob) pending.push(blob);
    return "blob:zip";
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function record(
    this: HTMLAnchorElement,
  ) {
    const blob = pending.shift();
    if (blob) zips.push({ blob, name: this.download });
  });
  return zips;
}

const question = () => page.getByRole("alertdialog");
const report = () => page.getByTestId("decision-dialog");
const status = () => page.getByRole("status");
const confirm = () => question().getByRole("button", { name: "Generar", exact: true }).click();

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("a batch of companies", () => {
  it("asks before starting, and going back does nothing", async () => {
    const zips = zipsDownloaded();
    const { generate } = await open();
    const done = generate([company("a"), company("b")]);
    await expect.element(question()).toMatchTextContent(/Revisá antes de generar/);
    await expect
      .element(question())
      .toMatchTextContent(/Se van a generar 2 flyers:.*2 en Flyer Galicia · Combustible/);
    await question().getByRole("button", { name: "Volver" }).click();
    await done;
    await expect.element(question()).not.toBeInTheDocument();
    expect(zips).toEqual([]);
  });

  it("nobody that can come out: it says so and does not ask", async () => {
    const { generate } = await open();
    await generate([company("prohibida"), company("nada")]);
    await expect
      .element(status())
      .toHaveTextContent("Ninguna de las empresas tildadas se puede generar con tu perfil");
    await expect.element(question()).not.toBeInTheDocument();
  });

  it("with no companies it does nothing", async () => {
    const zips = zipsDownloaded();
    const { generate } = await open();
    await generate([]);
    await expect.element(question()).not.toBeInTheDocument();
    expect(zips).toEqual([]);
  });

  it("generates, downloads, logs what came out, and tells how it went", async () => {
    const zips = zipsDownloaded();
    const onProgress = vi.fn<(progress: { percent: number; text: string }) => void>();
    const { generate, harness, isGenerating } = await open();
    const done = generate([company("a"), company("rota"), company("prohibida")], {
      onProgress,
      zipBase: "Flyers_Combustible",
    });
    await expect.element(question()).toMatchTextContent(/1 quedan afuera:.*prohibida/);
    await confirm();
    await expect.element(report()).toMatchTextContent(/✓ Flyers generados/);
    await done;
    expect(isGenerating()).toBe(false);
    expect(zips[0]?.name).toMatch(/^Flyers_Combustible_\d{4}-\d{2}-\d{2}\.zip$/);
    await expect
      .element(report())
      .toMatchTextContent(/1 flyer en PDF · Flyers_Combustible_.*\.zip · hace un momento/);
    await expect
      .element(report())
      .toMatchTextContent(
        /2 no generadas: prohibida \(rubro Rubro no habilitado\), rota \(no se pudo cargar/,
      );
    await expect.element(report()).toMatchTextContent(/El mismo resumen va dentro del ZIP/);
    expect(onProgress.mock.calls.at(-1)?.[0].text).toBe("✓ ZIP con 1 flyer.");
    const logs = harness.network.requests.filter(
      ({ path, method }) => path === "/rest/v1/flyer_logs" && method === "POST",
    );
    expect(logs.map(({ body }) => body)).toEqual([
      expect.objectContaining({ empresa: "Mis empresas (1 flyers)", bulk_count: 1, is_bulk: true }),
    ]);
    await report().getByRole("button", { name: "Cerrar" }).click();
    await expect.element(report()).not.toBeInTheDocument();
  });

  it("with everything right it has nothing to observe", async () => {
    zipsDownloaded();
    const { generate } = await open();
    const done = generate([company("a"), company("b")], { format: "png" });
    await confirm();
    await expect
      .element(report())
      .toMatchTextContent(/Sin observaciones: todas las empresas tenían oficiales/);
    await expect.element(report()).toMatchTextContent(/2 flyers en PNG/);
    await done;
  });

  it("with no flyer at all it downloads nothing, logs nothing and says why", async () => {
    const zips = zipsDownloaded();
    const onProgress = vi.fn<(progress: { percent: number; text: string }) => void>();
    const { generate, harness, isGenerating } = await open();
    const done = generate([company("rota")], { onProgress });
    await confirm();
    await expect.element(report()).toMatchTextContent(/No se generó ningún flyer/);
    await expect.element(report()).toMatchTextContent(/rota \(no se pudo cargar el flyer «Rota»\)/);
    await expect.element(report()).not.toHaveTextContent("El mismo resumen");
    await done;
    expect(zips).toEqual([]);
    expect(isGenerating()).toBe(false);
    expect(onProgress.mock.calls.at(-1)?.[0].text).toBe(
      "No se generó ningún flyer. Mirá el detalle.",
    );
    expect(harness.network.to("/rest/v1/flyer_logs")).toEqual([]);
  });

  it("a ZIP that cannot be made is said, and nothing stays locked", async () => {
    vi.spyOn(JSZip.prototype, "generateAsync").mockRejectedValue(new Error("sin memoria"));
    const onProgress = vi.fn<(progress: { percent: number; text: string }) => void>();
    const { generate, isGenerating } = await open();
    const done = generate([company("a")], { onProgress });
    await confirm();
    await done;
    expect(isGenerating()).toBe(false);
    expect(onProgress.mock.calls.at(-1)?.[0].text).toBe("Error al armar el ZIP: sin memoria");
    await expect.element(report()).not.toBeInTheDocument();
  });

  it("something unexpected does not leave it locked either", async () => {
    const onProgress = vi.fn<(progress: { percent: number; text: string }) => void>(({ text }) => {
      if (text === "Preparando...") throw new Error("inesperado");
    });
    const { generate, isGenerating } = await open();
    const done = generate([company("a")], { onProgress });
    await confirm();
    await done;
    expect(isGenerating()).toBe(false);
    expect(onProgress.mock.calls.at(-1)?.[0].text).toBe("Error al armar el ZIP: inesperado");
  });

  it("the libraries come first: while they come down it counts as running", async () => {
    zipsDownloaded();
    const { generate, isGenerating } = await open();
    const done = generate([company("a")]);
    expect(isGenerating()).toBe(true);
    await expect.element(question()).toBeVisible();
    expect(isGenerating()).toBe(false);
    await question().getByRole("button", { name: "Volver" }).click();
    await done;
  });

  it("a second one does nothing while one runs", async () => {
    const zips = zipsDownloaded();
    const { generate } = await open();
    const first = generate([company("a")]);
    await generate([company("b")]);
    await confirm();
    await first;
    expect(zips).toHaveLength(1);
  });
});
