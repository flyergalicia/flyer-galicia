import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import {
  sanitizeCompanies,
  type SearchableCompany,
} from "@/shared/domain/company-registry/index.ts";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { paintedFlyer } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { useCompanies } from "@/slices/company-registry/index.ts";
import { useLogoEditorActions } from "@/slices/logo-editor/index.ts";
import { type FormCloud, openWithForm } from "../testing/form-on-screen.tsx";
import { useCompanyBringing } from "./use-company-bringing.ts";
import type { LoadedOption } from "@/shared/lib/flyer-workspace/index.ts";

const IMAGE = paintedFlyer([]);
const OPTIONS = {
  opts: [
    { n: 1, nombre: "General", solapa: "flyer" },
    { n: 4, nombre: "General sin cashback", solapa: "flyer", sinCB: 1 },
    { n: 5, nombre: "Sin importes", solapa: "flyer" },
    { n: 6, nombre: "Sin importes, de la 1", solapa: "flyer" },
    { n: 8, nombre: "Combustible", solapa: "rubros", rubro: "combustible" },
  ],
};

const FACULTIES = {
  padron_buscar: true,
  opcion_1: true,
  opcion_4: true,
  opcion_5: true,
  opcion_6: true,
  opcion_8: true,
};

const FILES = {
  "_opciones.json": OPTIONS,
  "_active.json": { imageUrl: IMAGE, cfg: {} },
  "_legal.json": { text: "Legal" },
  "_active4.json": { imageUrl: IMAGE, cfg: {} },
  "_legal4.json": { text: "Legal" },
  "_active5.json": { imageUrl: IMAGE, cfg: { montos: { off: true } } },
  "_legal5.json": { text: "Legal" },
  "_active6.json": { imageUrl: IMAGE, cfg: { montos: { off: true }, recDe: 1 } },
  "_legal6.json": { text: "Legal" },
  "_active8.json": { imageUrl: IMAGE, cfg: {} },
  "_legal8.json": { text: "Legal" },
};

function company(row: Record<string, unknown>): SearchableCompany {
  const [clean] = sanitizeCompanies([{ cuits: [], config: "BAU", asesores: [], ...row }]);
  if (!clean) throw new Error("It has no name");
  return clean;
}

const ACME = company({
  empresa: "ACME",
  asesores: [{ nombre: "Ana Perez", celular: "11 1", email: "" }],
});
const NO_CASHBACK = company({ empresa: "SIN", config: "SIN" });
const OF_FUEL = company({ empresa: "NAFTA", rubro: { opcion: 8 } });

type Bringing = ReturnType<typeof useCompanyBringing>;
type LogoEditor = ReturnType<typeof useLogoEditorActions>;

function reviewDouble() {
  return {
    companyBrought: vi.fn<(one: SearchableCompany) => void>(),
    companyForgotten: () => undefined,
    reviewAfterDownload: () => undefined,
    dialog: null,
  };
}

function Bringer({
  review,
  goToTab,
  onValue,
}: {
  readonly review: ReturnType<typeof reviewDouble>;
  readonly goToTab: (tabId: string) => void;
  readonly onValue: (value: Bringing, editor: LogoEditor) => void;
}) {
  const workspace = useFlyerWorkspace();
  const editor = useLogoEditorActions();
  useCompanies();
  const bringing = useCompanyBringing({
    review,
    goToTab,
    choose: (option): Promise<LoadedOption> => workspace.selectOption(option, false),
  });
  useEffect(() => {
    onValue(bringing, editor);
  });
  return <div data-testid="notice">{bringing.notice?.kind ?? "ninguno"}</div>;
}

async function open(cloud: FormCloud = {}, option = 1) {
  const review = reviewDouble();
  const goToTab = vi.fn<(tabId: string) => void>();
  let bringing: Bringing | null = null;
  let logoEditor: LogoEditor | null = null;
  const opened = await openWithForm(
    <Bringer
      review={review}
      goToTab={goToTab}
      onValue={(value, editor) => {
        bringing = value;
        logoEditor = editor;
      }}
    />,
    { faculties: FACULTIES, ...cloud, files: { ...FILES, ...cloud.files } },
  );
  await expect.element(page.getByTestId("notice")).toHaveTextContent("ninguno");
  await opened.workspace().selectOption(option, false);
  return {
    ...opened,
    review,
    goToTab,
    bringing: () => {
      if (!bringing) throw new Error("It is not on screen");
      return bringing;
    },
    editor: () => {
      if (!logoEditor) throw new Error("It is not on screen");
      return logoEditor;
    },
    notice: page.getByTestId("notice"),
    toast: page.getByRole("status"),
  };
}

