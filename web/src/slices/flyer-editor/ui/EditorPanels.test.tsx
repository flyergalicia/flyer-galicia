import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { openWithForm } from "../testing/form-on-screen.tsx";
import { EditorPanels, type EditorTab } from "./EditorPanels.tsx";

const NOTHING = () => undefined;

function Panels({ onRestore }: { readonly onRestore: () => void }) {
  const [tab, setTab] = useState<EditorTab>("individual");
  const individual = useRef<HTMLDivElement>(null);
  return (
    <EditorPanels
      isCategoryTab={false}
      busy={false}
      sharing={false}
      canShare={false}
      tab={tab}
      onTab={setTab}
      individual={individual}
      draftOffer={null}
      bulkPanel={null}
      onChooseCompany={NOTHING}
      onOpenDatabase={NOTHING}
      onPreview={NOTHING}
      onDownload={NOTHING}
      onShare={NOTHING}
      onRestore={onRestore}
      onLoadFromHistory={NOTHING}
      onDownloadFromHistory={NOTHING}
    />
  );
}

describe("the panels of the editor", () => {
  it("Individual has the whole form, and it stays alive while another one is shown", async () => {
    const onRestore = vi.fn<() => void>();
    const { screen, form } = await openWithForm(<Panels onRestore={onRestore} />);
    const company = screen.getByPlaceholder("Nombre de la empresa");
    await company.fill("ACME");
    await expect.element(screen.getByText("Oficiales", { exact: false })).toBeInTheDocument();
    await expect.element(screen.getByText("Configuración de Montos")).toBeInTheDocument();
    await expect.element(screen.getByText("Texto Legal")).toBeInTheDocument();
    await expect.element(screen.getByText("Nombre del archivo")).toBeInTheDocument();
    await screen.getByRole("button", { name: "Restaurar" }).click();
    expect(onRestore).toHaveBeenCalledTimes(1);

    await screen.getByRole("tab", { name: "Masivo" }).click();
    await expect.element(company).not.toBeVisible();
    await screen.getByRole("tab", { name: "Historial" }).click();
    await expect.element(company).not.toBeVisible();
    await screen.getByRole("tab", { name: "Individual" }).click();
    await expect.element(company).toBeVisible();
    expect(form().getState().empresa).toBe("ACME");
  });

  it("with nothing in the history it says how to get something there, and takes you", async () => {
    const { screen } = await openWithForm(<Panels onRestore={NOTHING} />);
    await screen.getByRole("tab", { name: "Historial" }).click();
    await expect.element(screen.getByText("Todavía no hay flyers en tu historial")).toBeVisible();
    await screen.getByRole("button", { name: "Ir a Individual" }).click();
    await expect.element(screen.getByPlaceholder("Nombre de la empresa")).toBeVisible();
  });
});
