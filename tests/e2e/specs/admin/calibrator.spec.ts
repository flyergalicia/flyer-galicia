// Protects the calibrator: its zones, sizes, starting points, zoom and resizing.
import { type Cloud, fixtureFile } from "../../support/cloud/index.ts";
import { type CalibrationData } from "../../support/driver/calibrator.ts";
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const JPEG = { name: "nuevo.jpg", mimeType: "image/jpeg", buffer: fixtureFile("op9.jpg") };

async function openCalibrator(
  openApp: (o?: object) => Promise<OpenedApp>,
  option = "Combustible",
): Promise<OpenedApp> {
  const app = await openApp({ user: "admin" });
  await app.admin.openPanel();
  await app.admin.openSheet("Config", "Flyer");
  await app.calibrator.chooseFlyerFile(JPEG);
  await app.calibrator.answerOption(option);
  await app.calibrator.waitForEditor();
  return app;
}

function withTabs(cloud: Cloud): void {
  cloud.addFlyerOption({ option: 7, name: "Sueldo", image: null, legal: "L", tab: "sueldo" });
  cloud.addFlyerOption({ option: 8, name: "Rubro", image: null, legal: "L", tab: "rubros" });
}

const boxes = ({ montos }: CalibrationData) => montos?.boxes ?? [];

