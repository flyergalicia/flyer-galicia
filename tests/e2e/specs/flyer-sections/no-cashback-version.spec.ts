// Replaces pruebas/t43_version_sin_cashback.cjs.
import { activeFlyerNine } from "../../support/cloud/seed-data.ts";
import { expect, test } from "../../support/test.ts";

const ORIGINAL = 9;
const VARIANT = 10;
const NO_CASHBACK = {
  empresa: "SIN CB S.A.",
  config: "",
  asesores: [{ nombre: "Ana Pérez", celular: "11 5555 5555" }],
  rubro: "",
};
const WITH_CASHBACK = {
  empresa: "CON CB S.A.",
  config: "BAU",
  asesores: [{ nombre: "Juan Díaz", celular: "11 4444 4444" }],
  rubro: "",
};
const LEGAL = "Legal SIN cashback.";

test(
  "the version with no cashback is chosen by itself",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    // Option 10 is the version with no cashback of option 9.
    const nine = activeFlyerNine();
    const calibration = structuredClone(nine.cfg ?? {});
    calibration.montos = Object.assign({}, calibration.montos, { off: true });
    calibration.cashback = Object.assign({}, calibration.cashback, { off: true });
    calibration.recDe = ORIGINAL;
    cloud.bucketJson["_active10.json"] = {
      name: "flyer_t9.jpg",
      imageUrl: nine.imageUrl?.replace("?v=1", "?v=2"),
      cfg: calibration,
    };
    cloud.bucketJson["_legal10.json"] = { text: LEGAL };
    cloud.bucketJson["_opciones.json"].opts.push({
      n: VARIANT,
      nombre: "Combustible sin cashback",
      solapa: "flyer",
      sinCB: ORIGINAL,
    });
    cloud.setPermissions("asesor", { opcion_10: true, padron_buscar: true });

    const app = await openApp({ user: "asesor" });
    const sections = app.flyerSections;
    expect
      .soft(await sections.noCashbackLink(ORIGINAL), "the option list keeps the link")
      .toEqual({ listed: ORIGINAL, variant: VARIANT, base: ORIGINAL });
    expect.soft(await app.flyerEditor.currentOption(), "it starts on the original").toBe(ORIGINAL);

    // Company search, no cashback: the version with no cashback
    await sections.bringCompany(NO_CASHBACK);
    await app.flyerEditor.waitForOptionShown(VARIANT);
    expect
      .soft(await app.flyerEditor.currentOption(), "a company with no cashback goes there")
      .toBe(VARIANT);
    expect
      .soft(await app.flyerEditor.companyName(), "keeping what was brought")
      .toBe(NO_CASHBACK.empresa);
    expect.soft((await sections.cropStatus()).amountsHidden, "without amounts").toBe(true);
    expect.soft(await sections.legal(), "with the legal text of that version").toBe(LEGAL);
    expect.soft((await sections.companyNotices()).updateNotice, "with no notice").toBeNull();

    // Company search, with cashback: back to the original
    await sections.bringCompany(WITH_CASHBACK);
    await app.flyerEditor.waitForOptionShown(ORIGINAL);
    expect.soft(await app.flyerEditor.currentOption(), "with cashback it goes back").toBe(ORIGINAL);
    expect.soft((await sections.cropStatus()).amountsHidden, "with amounts").toBe(false);
    expect.soft((await sections.companyNotices()).confirmation, "with no question").toBeNull();
    expect.soft(await sections.firstAmount(), "drawn").toBe("$250.000");

    // Generar flyers groups by version
    expect
      .soft(
        await sections.optionForCompany(NO_CASHBACK),
        "Generar flyers sends each to its version",
      )
      .toBe(VARIANT);
    expect.soft(await sections.optionForCompany(WITH_CASHBACK), "and the other one").toBe(ORIGINAL);

    // Masivo: mixed rows
    const mixed = await sections.generateBulk([
      { empresa: "A con", config: "BAU", asesor1_nombre: "X" },
      { empresa: "B sin", config: "", asesor1_nombre: "Y" },
      { empresa: "C con", config: "BAU", asesor1_nombre: "Z" },
      { empresa: "D sin", config: "SIN", asesor1_nombre: "W" },
    ]);
    expect.soft(mixed.zipName, "Masivo finishes its ZIP").toBeTruthy();
    expect.soft(mixed.generated, "with the 4 rows").toHaveLength(4);
    expect
      .soft(
        mixed.generated.filter(({ hasAmounts }) => !hasAmounts),
        "the rows with no cashback use the version with no cashback",
      )
      .toEqual([
        { company: "B sin", option: VARIANT, hasAmounts: false },
        { company: "D sin", option: VARIANT, hasAmounts: false },
      ]);
    expect
      .soft(
        mixed.generated.filter(({ hasAmounts }) => hasAmounts),
        "and the others the original",
      )
      .toHaveLength(2);
    expect
      .soft(mixed.finalOption, "at the end it goes back to the option it came from")
      .toBe(ORIGINAL);

    // Masivo starting FROM the version with no cashback
    await app.flyerEditor.selectOption(VARIANT);
    await app.flyerEditor.waitForOptionShown(VARIANT);
    await app.page.waitForTimeout(500);
    const fromVariant = await sections.generateBulk([
      { empresa: "A con", config: "BAU", asesor1_nombre: "X" },
      { empresa: "B sin", config: "", asesor1_nombre: "Y" },
    ]);
    expect.soft(fromVariant.generated, "from that version, each row uses its own").toEqual(
      expect.arrayContaining([
        { company: "B sin", option: VARIANT, hasAmounts: false },
        { company: "A con", option: ORIGINAL, hasAmounts: true },
      ]),
    );
    expect
      .soft(fromVariant.finalOption, "and it goes back to the option it came from")
      .toBe(VARIANT);
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  },
);
