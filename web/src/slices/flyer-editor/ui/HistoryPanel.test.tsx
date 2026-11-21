import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { workspaceOnScreen } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { INVENTED_USER } from "@/shared/supabase/testing/recording-fetch.ts";
import type { HistoryItem } from "../model/stored-flyer.ts";
import { openWithForm } from "../testing/form-on-screen.tsx";
import { HistoryPanel } from "./HistoryPanel.tsx";

const OPTIONS = { opts: [{ n: 9, nombre: "Combustible", solapa: "flyer", color: "#ff0000" }] };

function item(company: string, others: Partial<HistoryItem> = {}): HistoryItem {
  return {
    v: { empresa: company },
    fn: `Flyer ${company}`,
    thumb: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    hora: "9:05",
    ts: 0,
    ac: 0,
    opt: 9,
    ...others,
  };
}

async function open(items: readonly HistoryItem[]) {
  localStorage.setItem(`fg_hist_${INVENTED_USER.id}`, JSON.stringify(items));
  const onLoad = vi.fn<(item: HistoryItem) => void>();
  const onDownload = vi.fn<(item: HistoryItem) => void>();
  const onBackToForm = vi.fn<() => void>();
  const opened = await openWithForm(
    <HistoryPanel onLoad={onLoad} onDownload={onDownload} onBackToForm={onBackToForm} />,
    {
      faculties: { guardar_trabajo: true },
      files: { "_opciones.json": OPTIONS },
    },
  );
  return { ...opened, onLoad, onDownload, onBackToForm };
}

const rows = () => page.getByTestId("history-row");

beforeEach(() => {
  localStorage.clear();
});

describe("the history", () => {
  it("with nothing, it says how to get something there", async () => {
    const { onBackToForm } = await open([]);
    await page.getByRole("button", { name: "Ir a Individual" }).click();
    expect(onBackToForm).toHaveBeenCalledOnce();
  });

  it("each flyer says what it is and on which flyer it was made", async () => {
    await open([item("ACME SA")]);
    await expect.element(rows()).toMatchTextContent(/ACME SA/);
    await expect.element(rows()).toMatchTextContent(/Flyer ACME SA · 9:05/);
    await expect.element(rows().getByTitle("Combustible")).toHaveTextContent("OP.9");
  });

  it("a name written by someone else is shown as text", async () => {
    const hostile = '<img src=x onerror="window.__hostile=1">';
    await open([item(hostile)]);
    await expect.element(rows()).toMatchTextContent(/onerror/);
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it("the row and Editar load it, and PDF comes down", async () => {
    const { onLoad, onDownload } = await open([item("ACME SA")]);
    await rows().getByRole("button", { name: "Cargar ACME SA" }).click();
    expect(onLoad).toHaveBeenCalledTimes(1);
    await rows()
      .getByRole("button", { name: /Editar/ })
      .click();
    expect(onLoad).toHaveBeenCalledTimes(2);
    await rows().getByRole("button", { name: /PDF/ }).click();
    expect(onDownload).toHaveBeenCalledOnce();
    expect(onLoad, "the buttons are not the row").toHaveBeenCalledTimes(2);
  });

  it("one can be taken out, and what the browser keeps goes with it", async () => {
    await open([item("UNO", { ts: 2 }), item("DOS", { ts: 1 })]);
    await rows().first().getByRole("button", { name: "Quitar UNO del historial" }).click();
    await expect.element(rows()).toMatchTextContent(/DOS/);
    expect(localStorage.getItem(`fg_hist_${INVENTED_USER.id}`)).not.toContain("UNO");
  });

  it("a flyer with no company is called by its file", async () => {
    await open([{ ...item(""), fn: "Flyer" }]);
    await expect.element(rows().getByRole("button", { name: "Cargar Flyer" })).toBeInTheDocument();
    await expect
      .element(rows().getByRole("button", { name: "Quitar Flyer del historial" }))
      .toBeInTheDocument();
  });

  it("an old flyer with no flyer number goes with the first one", async () => {
    await open([{ ...item("VIEJA"), opt: 0 }]);
    await expect.element(rows()).toMatchTextContent(/OP\.1/);
  });
});

describe("a logo uploaded from the PC that is gone", () => {
  const LOGO = { x: 1, y: 1, w: 1, h: 1, bg: "", img: "pc:1:toledo.png" };
  const OTHER = { x: 2, y: 2, w: 1, h: 1, bg: "", img: "pc:2:" };

  it("asks first, and Cancelar comes down nothing", async () => {
    const { onDownload } = await open([item("A", { v: { empresa: "A", logos: [LOGO] } })]);
    await rows().getByRole("button", { name: /PDF/ }).click();
    const question = page.getByRole("alertdialog");
    await expect.element(question).toMatchTextContent(/Falta un logo subido de la PC/);
    await expect.element(question).toMatchTextContent(/el logo «toledo\.png» subido de la PC/);
    await question.getByRole("button", { name: "Cancelar" }).click();
    expect(onDownload).not.toHaveBeenCalled();
    await expect.element(question).not.toBeInTheDocument();
  });

  it("with Descargar igual it comes down, and it counts them if there are several", async () => {
    const { onDownload } = await open([item("A", { v: { empresa: "A", logos: [LOGO, OTHER] } })]);
    await rows().getByRole("button", { name: /PDF/ }).click();
    const question = page.getByRole("alertdialog");
    await expect.element(question).toMatchTextContent(/Faltan 2 logos subidos de la PC/);
    await expect.element(question).toMatchTextContent(/2 logos subidos de la PC/);
    await question.getByRole("button", { name: "Descargar igual" }).click();
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it("if it is in memory it does not ask", async () => {
    const { onDownload } = await open([item("A", { v: { empresa: "A", logos: [LOGO] } })]);
    workspaceOnScreen().logos.put(LOGO.img, document.createElement("canvas"));
    await rows().getByRole("button", { name: /PDF/ }).click();
    expect(onDownload).toHaveBeenCalledOnce();
    expect(page.getByRole("alertdialog").query()).toBeNull();
  });
});
