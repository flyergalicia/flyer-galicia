// Config → Opciones: the list of flyers, adding one, what replaces what, its category, taking one out,
// and saving the whole list for everybody: as today, without what replaces what, the category or the
// version without cashback of the rows not touched (an error of the old version, ported as it is).
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { FLYER_OPTIONS_QUERY_KEY } from "@/shared/lib/app-config/flyer-options-query.ts";
import { FIRST_PLACE, rememberPlace } from "../model/panel.ts";
import { type BucketStore, bucketStore, openConfigSheet } from "../testing/config-cloud.ts";

const ACTIVE = { name: "flyer_1_op9.jpg", imageUrl: "https://cubo/flyers/flyer_1_op9.jpg?v=1" };

const sheet = () => page.getByTestId("admin-options");
const rows = () => sheet().getByTestId("option-row");
function row(option: number) {
  const found = rows()
    .elements()
    .find((one) => one.getAttribute("data-n") === String(option));
  if (!found) throw new Error(`No row of option ${String(option)}`);
  return page.elementLocator(found);
}
const save = () => sheet().getByRole("button", { name: "Guardar cambios" });
const notice = () => page.getByRole("status");

function store(files: Record<string, unknown> = {}): BucketStore {
  return bucketStore({
    "_active.json": { name: "", imageUrl: null },
    "_active9.json": ACTIVE,
    "_active8.json": { name: "flyer_2_op8.jpg", imageUrl: "https://cubo/flyers/flyer_2_op8.jpg" },
    "_active11.json": { name: "", imageUrl: null },
    ...files,
  });
}

function optionsWritten({ written }: BucketStore): Record<string, unknown>[] {
  const content = written.findLast(({ file }) => file === "_opciones.json")?.content;
  const opts: unknown = typeof content === "object" && content ? Reflect.get(content, "opts") : [];
  return Array.isArray(opts) ? opts : [];
}

function selectedText(select: Element | undefined): string {
  return select instanceof HTMLSelectElement
    ? (select.options[select.selectedIndex]?.text ?? "")
    : "";
}

afterEach(() => {
  rememberPlace(FIRST_PLACE);
});

