// Config → Legales: a tab per option, chips for the markers, paste with its bold, and saving the legal
// of that option for everybody, which the flyer editor hears.
import { createElement, useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { useFlyerChanges } from "@/shared/lib/flyer-changes/flyer-changes.ts";
import { FIRST_PLACE, rememberPlace } from "../model/panel.ts";
import { type BucketStore, bucketStore, openConfigSheet } from "../testing/config-cloud.ts";

const OPTIONS = {
  opts: [
    { n: 1, nombre: "Opción 1" },
    { n: 9, nombre: "Combustible" },
    { n: 14, nombre: "Campaña nueva" },
  ],
};

const sheet = () => page.getByTestId("admin-legal");
const tab = (name: string) => sheet().getByRole("tab", { name, exact: true });
const pane = () => sheet().getByRole("tabpanel");
const text = () => pane().getByTestId("legal-text");
const chip = (marker: string) => pane().getByRole("button", { name: marker, exact: true });
const notice = () => page.getByRole("status");

/** Puts the cursor (or selects) on the field, as the mouse would. */
function select(start: number, end = start): void {
  const area = text().element();
  if (!(area instanceof HTMLTextAreaElement)) throw new Error("No legal text");
  area.setSelectionRange(start, end);
}

const heard: number[] = [];

/** The flyer editor, as far as this sheet goes: it hears which option changed. */
function Editor() {
  const { listen } = useFlyerChanges();
  useEffect(
    () =>
      listen((option) => {
        heard.push(option);
      }),
    [listen],
  );
  return null;
}

function store(files: Record<string, unknown> = {}): BucketStore {
  return bucketStore({
    "_opciones.json": OPTIONS,
    "_legal.json": { text: "Legal uno." },
    "_legal9.json": { text: "Legal nueve." },
    ...files,
  });
}

async function open(files?: BucketStore) {
  return openConfigSheet("legales", "admin-legal", files ?? store(), {
    beside: createElement(Editor),
  });
}

/** What a file was written with, the last time. */
function lastWrite({ written }: BucketStore, file: string): unknown {
  return written.findLast((write) => write.file === file)?.content;
}

/** Pastes as it comes from a mail or a web: with its format. */
function paste(html: string): void {
  const data = new DataTransfer();
  data.setData("text/html", html);
  data.setData("text/plain", "plano");
  text()
    .element()
    .dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
}

afterEach(() => {
  rememberPlace(FIRST_PLACE);
  heard.length = 0;
});

describe("Config → Legales", () => {
  it("has a tab per option, each with its own legal and its chips", async () => {
    await open();
    expect(
      sheet()
        .getByRole("tab")
        .elements()
        .map((one) => one.textContent),
    ).toEqual(["Opción 1", "Combustible", "Campaña nueva"]);
    await expect.element(text()).toHaveValue("Legal uno.");
    await expect.element(text()).toHaveAttribute("placeholder", "Legal de Opción 1...");
    await tab("Combustible").click();
    await expect.element(text()).toHaveValue("Legal nueve.");
    await tab("Campaña nueva").click();
    await expect.element(text()).toHaveValue("");
    expect(
      pane()
        .getByTestId("legal-marker")
        .elements()
        .map((one) => one.textContent),
    ).toEqual([
      "{empresa}",
      "{eminentblack}",
      "{platinum}",
      "{plusgold}",
      "{plus}",
      "{importe}",
      "{importe2}",
      "{total}",
    ]);
    await expect
      .element(chip("{importe2}"))
      .toHaveAttribute("title", "el segundo tope (Flyer Rubros, cuadro «Ambos»)");
  });

  it("a chip goes in the legal of that option: the first at the end, the next where the cursor is", async () => {
    await open();
    await tab("Combustible").click();
    await text().click();
    select(0);
    await chip("{plusgold}").click();
    await expect.element(text()).toHaveValue("Legal nueve.{plusgold}");
    await expect
      .element(notice())
      .toHaveTextContent("Pegé {plusgold} — se reemplaza solo al armar el flyer");
    await expect.element(text()).toHaveFocus();
    expect(text().element()).toHaveProperty("selectionStart", "Legal nueve.{plusgold}".length);

    await text().click();
    select(6);
    await userEvent.keyboard("{ArrowLeft}{ArrowRight}");
    await chip("{importe}").click();
    await expect.element(text()).toHaveValue("Legal {importe}nueve.{plusgold}");

    await tab("Opción 1").click();
    await expect.element(text()).toHaveValue("Legal uno.");
    await tab("Combustible").click();
    await expect.element(text(), { timeout: 2000 }).toHaveValue("Legal {importe}nueve.{plusgold}");
  });

  it("is saved in the file of its option only, and the editor hears it", async () => {
    const files = store();
    await open(files);
    await tab("Combustible").click();
    await text().fill("Nuevo **legal** {importe} $' y $&.");
    await pane().getByRole("button", { name: "Guardar y aplicar a todos" }).click();

    await expect
      .element(pane())
      .toMatchTextContent(/✅ Guardado\. Se aplica a Combustible para todos los usuarios\./);
    await expect.element(notice()).toHaveTextContent("Legal de Combustible actualizado");
    expect(lastWrite(files, "_legal9.json")).toMatchObject({
      text: "Nuevo **legal** {importe} $' y $&.",
    });
    expect(lastWrite(files, "_legal9.json")).toHaveProperty("updated_at");
    expect(files.written.map(({ file }) => file)).toEqual(["_legal9.json"]);
    expect(heard).toEqual([9]);
  });

  it("the first option writes the file without number; a new one, the one with its number (invariant 21)", async () => {
    const files = store();
    await open(files);
    await text().fill("Uno.");
    await pane().getByRole("button", { name: "Guardar y aplicar a todos" }).click();
    await expect.element(notice()).toHaveTextContent("Legal de Opción 1 actualizado");
    await tab("Campaña nueva").click();
    await text().fill("Catorce.");
    await pane().getByRole("button", { name: "Guardar y aplicar a todos" }).click();
    await expect.element(notice()).toHaveTextContent("Legal de Campaña nueva actualizado");
    expect(files.written.map(({ file }) => file)).toEqual(["_legal.json", "_legal14.json"]);
    expect(lastWrite(files, "_legal14.json")).toMatchObject({ text: "Catorce." });
    expect(heard).toEqual([1, 14]);
  });

  it("pasting keeps the bold of the source, as text, and nothing of it runs (invariant 12)", async () => {
    await open();
    await text().click();
    select(6, 9);
    paste(
      '<p>dos <b>tres</b><img src="x" onerror="window.pegado=1"></p><script>window.pegado=2</script>',
    );
    // What a script said stays as text, as today: it is never run.
    await expect.element(text()).toHaveValue("Legal dos **tres**\nwindow.pegado=2.");
    expect(Reflect.get(window, "pegado")).toBeUndefined();
    expect(text().element()).toHaveProperty(
      "selectionStart",
      "Legal dos **tres**\nwindow.pegado=2".length,
    );
  });

  it("a common paste, without format, is the one of the browser", async () => {
    await open();
    await text().click();
    const data = new DataTransfer();
    data.setData("text/plain", "plano");
    const event = new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    text().element().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("Recargar brings what is saved, and what is typed stays on its tab until then", async () => {
    await open();
    await text().fill("Cambiado");
    await tab("Combustible").click();
    await tab("Opción 1").click();
    await expect.element(text()).toHaveValue("Cambiado");
    await pane().getByRole("button", { name: "Recargar" }).click();
    await expect.element(text()).toHaveValue("Legal uno.");
  });

  it("a legal that could not be read is not an empty one, and nothing is saved over it (invariant 24)", async () => {
    const files = store();
    files.dropped.add("_legal9.json");
    await open(files);
    await expect.element(text()).toHaveValue("Legal uno.");
    await tab("Combustible").click();
    await expect
      .element(pane())
      .toMatchTextContent(/No se pudo leer el legal de Combustible: sin conexión\./);
    expect(pane().getByTestId("legal-text").elements()).toHaveLength(0);
    expect(
      pane().getByRole("button", { name: "Guardar y aplicar a todos" }).elements(),
    ).toHaveLength(0);

    files.dropped.delete("_legal9.json");
    await pane().getByRole("button", { name: "Reintentar" }).click();
    await expect.element(text()).toHaveValue("Legal nueve.");
    expect(files.written).toEqual([]);
  });

  it("what the server refuses is said on the tab, and what was typed stays", async () => {
    const files = store();
    files.refused.set("_legal.json", "sin permiso");
    await open(files);
    await text().fill("No va");
    await pane().getByRole("button", { name: "Guardar y aplicar a todos" }).click();
    await expect.element(pane().getByRole("alert")).toHaveTextContent("Error: sin permiso");
    await expect.element(text()).toHaveValue("No va");
    expect(heard).toEqual([]);
  });

  it("without the list of options there are no tabs to save on (invariant 24)", async () => {
    const files = store();
    files.dropped.add("_opciones.json");
    await open(files);
    await expect
      .element(sheet())
      .toMatchTextContent(/No se pudo leer la lista de opciones: sin conexión\./);
    expect(sheet().getByRole("tab").elements()).toHaveLength(0);
    files.dropped.delete("_opciones.json");
    await sheet().getByRole("button", { name: "Reintentar" }).click();
    await expect.element(tab("Combustible")).toBeVisible();
  });
});