describe("bringing a company", () => {
  it("fills the form, tells where it came from, and watches changes against it", async () => {
    const { bringing, form, review, toast } = await open();
    bringing().bring(ACME);
    expect(form().getState().empresa).toBe("ACME");
    expect(form().getState().note).toBe("");
    expect(review.companyBrought).toHaveBeenCalledWith(ACME);
    await expect.element(toast).toMatchTextContent(/"ACME" cargada de tus empresas — 1 oficial/);
  });

  it("one with no officers leaves a note", async () => {
    const { bringing, form } = await open();
    bringing().bring(company({ empresa: "SOLA" }));
    expect(form().getState().note).toBe("Esta empresa no tiene oficiales asignados.");
  });

  it("one of another person says of whom", async () => {
    const { bringing, toast } = await open();
    bringing().bring({ ...ACME, owner: { id: "o1", nombre: "Pepito Gomez" } });
    await expect.element(toast).toMatchTextContent(/cargada de las empresas de Pepito Gomez/);
  });

  it("the logos go back to how they come, except inside a draft or a design (invariant 21)", async () => {
    const { bringing, editor } = await open();
    editor().works.add({
      id: "d",
      option: 1,
      name: "Diseño",
      temp: false,
      mine: true,
      status: "privado",
      company: "",
      changes: [
        {
          x: 96,
          y: 596,
          w: 88,
          h: 48,
          bg: "#fff",
          img: "",
          t: "",
          ox: 100,
          oy: 600,
          ow: 80,
          oh: 40,
        },
      ],
      cuts: [],
      legal: null,
      uploads: {},
    });
    await editor().works.open("d");
    expect(editor().active()).toHaveLength(1);

    bringing().bring(ACME);
    expect(editor().active()).toHaveLength(1);

    editor().works.letGoDesign();
    bringing().bring(ACME);
    expect(editor().active()).toEqual([]);
  });

  it("the warning of the wrong flyer always comes out on bringing it (invariant 2)", async () => {
    const { bringing, notice } = await open();
    bringing().bring(OF_FUEL);
    await expect.element(notice).toHaveTextContent("category");
    bringing().close();
    await expect.element(notice).toHaveTextContent("ninguno");
    bringing().bring(OF_FUEL);
    // The same one, again.
    await expect.element(notice).toHaveTextContent("category");
  });

  it("without the faculty of the list there is no warning", async () => {
    const { bringing, notice } = await open({
      faculties: { ...FACULTIES, padron_buscar: false },
    });
    bringing().bring(OF_FUEL);
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    await expect.element(notice).toHaveTextContent("ninguno");
  });

  it("no valid cashback says so where there is no version without it", async () => {
    const { bringing, notice, form } = await open({
      files: { "_opciones.json": { opts: [{ n: 1, nombre: "General", solapa: "flyer" }] } },
    });
    bringing().bring(NO_CASHBACK);
    expect(form().getState().noCashback).toBe(true);
    await expect.element(notice).toHaveTextContent("no-cashback");
  });

  it("with no valid cashback on a flyer that shows none, it only looks at the category", async () => {
    const { bringing, notice } = await open({}, 5);
    bringing().bring(company({ empresa: "SIN", config: "SIN", rubro: { opcion: 8 } }));
    await expect.element(notice).toHaveTextContent("category");
  });

  it("goes to the version without cashback, and comes back with one", async () => {
    const { bringing, toast, workspace } = await open({
      files: {
        "_opciones.json": {
          opts: [
            { n: 1, nombre: "General", solapa: "flyer", sinCB: 0 },
            { n: 4, nombre: "General sin cashback", solapa: "flyer", sinCB: 1 },
          ],
        },
      },
    });
    bringing().bring(NO_CASHBACK);
    await expect
      .element(toast)
      .toMatchTextContent(/SIN no tiene cashback: se usa «General sin cashback»\./);
    expect(workspace().getState().slot.option).toBe(4);

    bringing().bring(ACME);
    await expect.element(toast).toMatchTextContent(/ACME tiene cashback: se usa «General»\./);
    expect(workspace().getState().slot.option).toBe(1);
  });

  it("if the flyer it would go to does not load, it stays quiet: its notice says so", async () => {
    const { bringing, notice, toast } = await open({
      droppedFiles: ["_active4.json"],
      files: {
        "_opciones.json": {
          opts: [
            { n: 1, nombre: "General", solapa: "flyer" },
            { n: 4, nombre: "General sin cashback", solapa: "flyer", sinCB: 1 },
          ],
        },
      },
    });
    bringing().bring(NO_CASHBACK);
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
    await expect.element(notice).toHaveTextContent("ninguno");
    await expect.element(toast).not.toMatchTextContent(/se usa/);
  });

  it("with cashback on a flyer without amounts: it offers to go back, if it can", async () => {
    const withOriginal = await open({}, 6);
    withOriginal.bringing().bring(ACME);
    await expect.element(withOriginal.notice).toHaveTextContent("show-amounts");
    await withOriginal.screen.unmount();

    const without = await open({}, 5);
    without.bringing().bring(ACME);
    await expect.element(without.notice).toHaveTextContent("amounts-elsewhere");
  });
});