describe("Config → Opciones", () => {
  it("shows each one with its number, name, tab, category, what it replaces (none, as today) and its flyer", async () => {
    await openConfigSheet("opciones", "admin-options", store());
    await expect.poll(() => rows().elements().length).toBe(5);
    expect(
      rows()
        .elements()
        .map((one) => one.getAttribute("data-n")),
    ).toEqual(["1", "8", "9", "11", "12"]);
    await expect.element(row(1).getByLabelText("Solapa")).toBeDisabled();
    await expect.element(row(1)).toMatchTextContent(/La de todos los asesores/);
    expect(row(1).getByLabelText("Reemplaza a").elements()).toHaveLength(0);
    expect(row(1).getByRole("button", { name: "Quitar" }).elements()).toHaveLength(0);
    expect(row(9).getByLabelText("Rubro").elements()).toHaveLength(0);
    expect(selectedText(row(11).getByLabelText("Reemplaza a").element())).toBe(
      "No reemplaza a ninguno",
    );
    expect(selectedText(row(11).getByLabelText("Rubro").element())).toBe(
      "Rubro: según el nombre (Combustible)",
    );
    expect(selectedText(row(8).getByLabelText("Rubro").element())).toBe(
      "Rubro: según el nombre (Combustible)",
    );
    expect(
      Array.from(
        row(8).getByLabelText("Reemplaza a").element().querySelectorAll("option"),
        (one) => one.textContent,
      ),
    ).toEqual(["No reemplaza a ninguno", "Reemplaza a: Combustible 2026"]);
    await expect.element(row(11).getByTestId("option-current")).toHaveTextContent("VIGENTE");
    expect(row(8).getByTestId("option-current").elements()).toHaveLength(0);
    await expect
      .element(row(9).getByTestId("option-status"))
      .toHaveTextContent("Flyer activo: flyer_1_op9.jpg");
    await expect
      .element(row(11).getByTestId("option-status"))
      .toHaveTextContent("Sin flyer activo todavía (se sube desde Config → Flyer).");
    await expect.element(row(9).getByLabelText("Color")).toHaveValue("#1d4070");
  });

  it("a new one takes the next number with its name to write; saving, as today, takes out what the others replace", async () => {
    const files = store();
    const { harness } = await openConfigSheet("opciones", "admin-options", files);
    await sheet().getByRole("button", { name: "+ Agregar opción" }).click();
    const name = row(13).getByLabelText("Nombre de la opción");
    await expect.element(name).toHaveFocus();
    await expect.element(name).toHaveValue("Opción 13");
    expect(name.element()).toHaveProperty("selectionEnd", "Opción 13".length);
    await expect
      .element(row(13).getByTestId("option-status"))
      .toHaveTextContent("Sin flyer activo todavía (se sube desde Config → Flyer).");
    await name.fill("Campaña nueva");
    await row(13).getByLabelText("Solapa").selectOptions("rubros");
    await row(13).getByLabelText("Rubro").selectOptions("supermercado");
    await row(13).getByLabelText("Reemplaza a").selectOptions("Reemplaza a: Combustible 2025");
    await save().click();

    await expect
      .element(notice())
      .toHaveTextContent(
        "Opciones guardadas. Para que un perfil vea la nueva, habilitala en Admin → Facultades.",
      );
    const saved = optionsWritten(files);
    expect(saved.map(({ n }) => n)).toEqual([1, 8, 9, 11, 12, 13]);
    expect(saved.find(({ n }) => n === 13)).toMatchObject({
      nombre: "Campaña nueva",
      solapa: "rubros",
      rubro: "supermercado",
      reemplaza: 8,
      color: "#c2185b",
      orden: 5,
    });
    expect(saved.find(({ n }) => n === 11)).toMatchObject({ reemplaza: 0 });
    expect(saved.find(({ n }) => n === 8)).toMatchObject({ rubro: "" });
    expect(saved.find(({ n }) => n === 12)).not.toHaveProperty("sinCB");
    expect(harness.queryClient.getQueryData(FLYER_OPTIONS_QUERY_KEY)).toEqual(
      expect.arrayContaining([expect.objectContaining({ n: 13, nombre: "Campaña nueva" })]),
    );
    await expect.element(save()).toBeEnabled();
  });

  it("another tab leaves what it replaced; the current of the category follows what is saved", async () => {
    const files = store();
    await openConfigSheet("opciones", "admin-options", files);
    await row(11).getByLabelText("Reemplaza a").selectOptions("Reemplaza a: Combustible 2025");
    await expect.element(row(11).getByLabelText("Reemplaza a")).toHaveValue("8");
    await row(11).getByLabelText("Solapa").selectOptions("flyer");
    await expect.element(row(11).getByLabelText("Reemplaza a")).toHaveValue("0");
    expect(row(11).getByLabelText("Rubro").elements()).toHaveLength(0);
    // Its mark goes with the tab chosen, as today; the one that takes its place waits for the save.
    expect(row(11).getByTestId("option-current").elements()).toHaveLength(0);
    expect(row(8).getByTestId("option-current").elements()).toHaveLength(0);
    await save().click();
    await expect.element(notice()).toHaveTextContent("Opciones guardadas");
    expect(optionsWritten(files).find(({ n }) => n === 11)).toMatchObject({
      solapa: "flyer",
      reemplaza: 0,
    });
    expect(row(11).getByTestId("option-current").elements()).toHaveLength(0);
    await expect.element(row(8).getByTestId("option-current")).toBeVisible();
  });

  it("taking one out asks, says if it has a flyer today, and only the yes takes it out", async () => {
    const files = store();
    await openConfigSheet("opciones", "admin-options", files);
    await expect
      .element(row(9).getByTestId("option-status"))
      .toHaveTextContent("Flyer activo: flyer_1_op9.jpg");
    await row(9).getByRole("button", { name: "Quitar" }).click();
    const question = page.getByRole("alertdialog");
    await expect.element(question).toMatchTextContent(/¿Quitar "Combustible"\?/);
    await expect
      .element(question)
      .toMatchTextContent(
        /mismo número \(9\)\.\s*Ojo: hoy tiene un flyer activo \(flyer_1_op9\.jpg\)\./,
      );
    await question.getByRole("button", { name: "Cancelar" }).click();
    expect(rows().elements()).toHaveLength(5);

    await row(9).getByRole("button", { name: "Quitar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Quitar" }).click();
    await expect.poll(() => rows().elements().length).toBe(4);
    expect(files.written).toEqual([]);
    await save().click();
    await expect.element(notice()).toHaveTextContent("Opciones guardadas");
    const saved = optionsWritten(files);
    expect(saved.map(({ n }) => n)).toEqual([1, 8, 11, 12]);
    // The version without cashback of a flyer that is gone points at nothing.
    expect(saved.find(({ n }) => n === 12)).not.toHaveProperty("sinCB");
  });

  it("Recargar forgets what was not saved", async () => {
    await openConfigSheet("opciones", "admin-options", store());
    await row(9).getByLabelText("Nombre de la opción").fill("Cambiado");
    await sheet().getByRole("button", { name: "Recargar" }).click();
    await expect.element(row(9).getByLabelText("Nombre de la opción")).toHaveValue("Combustible");
  });

  it("a list that could not be read is not the three of always, and nothing is saved over it (invariant 24)", async () => {
    const files = store();
    files.dropped.add("_opciones.json");
    await openConfigSheet("opciones", "admin-options", files);
    await expect
      .element(sheet())
      .toMatchTextContent(/No se pudo leer la lista de opciones: sin conexión\./);
    expect(rows().elements()).toHaveLength(0);
    await expect.element(save()).toBeDisabled();
    await expect.element(sheet().getByRole("button", { name: "+ Agregar opción" })).toBeDisabled();
    files.dropped.delete("_opciones.json");
    await sheet().getByRole("button", { name: "Reintentar" }).click();
    await expect.poll(() => rows().elements().length).toBe(5);
    expect(files.written).toEqual([]);
  });

  it("a flyer that could not be read says nothing of it: it is never «sin flyer» (invariant 24)", async () => {
    const files = store();
    files.dropped.add("_active9.json");
    await openConfigSheet("opciones", "admin-options", files);
    await expect.poll(() => rows().elements().length).toBe(5);
    await expect.element(row(9).getByTestId("option-status")).toHaveTextContent("");
    await expect.element(row(11).getByTestId("option-status")).toHaveTextContent("");
  });

  it("what the server refuses is said, and what was edited stays", async () => {
    const files = store();
    files.refused.set("_opciones.json", "sin permiso");
    await openConfigSheet("opciones", "admin-options", files);
    await row(9).getByLabelText("Nombre de la opción").fill("Otro nombre");
    await save().click();
    await expect.element(notice()).toHaveTextContent("Error al guardar las opciones: sin permiso");
    await expect.element(row(9).getByLabelText("Nombre de la opción")).toHaveValue("Otro nombre");
  });

  it("the name and the color change as they are typed", async () => {
    const { harness } = await openConfigSheet("opciones", "admin-options", store(), {
      beside: createElement("span"),
    });
    await row(8).getByLabelText("Color").fill("#00ff00");
    await expect.element(row(8).getByText("8", { exact: true })).toHaveStyle({
      backgroundColor: "rgb(0, 255, 0)",
    });
    await row(8).getByLabelText("Nombre de la opción").fill("Nafta 2025");
    expect(
      Array.from(
        row(11).getByLabelText("Reemplaza a").element().querySelectorAll("option"),
        (one) => one.textContent,
      ),
    ).toContain("Reemplaza a: Nafta 2025");
    expect(harness.queryClient.getQueryData(FLYER_OPTIONS_QUERY_KEY)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ nombre: "Nafta 2025" })]),
    );
  });
});
