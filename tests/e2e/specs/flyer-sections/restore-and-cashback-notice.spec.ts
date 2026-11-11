// Replaces pruebas/t40_restaurar_y_aviso_cashback.cjs.
import { expect, test } from "../../support/test.ts";

const OPTION = 9;
const CUT = { y: 669, height: 340 };
const COMPANY_WITH_CASHBACK = {
  empresa: "ACME S.A.",
  config: "BAU",
  asesores: [{ nombre: "Ana Pérez", celular: "11 5555 5555", email: "ana@bancogalicia.com.ar" }],
  rubro: "",
};
const SETTLE_MS = 500;

test("Restaurar lets the crop go", async ({ openApp }) => {
  const app = await openApp({ user: "asesor" });
  const sections = app.flyerSections;
  const wholeHeight = (await sections.cropStatus()).artworkHeight;
  const savedCalibration = await app.flyerEditor.optionCalibration(OPTION);

  // 1) Cropping, then Restaurar
  await sections.removeBand(CUT.y, CUT.height);
  expect
    .soft((await sections.cropStatus()).artworkHeight, "the crop is applied")
    .toBe(wholeHeight - CUT.height);
  await app.flyerEditor.restoreDefaults();
  await app.page.waitForTimeout(300);
  const restored = await sections.cropStatus();
  expect.soft(restored.artworkHeight, "Restaurar brings the cut part back").toBe(wholeHeight);
  expect.soft(restored.cuts, "with no crop left").toEqual([]);
  expect.soft(restored.amountsCardHidden, "and the Montos card").toBe(false);
  expect
    .soft(await app.flyerEditor.activeCalibration(), "the calibration is the saved one")
    .toEqual(savedCalibration);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("a company with cashback warns on a cropped flyer", async ({ cloud, openApp }) => {
  // Bringing a company takes the search, which comes with its own faculty.
  cloud.setPermissions("asesor", { padron_buscar: true });
  const app = await openApp({ user: "asesor" });
  const sections = app.flyerSections;
  const wholeHeight = (await sections.cropStatus()).artworkHeight;

  // 2) A company WITH cashback on a cropped flyer: notice, "Mostrar los importes"
  await sections.removeBand(CUT.y, CUT.height);
  await sections.bringCompany(COMPANY_WITH_CASHBACK);
  const notice = await app.session.waitForConfirmation();
  expect.soft(notice, 'the notice says "tiene cashback"').toMatch(/tiene cashback/);
  expect.soft(notice, 'and "no muestra importes"').toMatch(/no muestra importes/);
  await app.session.answerConfirmation(true);
  await app.page.waitForTimeout(SETTLE_MS);
  const shown = await sections.cropStatus();
  expect
    .soft(shown.artworkHeight, '"Mostrar los importes" leaves the flyer whole')
    .toBe(wholeHeight);
  expect.soft(shown.amountsHidden, "with amounts").toBe(false);
  expect.soft(await sections.firstAmount(), "drawn").toBe("$250.000");

  // 3) "Seguir así"
  await sections.removeBand(CUT.y, CUT.height);
  await sections.bringCompany(COMPANY_WITH_CASHBACK);
  await app.session.waitForConfirmation();
  await app.session.answerConfirmation(false);
  await app.page.waitForTimeout(SETTLE_MS);
  expect.soft((await sections.cropStatus()).active, '"Seguir así" keeps it cropped').toBe(true);

  // 4) A company WITHOUT cashback: this notice does not appear
  await sections.bringCompany({ ...COMPANY_WITH_CASHBACK, config: "" });
  expect
    .soft(await sections.companyNotices(), "no cashback on a flyer without amounts: no notice")
    .toEqual({ confirmation: null, updateNotice: null });

  // 5) An option with no amounts and no known original: only explains what to choose
  await sections.closeCompanyUpdateNotice();
  await sections.dropCrop();
  await sections.turnOffAmountsWithoutOriginal();
  await sections.bringCompany(COMPANY_WITH_CASHBACK);
  expect
    .soft(
      (await sections.companyNotices()).updateNotice,
      "no amounts and no known original: it warns and explains what to choose",
    )
    .toMatch(/eleg/i);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});
