// A design of Estudio reaches the flyer editor from another screen.
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { workspaceOnScreen } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import {
  type PromotionPicker,
  PromotionPickerContext,
} from "@/shared/lib/promotions/promotion-picking.ts";
import {
  DesignDeskAttachContext,
  type DesignDeskWorks,
  type StoredDesign,
} from "@/shared/lib/studio/design-desk.ts";
import { ADVISOR, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { EditorStage } from "../testing/EditorStage.tsx";
import { flyerFiles, flyerShown } from "../testing/editor-on-screen.tsx";

const NO_PICKER: PromotionPicker = {
  pickOneBrand: () => undefined,
  pickManyBrands: () => undefined,
  stopPicking: () => undefined,
};

function aDesign(fields: Partial<StoredDesign> = {}): StoredDesign {
  return {
    id: "d",
    name: "Mi diseño",
    company: "",
    option: 9,
    mine: true,
    status: "privado",
    shared: false,
    baseName: "",
    changes: [],
    uploads: {},
    cuts: [],
    legal: null,
    ...fields,
  };
}

function Stage({
  tabId,
  held,
  goToTab,
}: {
  readonly tabId: string;
  readonly held: { works: DesignDeskWorks | null };
  readonly goToTab: (tabId: string) => void;
}) {
  const [attach] = useState(() => (works: DesignDeskWorks) => {
    held.works = works;
    return () => {
      held.works = null;
    };
  });
  return (
    <DesignDeskAttachContext.Provider value={attach}>
      <PromotionPickerContext.Provider value={NO_PICKER}>
        <EditorStage tabId={tabId} isActive goToTab={goToTab} />
      </PromotionPickerContext.Provider>
    </DesignDeskAttachContext.Provider>
  );
}

async function open(tabId = "flyer", permissions: Readonly<Record<string, boolean>> = {}) {
  const files = flyerFiles();
  const harness = createAppHarness({
    profile: ADVISOR,
    files: {
      ...files,
      "_active6.json": files["_active9.json"],
      "_facultades.json": {
        roles: { asesor: { opcion_1: false, opcion_9: true, ...permissions } },
      },
    },
    tables: {
      promos_galicia_cache: () => jsonResponse([]),
      promos_modo_cache: () => jsonResponse([]),
    },
  });
  harness.storeSession();
  const held: { works: DesignDeskWorks | null } = { works: null };
  const goToTab = vi.fn<(tabId: string) => void>();
  const view = (id: string) => harness.wrap(<Stage tabId={id} held={held} goToTab={goToTab} />);
  const screen = await render(view(tabId));
  await flyerShown();
  const works = (): DesignDeskWorks => {
    if (!held.works) throw new Error("The editor did not attach");
    return held.works;
  };
  return { works, goToTab, show: (id: string) => screen.rerender(view(id)) };
}

const company = () => page.getByLabelText("Nombre de la empresa", { exact: true });
const option = () => workspaceOnScreen().getState().slot.option;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("a design opened from Estudio", () => {
  it("goes to the tab of its flyer, opens beside it and brings its company to an empty form", async () => {
    const { works, goToTab } = await open();
    await works().openDesign(() =>
      Promise.resolve(aDesign({ company: "ACME", legal: "Su legal" })),
    );
    expect(goToTab).toHaveBeenCalledWith("flyer");
    await expect.element(page.getByTestId("open-work")).toMatchTextContent("Mi diseño");
    await expect.element(company()).toHaveValue("ACME");
  });

  it("does not step on a company that was already written", async () => {
    const { works } = await open();
    await company().fill("La mía");
    await works().openDesign(() => Promise.resolve(aDesign({ company: "ACME" })));
    await expect.element(page.getByTestId("open-work")).toBeVisible();
    await expect.element(company()).toHaveValue("La mía");
  });

  it("a copy stays on its flyer even if the profile does not have it, and leaves on closing it", async () => {
    const { works } = await open("flyer", { opcion_6: false });
    await works().openDesign(() =>
      Promise.resolve(aDesign({ id: "copy", option: 6, shared: true })),
    );
    await vi.waitFor(() => {
      expect(option()).toBe(6);
      expect(workspaceOnScreen().getState().slot.loading).toBe(false);
    });
    await expect.element(page.getByTestId("open-work")).toBeVisible();
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
    expect(option()).toBe(6);
    works().closeDesign("copy");
    await vi.waitFor(() => {
      expect(option()).toBe(9);
    });
    await expect.element(page.getByTestId("open-work")).not.toBeInTheDocument();
  });

  it("choosing another tab leaves the copy", async () => {
    const { works, show } = await open("flyer", { opcion_6: false, opcion_8: true });
    await works().openDesign(() =>
      Promise.resolve(aDesign({ id: "copy", option: 6, shared: true })),
    );
    await vi.waitFor(() => {
      expect(option()).toBe(6);
    });
    await show("rubros");
    await vi.waitFor(() => {
      expect(option()).toBe(8);
    });
  });

  it("without being a copy it does not stay on a flyer this person does not have", async () => {
    const { works } = await open("flyer", { opcion_6: false });
    await works().openDesign(() => Promise.resolve(aDesign({ id: "not", option: 6 })));
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
    expect(option()).toBe(9);
  });
});

describe("the way to Estudio", () => {
  it("Insertar with no flyers to copy leads there", async () => {
    const { goToTab } = await open("flyer", { estudio: true });
    await page.getByRole("button", { name: "Cambiar logos" }).click();
    await page.getByRole("button", { name: "Insertar", exact: true }).click();
    await page.getByRole("button", { name: "Ir a Estudio" }).click();
    expect(goToTab).toHaveBeenCalledWith("estudio");
    await new Promise((resolve) => {
      setTimeout(resolve, 450);
    });
  });
});

describe("what else Estudio asks of the editor", () => {
  it("goes to the flyer that was published", async () => {
    const { works, goToTab } = await open("flyer", { opcion_6: true });
    await works().showFlyer(6);
    expect(goToTab).toHaveBeenCalledWith("flyer");
    await vi.waitFor(() => {
      expect(option()).toBe(6);
    });
  });

  it("applies a saved set on the flyer on screen", async () => {
    const { works, goToTab } = await open();
    await works().applySavedSet("s");
    expect(goToTab).toHaveBeenCalledWith("flyer");
  });
});