test.describe("the calibrator", () => {
  test("offers the zones of the tab of that flyer", async ({ cloud, openApp }) => {
    withTabs(cloud);
    const galicia = await openCalibrator(openApp);
    const ids = (await galicia.calibrator.zones()).map(({ id }) => id);
    expect
      .soft(ids)
      .toEqual(expect.arrayContaining(["empresa", "montos", "asesores", "legal", "mb0", "mb3"]));
    expect.soft(ids, "no single amount here").not.toContain("cashback");
    await galicia.close();

    const salary = await openCalibrator(openApp, "Sueldo");
    const salaryIds = (await salary.calibrator.zones()).map(({ id }) => id);
    expect.soft(salaryIds, "a single amount").toContain("cashback");
    expect.soft(salaryIds, "instead of the four").not.toContain("montos");
    await salary.close();

    const category = await openCalibrator(openApp, "Rubro");
    const categoryIds = (await category.calibrator.zones()).map(({ id }) => id);
    expect.soft(categoryIds, "the lines of the benefit").toContain("blAll");
    expect.soft(await category.calibrator.title()).toMatch(/Flyer Rubros/);
  });

  test("the template of an additional promotion keeps its two columns", async ({
    cloud,
    openApp,
  }) => {
    withTabs(cloud);
    const { calibrator } = await openCalibrator(openApp, "Rubro");

    await calibrator.loadBenefitTemplate("Promo adicional: combustible");

    const texts = await calibrator.benefitLines();
    const left = texts.find(({ text }) => text.startsWith("Además"));
    const right = texts.find(({ text }) => text.startsWith("Tope de reintegro"));
    expect.soft(left?.x, "it is not centered like the others").toBe(119);
    expect.soft(right?.x).toBe(673);
  });

  test("a zone is dragged; the group moves all the boxes and one box moves alone", async ({
    openApp,
  }) => {
    const { calibrator } = await openCalibrator(openApp);
    const start = await calibrator.calibration();
    const empresaY = start.empresa?.yc ?? 0;

    await calibrator.chooseZone("empresa");
    await calibrator.dragZone("empresa", 0, 40);
    const moved = await calibrator.calibration();
    expect.soft((moved.empresa?.yc ?? 0) - empresaY, "it follows").toBeCloseTo(40, -1);

    await calibrator.chooseZone("mb0");
    const beforeBox = boxes(await calibrator.calibration());
    await calibrator.dragZone("mb0", 30, 0);
    const afterBox = boxes(await calibrator.calibration());
    expect
      .soft((afterBox[0]?.xc ?? 0) - (beforeBox[0]?.xc ?? 0), "the box moves")
      .toBeCloseTo(30, -1);
    expect.soft(afterBox[1]?.xc, "the next one stays").toBe(beforeBox[1]?.xc);

    await calibrator.chooseZone("mb0");
    await calibrator.chooseZone("montos");
    const beforeAll = await calibrator.calibration();
    await calibrator.dragZone("montos", 0, 20);
    const afterAll = await calibrator.calibration();
    expect
      .soft((afterAll.montos?.y ?? 0) - (beforeAll.montos?.y ?? 0), "the group moves")
      .toBeCloseTo(20, -1);
  });

  test("the chosen zone is the only one drawn, and clicking the chip again lets it go", async ({
    openApp,
  }) => {
    const { calibrator } = await openCalibrator(openApp);

    await calibrator.chooseZone("legal");
    expect.soft(await calibrator.chosenZone()).toBe("legal");
    await calibrator.chooseZone("legal");
    expect.soft(await calibrator.chosenZone()).toBeNull();
  });

  test("each zone has its size, weight and color, saved with the flyer and used to draw", async ({
    cloud,
    openApp,
  }) => {
    const { calibrator, flyerEditor, flyerDrawing } = await openCalibrator(openApp);

    await calibrator.chooseZone("empresa");
    const row = await calibrator.properties();
    expect.soft(row.zone).toBe("Empresa");
    expect.soft(row.fields).toEqual(["Letra px", "Peso", "Color", "Ancho máx."]);

    await calibrator.setProperty("Letra px", "60");
    await calibrator.setProperty("Peso", "400");
    await calibrator.setProperty("Color", "#123456");
    const chosen = (await calibrator.calibration()).empresa;
    expect.soft(chosen?.fs).toBe(60);
    expect.soft(chosen?.peso).toBe("400");
    expect.soft(chosen?.color).toBe("#123456");

    await calibrator.saveAndActivate();
    expect.soft(JSON.stringify(cloud.bucketJson["_active9.json"]), "saved").toContain('"fs":60');

    await flyerEditor.waitForOptionShown(9);
    await flyerEditor.fillCompanyName("ACME");
    const { texts } = await flyerDrawing.draw();
    const company = texts.find(({ text }) => text.includes("ACME"));
    expect.soft(company?.color, "the flyer uses them").toBe("#123456");
    expect.soft(company?.font).toMatch(/60px/);
    expect.soft(company?.font, "without bold").not.toMatch(/bold|700/);
  });

  test("Restablecer goes back to the values of the factory, keeping the place", async ({
    openApp,
  }) => {
    const { calibrator } = await openCalibrator(openApp);
    const start = (await calibrator.calibration()).empresa;
    await calibrator.chooseZone("empresa");
    await calibrator.setProperty("Letra px", "60");
    await calibrator.dragZone("empresa", 0, 20);

    await calibrator.resetProperties();

    const now = (await calibrator.calibration()).empresa;
    expect.soft(now?.fs).toBe(start?.fs);
    expect.soft(now?.yc, "its position stays").not.toBe(start?.yc);
  });

  test("a starting point fills the zones it knows, and it can be left without saving", async ({
    cloud,
    openApp,
  }) => {
    const { calibrator } = await openCalibrator(openApp);
    const bases = await calibrator.bases();
    expect
      .soft(bases)
      .toEqual(
        expect.arrayContaining(["Flyer Galicia (de fábrica)", "Pasá tu sueldo: combustible"]),
      );

    await calibrator.applyBase("Pasá tu sueldo: súper + combustible");

    const cfg = await calibrator.calibration();
    expect.soft(cfg.imgH).toBe(7711);
    expect
      .soft(boxes(cfg)[2], "with its boxes two by two")
      .toEqual(expect.objectContaining({ xc: 651, y: 920 }));

    await calibrator.close();
    expect.soft(cloud.lastJsonUpload, "closing saves nothing").toBeNull();
  });

  test("moving a box of a base does not change the base for the next flyer", async ({
    openApp,
  }) => {
    const { calibrator } = await openCalibrator(openApp);
    await calibrator.applyBase("Pasá tu sueldo: combustible");
    await calibrator.chooseZone("mb0");
    await calibrator.dragZone("mb0", 0, 50);
    const moved = boxes(await calibrator.calibration())[0]?.y;

    await calibrator.applyBase("Pasá tu sueldo: combustible");

    expect.soft(boxes(await calibrator.calibration())[0]?.y, "the base is intact").not.toBe(moved);
  });

  test("it zooms with its buttons and with Ctrl + wheel, up to 130 %", async ({ openApp }) => {
    const { calibrator } = await openCalibrator(openApp);
    expect.soft(await calibrator.zoomLabel()).toBe("100%");

    await calibrator.pressZoomIn(5);
    expect.soft(await calibrator.zoomLabel(), "and it stops").toBe("130%");

    await calibrator.pressZoomReset();
    expect.soft(await calibrator.zoomLabel()).toBe("100%");

    await calibrator.wheelZoomIn(1);
    expect.soft(await calibrator.zoomLabel()).not.toBe("100%");

    await calibrator.pressZoomReset();
    expect.soft(await calibrator.wheelScroll(), "the wheel alone scrolls").toBeGreaterThan(0);
    expect.soft(await calibrator.zoomLabel()).toBe("100%");
  });

  test("the editor can be enlarged, and its parts dragged", async ({ openApp }) => {
    const { calibrator } = await openCalibrator(openApp);
    const start = await calibrator.size();

    await calibrator.pressEnlarge();
    const big = await calibrator.size();
    expect.soft(big.width, "wider").toBeGreaterThan(start.width);

    await calibrator.dragSplit(-60);
    const split = await calibrator.size();
    expect.soft(split.imageAreaHeight, "the image takes less").toBeLessThan(big.imageAreaHeight);

    await calibrator.dragCorner(-80, -40);
    const corner = await calibrator.size();
    expect.soft(corner.width, "the corner resizes").toBeLessThan(big.width);

    await calibrator.pressEnlarge();
    const again = await calibrator.size();
    expect.soft(again.width, "and the button enlarges it again").toBeGreaterThan(corner.width);
  });
});
