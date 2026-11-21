// Config → Cashback: the amounts of each configuration, edited in the panel and saved for everybody.
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { CASHBACK_QUERY_KEY, useCashbackConfigs } from "@/shared/lib/app-config/cashback-query.ts";
import { FIRST_PLACE, rememberPlace } from "../model/panel.ts";
import { bucketStore, openConfigSheet } from "../testing/config-cloud.ts";

const FILE = {
  configs: [
    { nombre: "BAU", m1: "$250.000", m2: "$180.000", m3: "$80.000", m4: "$30.000" },
    { nombre: "Config 1", m1: "$350.000", m2: "$200.000", m3: "$80.000", m4: "$30.000" },
  ],
};

const sheet = () => page.getByTestId("admin-cashback");
const cards = () => sheet().getByTestId("cashback-config");
const card = (index: number) => cards().nth(index);
const amount = (index: number, number: number) =>
  card(index).getByLabelText(`Monto ${String(number)}`, { exact: true });
const save = () => sheet().getByRole("button", { name: "Guardar cambios" });
const notice = () => page.getByRole("status");

/** What the editor of flyers reads: the configurations everybody has. */
function EditorAmounts() {
  const { configs } = useCashbackConfigs();
  return createElement(
    "p",
    { "data-testid": "editor-amounts" },
    configs.map(({ m1 }) => m1).join(" "),
  );
}

async function open(files: Record<string, unknown> = { "_cashback.json": FILE }) {
  const opened = await openConfigSheet("cashback", "admin-cashback", bucketStore(files), {
    beside: createElement(EditorAmounts),
  });
  return opened;
}

afterEach(() => {
  rememberPlace(FIRST_PLACE);
});

