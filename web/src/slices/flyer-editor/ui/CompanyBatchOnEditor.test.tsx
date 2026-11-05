// Generar flyers, seen from the editor that makes it: the flyers it goes through and where it ends.
import JSZip from "jszip";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { Company } from "@/shared/domain/company-registry/index.ts";
import { FlyerGenerationHost } from "@/shared/lib/company-registry/FlyerGenerationHost.tsx";
import {
  type FlyerGenerationPort,
  useFlyerGeneration,
} from "@/shared/lib/company-registry/flyer-generation-port.ts";
import { workspaceOnScreen } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { ADVISOR, createAppHarness, type AppAnswers } from "@/shared/lib/testing/app-harness.tsx";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { ALLOWED, flyerFiles, flyerShown } from "../testing/editor-on-screen.tsx";
import { FlyerEditorView } from "./FlyerEditorView.tsx";

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

const OF_CATEGORY = { opcion: 8, importe: "", importe2: "", txt: "" };
const NOTHING = () => undefined;

function Reader({ onPort }: { readonly onPort: (port: FlyerGenerationPort | null) => void }) {
  onPort(useFlyerGeneration());
  return null;
}

interface StageProps {
  readonly tabId: string;
  readonly isActive: boolean;
  readonly goToTab: (tab: string) => void;
  readonly onPort: (port: FlyerGenerationPort | null) => void;
}

function Stage({ tabId, isActive, goToTab, onPort }: StageProps) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  const [tab, setTab] = useState(tabId);
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return (
    <FlyerGenerationHost onNeedEditor={NOTHING} checkAfterMs={60_000}>
      <Reader onPort={onPort} />
      <FlyerEditorView
        tabId={tab}
        isActive={isActive}
        goToTab={(next) => {
          goToTab(next);
          setTab(next);
        }}
      />
    </FlyerGenerationHost>
  );
}

async function open(answers: AppAnswers = {}, stage: Partial<StageProps> = {}) {
  const harness = createAppHarness({ profile: ADVISOR, files: flyerFiles(), ...answers });
  harness.storeSession();
  const goToTab = vi.fn<(tab: string) => void>();
  const seen: { port: FlyerGenerationPort | null } = { port: null };
  await render(
    harness.wrap(
      <Stage
        tabId="flyer"
        isActive
        goToTab={goToTab}
        onPort={(port) => {
          seen.port = port;
        }}
        {...stage}
      />,
    ),
  );
  return { harness, goToTab, seen };
}

function zipsDownloaded() {
  const zips: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (blob instanceof Blob) zips.push(blob);
    return "blob:zip";
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(NOTHING);
  return zips;
}

const confirm = () =>
  page.getByRole("alertdialog").getByRole("button", { name: "Generar", exact: true }).click();
const report = () => page.getByTestId("decision-dialog");

async function namesIn(blob: Blob | undefined) {
  if (!blob) throw new Error("There is no ZIP");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the editor makes what Base de datos asks", () => {
  it("each company on its flyer, going through its tab, and it comes back", async () => {
    const zips = zipsDownloaded();
    const { goToTab, seen } = await open();
    await flyerShown();
    const done = seen.port?.generate({
      companies: [company("A"), company("B", { rubro: OF_CATEGORY })],
      format: "pdf",
      onProgress: NOTHING,
    });
    await confirm();
    await expect.element(report()).toMatchTextContent(/✓ Flyers generados/);
    await done;
    expect((await namesIn(zips[0])).toSorted()).toEqual([
      "Flyer Galicia - Combustible/Flyer A.pdf",
      "Flyer Rubros - Rubro Uno/Flyer B.pdf",
      "Resumen.txt",
    ]);
    expect(goToTab).toHaveBeenCalledWith("rubros");
    expect(goToTab).toHaveBeenLastCalledWith("flyer");
    expect(workspaceOnScreen().getState().slot.option).toBe(9);
  });

  it("with another screen in front it goes through the flyers without taking the person away", async () => {
    const zips = zipsDownloaded();
    const { goToTab, seen } = await open({}, { isActive: false });
    await vi.waitFor(() => {
      expect(seen.port).not.toBeNull();
    });
    const done = seen.port?.generate({
      companies: [company("B", { rubro: OF_CATEGORY })],
      format: "pdf",
      onProgress: NOTHING,
    });
    await confirm();
    await expect.element(report()).toMatchTextContent(/✓ Flyers generados/);
    await done;
    expect(await namesIn(zips[0])).toContain("Flyer Rubros - Rubro Uno/Flyer B.pdf");
    expect(goToTab).not.toHaveBeenCalled();
  });

  it("what it knows of a flyer answers for the rest of the app", async () => {
    const { seen } = await open();
    await flyerShown();
    expect(seen.port?.hasFlyer(9)).toBe(true);
    expect(seen.port?.hasFlyer(7)).toBeUndefined();
    expect(seen.port?.isGenerating()).toBe(false);
  });

  it("a company without cashback goes on its version, if this person has one", async () => {
    const zips = zipsDownloaded();
    const { seen } = await open({
      files: {
        ...flyerFiles(),
        "_opciones.json": {
          opts: [
            { n: 9, nombre: "Combustible", solapa: "flyer", orden: 0 },
            { n: 10, nombre: "Sin cashback", solapa: "flyer", orden: 1, sinCB: 9 },
          ],
        },
        "_facultades.json": { roles: { asesor: { ...ALLOWED, opcion_10: true } } },
        "_active10.json": flyerFiles()["_active9.json"],
        "_legal10.json": { text: "Legal sin cashback" },
      },
    });
    await flyerShown();
    const done = seen.port?.generate({
      companies: [company("CON"), company("SIN", { config: "" })],
      format: "pdf",
      onProgress: NOTHING,
    });
    await expect.element(page.getByRole("alertdialog")).toMatchTextContent(/1 en .*Sin cashback/);
    await confirm();
    await expect.element(report()).toBeVisible();
    await done;
    expect(await namesIn(zips[0])).toContain("Flyer Galicia - Sin cashback/Flyer SIN.pdf");
  });
});
