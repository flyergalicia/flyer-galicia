import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { sanitizeCompanies } from "@/shared/domain/company-registry/index.ts";
import { FlyerWorkspaceProvider } from "@/shared/lib/flyer-workspace/index.ts";
import { ADVISOR, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import type { CompanyNotice } from "../model/use-company-bringing.ts";
import { CompanyNotices } from "./CompanyNotices.tsx";

function company(empresa: string, rubro: Record<string, unknown> = {}) {
  const [clean] = sanitizeCompanies([{ empresa: empresa || "x", cuits: [], config: "BAU", rubro }]);
  if (!clean) throw new Error("It has no name");
  return { ...clean, empresa };
}

const HOSTILE = '<img src=x onerror="window.__hostile=1">Malo';

const OPTIONS = {
  opts: [
    { n: 1, nombre: "Flyer", solapa: "flyer" },
    { n: 8, nombre: "Combustible", solapa: "rubros", rubro: "combustible" },
  ],
};

async function open(notice: CompanyNotice | null, isCropped = false) {
  const onClose = vi.fn<() => void>();
  const onGoToWanted = vi.fn<(option: number) => void>();
  const onShowAmounts = vi.fn<(original: number, name: string) => void>();
  const harness = createAppHarness({
    profile: ADVISOR,
    files: { "_opciones.json": OPTIONS },
  });
  const screen = await render(
    harness.wrap(
      <FlyerWorkspaceProvider>
        <CompanyNotices
          notice={notice}
          isCropped={isCropped}
          onClose={onClose}
          onGoToWanted={onGoToWanted}
          onShowAmounts={onShowAmounts}
        />
      </FlyerWorkspaceProvider>,
    ),
  );
  return { screen, onClose, onGoToWanted, onShowAmounts };
}

describe("what is said on bringing a company", () => {
  it("nothing when there is nothing to say", async () => {
    await open(null);
    expect(page.getByRole("dialog").query()).toBeNull();
  });

  it("the flyer of its category: stay or go", async () => {
    const { onClose, onGoToWanted } = await open({
      kind: "category",
      company: company("ACME", { opcion: 8 }),
      warning: { wanted: 8, signature: "s" },
      goOn: null,
    });
    await expect.element(page.getByText("📋 Beneficio por rubro")).toBeInTheDocument();
    await expect.element(page.getByRole("dialog")).toMatchTextContent(/ACME tiene cargado/);
    await page.getByRole("button", { name: "Seguir acá" }).click();
    expect(onClose).toHaveBeenCalled();
    await page.getByRole("button", { name: "Ir a Combustible" }).click();
    expect(onGoToWanted).toHaveBeenCalledWith(8);
  });

  it("on a download, staying goes on with it", async () => {
    const goOn = vi.fn<() => void>();
    const { onClose } = await open({
      kind: "category",
      company: company("", { opcion: 8 }),
      warning: { wanted: 8, signature: "s" },
      goOn,
    });
    await expect.element(page.getByRole("dialog")).toMatchTextContent(/Esta empresa tiene cargado/);
    await page.getByRole("button", { name: "Descargar igual" }).click();
    expect(goOn).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("no category on Rubros: it offers Flyer Galicia", async () => {
    const { onGoToWanted } = await open({
      kind: "category",
      company: company("ACME"),
      warning: { wanted: 0, signature: "s" },
      goOn: null,
    });
    await expect.element(page.getByText("📋 Sin beneficio por rubro")).toBeInTheDocument();
    await page.getByRole("button", { name: "Ir a Flyer Galicia" }).click();
    expect(onGoToWanted).toHaveBeenCalledWith(0);
  });

  it.each<CompanyNotice>([
    {
      kind: "category",
      company: company(HOSTILE, { opcion: 8 }),
      warning: { wanted: 8, signature: "s" },
      goOn: null,
    },
    { kind: "amounts-elsewhere", company: company(HOSTILE) },
    { kind: "show-amounts", company: company(HOSTILE), original: 8, after: () => undefined },
  ])("a name written by someone else is shown as text: $kind", async (notice) => {
    const { screen } = await open(notice);
    await expect.element(screen.getByText(HOSTILE, { exact: false }).first()).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it("no valid cashback", async () => {
    const { onClose } = await open({ kind: "no-cashback", company: company("ACME") });
    await expect.element(page.getByRole("dialog")).toMatchTextContent(/ACME/);
    await page.getByRole("button", { name: "Entendido" }).click();
    expect(onClose).toHaveBeenCalled();
  });

  it("with cashback, and this flyer has no amounts and nothing to go back to", async () => {
    const { onClose } = await open({ kind: "amounts-elsewhere", company: company("ACME") });
    await expect.element(page.getByRole("dialog")).toMatchTextContent(/ACME tiene cashback/);
    await page.getByRole("button", { name: "Entendido" }).click();
    expect(onClose).toHaveBeenCalled();
  });

  it("with no name either", async () => {
    await open({ kind: "amounts-elsewhere", company: company("") });
    await expect
      .element(page.getByRole("dialog"))
      .toMatchTextContent(/Esta empresa tiene cashback/);
  });

  it("show the amounts or follow as it is; and then what was pending", async () => {
    const after = vi.fn<() => void>();
    const notice = {
      kind: "show-amounts",
      company: company("ACME"),
      original: 8,
      after,
    } as const;
    const { onClose, onShowAmounts } = await open(notice, true);
    await expect
      .element(page.getByRole("alertdialog"))
      .toMatchTextContent(/\(se quitó esa parte\)/);
    await page.getByRole("button", { name: "Mostrar los importes" }).click();
    expect(onShowAmounts).toHaveBeenCalledWith(8, "ACME");
    expect(onClose).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(after).toHaveBeenCalledTimes(1);
    });

    await page.getByRole("button", { name: "Seguir así" }).click();
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onShowAmounts).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(after).toHaveBeenCalledTimes(2);
    });
  });

  it("not cropped and with no name", async () => {
    await open({ kind: "show-amounts", company: company(""), original: 8, after: () => undefined });
    await expect
      .element(page.getByRole("alertdialog"))
      .toMatchTextContent(/Esta empresa tiene cashback, pero este flyer no muestra importes\./);
  });
});