describe("Config → Cashback", () => {
  it("shows each configuration with its four amounts; BAU cannot be taken out", async () => {
    await open();
    await expect.poll(() => cards().elements().length).toBe(2);
    await expect.element(amount(0, 1)).toHaveValue("$250.000");
    await expect.element(amount(1, 4)).toHaveValue("$30.000");
    await expect.element(card(0)).toMatchTextContent(/BAU.*La de fallback: no se puede quitar/);
    expect(card(0).getByRole("button", { name: "Quitar" }).elements()).toHaveLength(0);
    await expect.element(card(1).getByRole("button", { name: "Quitar" })).toBeVisible();
  });

  it("is saved for everybody, as it was edited, and whoever reads it again gets it", async () => {
    const { store, harness } = await open();
    await amount(1, 2).fill("$999.000");
    await card(1).getByTestId("cashback-name").dblClick();
    const name = card(1).getByLabelText("Nombre de la configuración");
    await expect.element(name).toHaveFocus();
    await name.fill("Grandes");
    await userEvent.keyboard("{Enter}");
    await save().click();

    await expect.element(notice()).toHaveTextContent("Cashback actualizado para todos (2 configs)");
    const written = store.written.find(({ file }) => file === "_cashback.json")?.content;
    expect(written).toMatchObject({
      configs: [FILE.configs[0], { ...FILE.configs[1], nombre: "Grandes", m2: "$999.000" }],
    });
    expect(written).toHaveProperty("updated_at");
    expect(harness.queryClient.getQueryData(CASHBACK_QUERY_KEY)).toMatchObject([
      { nombre: "BAU" },
      { nombre: "Grandes", m2: "$999.000" },
    ]);
    await expect.element(save()).toBeEnabled();
  });

  it("a new one starts with the amounts of the last and its name to write; one is taken out after asking", async () => {
    const { store } = await open();
    await sheet().getByRole("button", { name: "+ Agregar config" }).click();
    await expect.poll(() => cards().elements().length).toBe(3);
    await expect.element(amount(2, 1)).toHaveValue("$350.000");
    const name = card(2).getByLabelText("Nombre de la configuración");
    await expect.element(name).toHaveFocus();
    expect(name.element()).toHaveProperty("selectionEnd", "Config 2".length);
    await userEvent.keyboard("Nueva{Enter}");
    await expect.element(card(2).getByTestId("cashback-name")).toHaveTextContent("Nueva");

    await card(1).getByRole("button", { name: "Quitar" }).click();
    const question = page.getByRole("alertdialog");
    await expect.element(question).toMatchTextContent(/¿Quitar "Config 1"\?/);
    await expect.element(question).toMatchTextContent(/van a salir SIN cashback/);
    await question.getByRole("button", { name: "Cancelar" }).click();
    expect(cards().elements()).toHaveLength(3);
    await card(1).getByRole("button", { name: "Quitar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Quitar" }).click();
    await expect.poll(() => cards().elements().length).toBe(2);
    expect(store.written).toEqual([]);

    await save().click();
    await expect.element(notice()).toHaveTextContent("Cashback actualizado para todos (2 configs)");
    const written = store.written.at(-1)?.content;
    expect(written).toMatchObject({ configs: [{ nombre: "BAU" }, { nombre: "Nueva" }] });
  });

  it("Escape leaves the name as it was and does not close the panel; leaving the field keeps it", async () => {
    const { closed } = await open();
    await card(1).getByTestId("cashback-name").dblClick();
    await userEvent.keyboard("Otro{Escape}");
    await expect.element(card(1).getByTestId("cashback-name")).toHaveTextContent("Config 1");
    expect(closed).toHaveLength(0);
    await expect.element(sheet()).toBeVisible();

    await card(1).getByTestId("cashback-name").dblClick();
    await card(1).getByLabelText("Nombre de la configuración").fill("  <> ");
    await amount(0, 1).click();
    await expect.element(card(1).getByTestId("cashback-name")).toHaveTextContent("Config 1");
    await card(1).getByTestId("cashback-name").dblClick();
    await card(1).getByLabelText("Nombre de la configuración").fill("Fuera");
    await amount(0, 1).click();
    await expect.element(card(1).getByTestId("cashback-name")).toHaveTextContent("Fuera");
  });

  it("while it is typed the flyer behind shows it; Recargar goes back to what is saved", async () => {
    await open();
    await expect.element(page.getByTestId("editor-amounts")).toHaveTextContent("$250.000 $350.000");
    await amount(0, 1).fill("$1");
    await expect.element(page.getByTestId("editor-amounts")).toHaveTextContent("$1 $350.000");
    await sheet().getByRole("button", { name: "Recargar" }).click();
    await expect.element(amount(0, 1)).toHaveValue("$250.000");
    await expect.element(page.getByTestId("editor-amounts")).toHaveTextContent("$250.000 $350.000");
  });

  it("without the file, the ones of always", async () => {
    await open({});
    await expect.poll(() => cards().elements().length).toBe(5);
    await expect.element(card(4)).toMatchTextContent(/Config 4/);
  });

  it("a file that could not be read is not the ones of always, and nothing is saved over it (invariant 24)", async () => {
    const store = bucketStore({ "_cashback.json": FILE });
    store.dropped.add("_cashback.json");
    await openConfigSheet("cashback", "admin-cashback", store);
    await expect.element(sheet()).toMatchTextContent(/No se pudo leer el cashback: sin conexión\./);
    expect(cards().elements()).toHaveLength(0);
    await expect.element(save()).toBeDisabled();
    await expect.element(sheet().getByRole("button", { name: "+ Agregar config" })).toBeDisabled();

    store.dropped.delete("_cashback.json");
    await sheet().getByRole("button", { name: "Reintentar" }).click();
    await expect.poll(() => cards().elements().length).toBe(2);
    expect(store.written).toEqual([]);
  });

  it("what the server refuses is said, and what was typed stays to try again", async () => {
    const store = bucketStore({ "_cashback.json": FILE });
    store.refused.set("_cashback.json", "sin permiso");
    await openConfigSheet("cashback", "admin-cashback", store);
    await amount(1, 1).fill("$5");
    await save().click();
    await expect.element(notice()).toHaveTextContent("Error al guardar el cashback: sin permiso");
    await expect.element(amount(1, 1)).toHaveValue("$5");
    await expect.element(save()).toBeEnabled();
  });
});
