// Replaces pruebas/t31_logos_texto_barrita.cjs.
import { expect, test } from "../../support/test.ts";
import { adjustBar, button } from "./editor-toolbars.ts";

const DAYS_TEXT = { x: 730, y: 1395 };
const HELP = /Tocá un logo o un texto/;
const HELP_FADES_MS = 7500;
const OPEN_DESIGNS = "Borradores y diseños abiertos";

test.describe("Cambiar logos", () => {
  test("its help fades, except when it says what to do next", async ({ openApp }) => {
    const app = await openApp();
    const help = app.page.getByText(HELP);
    await app.flyerEditor.setZoom(1.3);
    await app.logoEditor.enter();

    await expect.soft(help, "when it turns on, the help shows").toBeVisible();
    await expect.soft(help, "after 7 seconds the help goes").toBeHidden({ timeout: HELP_FADES_MS });

    await button(app.page, "Armar franja").click();
    await expect
      .soft(
        app.page.getByText("Arrastrá un recuadro alrededor de toda la franja"),
        "while marking a strip the instruction stays",
      )
      .toBeVisible();
  });

  test("the window of a text puts it apart from the list of brands", async ({ openApp }) => {
    const app = await openApp();
    await app.flyerEditor.setZoom(1.3);
    await app.logoEditor.enter();

    await app.logoEditor.touch(DAYS_TEXT);
    await app.logoEditor.waitForPicker();
    const write = button(app.page, "Escribir un texto");
    const putText = button(app.page, "Poner el texto");
    const backToBrands = button(app.page, "← Elegir una marca");
    await write.waitFor();
    await expect.soft(putText, 'among the brands there is no "Poner el texto"').toBeHidden();

    await write.click();
    await app.page.getByRole("textbox", { name: /^Texto/ }).fill("Lunes");
    await expect.soft(putText, 'on the text: "Poner el texto"').toBeVisible();
    await expect.soft(backToBrands, 'and "← Elegir una marca"').toBeVisible();
    expect
      .soft((await app.logoEditor.textForm()).chosenColor, "it keeps the color")
      .toBe("Como estaba");
    await expect
      .soft(button(app.page, "Dejar el lugar vacío"), "it can still leave the place empty")
      .toBeVisible();
    await expect.soft(button(app.page, "Cancelar"), "or cancel").toBeVisible();

    await backToBrands.click();
    expect
      .soft(await app.logoEditor.brandListVisible(), '"← Elegir una marca" goes back to the list')
      .toBe(true);
    await expect.soft(putText, 'with no "Poner el texto"').toBeHidden();
  });

  test("the bar stays at the foot of the preview, in sight", async ({ openApp }) => {
    const app = await openApp();
    await app.flyerEditor.setZoom(1.3);
    await app.logoEditor.enter();

    await app.logoEditor.touch(DAYS_TEXT);
    await button(app.page, "Escribir un texto").click();
    await app.page.getByRole("textbox", { name: /^Texto/ }).fill("Lunes");
    await button(app.page, "Poner el texto").click();
    await app.logoEditor.waitForPickerClosed();

    const bar = adjustBar(app.page);
    const onScreen = await bar.boundingBox();
    const preview = await app.logoEditor.previewOnScreen();
    const barBottom = (onScreen?.y ?? 0) + (onScreen?.height ?? 0);
    expect.soft(barBottom, "the bar ends inside the preview").toBeLessThanOrEqual(preview.bottom);
    expect.soft(preview.bottom - barBottom, "right at its foot").toBeLessThan(60);

    await app.logoEditor.scrollPreviewBy(900);
    await expect.soft(bar, "going over the flyer, the bar stays in sight").toBeInViewport({
      ratio: 1,
    });

    await bar.getByRole("button", { name: "Listo con este" }).click();
    await expect.soft(bar, "the × of the bar lets the element go").toBeHidden();
  });

  test("a design of Estudio opens as a tab beside its flyer", async ({ cloud, openApp }) => {
    const now = new Date().toISOString();
    cloud.designs.push({
      id: "d950-0000-4000-8000-000000000000",
      user_id: cloud.users.asesor?.id ?? "",
      autor: "Asesor Prueba",
      nombre: "MVP 4.0",
      empresa: "",
      opcion: 9,
      base_name: "",
      datos: { v: 1, cambios: [], subidos: {} },
      miniatura: "",
      estado: "privado",
      tipo: "diseno",
      nota_admin: "",
      opcion_publicada: null,
      pedido_at: null,
      revisado_at: null,
      compartido_de: null,
      created_at: now,
      updated_at: now,
    });
    const app = await openApp();

    await app.studio.open();
    await button(app.page, "Usar").click();
    const tab = app.page.getByRole("group", { name: OPEN_DESIGNS }).getByText("MVP 4.0");
    await expect.soft(tab, "the design opens as a tab").toBeVisible();
    expect
      .soft(await app.logoEditor.openDesignTabs(), "the one in use")
      .toEqual([{ name: "MVP 4.0", active: true }]);

    await app.logoEditor.pressFlyerTab("Combustible");
    expect
      .soft(await app.logoEditor.openDesignTabs(), "going back to the flyer keeps it open")
      .toEqual([{ name: "MVP 4.0", active: false }]);
  });
});