describe("before a download", () => {
  it("with no name, or a company that is not on the list, there is nothing to say", async () => {
    const { bringing, form } = await open();
    const goOn = vi.fn<() => void>();
    expect(bringing().checkBeforeDownload(goOn)).toBe(false);
    form().update((state) => ({ ...state, empresa: "Otra" }));
    expect(bringing().checkBeforeDownload(goOn)).toBe(false);
  });

  it("looks for what was written on the list, and says it only once", async () => {
    const rows = [{ empresa: "NAFTA", cuits: [], config: "BAU", rubro: { opcion: 8 } }];
    const { bringing, form, notice } = await open({ companies: rows });
    form().update((state) => ({ ...state, empresa: " nafta " }));
    const goOn = vi.fn<() => void>();
    await vi.waitFor(() => {
      expect(bringing().checkBeforeDownload(goOn)).toBe(true);
    });
    await expect.element(notice).toHaveTextContent("category");
    bringing().close();
    await expect.element(notice).toHaveTextContent("ninguno");
    expect(bringing().checkBeforeDownload(goOn), "said already").toBe(false);
  });

  it("what was brought is what is looked at, while the name is the same", async () => {
    const rows = [{ empresa: "NAFTA", cuits: [], config: "BAU", rubro: { opcion: 8 } }];
    const { bringing, form, notice } = await open({ companies: rows });
    await vi.waitFor(() => {
      form().update((state) => ({ ...state, empresa: "NAFTA" }));
      expect(bringing().checkBeforeDownload(() => undefined)).toBe(true);
    });
    await expect.element(notice).toHaveTextContent("category");
  });
});

describe("going to the flyer it says", () => {
  it("to the one of its category", async () => {
    const { bringing, toast, workspace } = await open();
    bringing().goToWanted(8);
    await expect
      .element(toast)
      .toMatchTextContent(/Cambiado a Flyer Rubros · Combustible\. Revisá el cartel/);
    expect(workspace().getState().slot.option).toBe(8);
  });

  it("if it does not load it says nothing of having changed", async () => {
    const { bringing, toast } = await open({ droppedFiles: ["_active8.json"] });
    bringing().goToWanted(8);
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    await expect.element(toast).not.toMatchTextContent(/Cambiado/);
  });

  it("with no category, to Flyer Galicia", async () => {
    const { bringing, goToTab, toast } = await open();
    bringing().goToWanted(0);
    expect(goToTab).toHaveBeenCalledWith("flyer");
    await expect
      .element(toast)
      .toMatchTextContent(/Cambiado a Flyer Galicia\. Descargá de nuevo\./);
  });
});
