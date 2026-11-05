// Replaces pruebas/t07_estudio_guardar_aprobar.cjs.
import { activeFile, designData, legalFile } from "../../support/cloud/designs.ts";
import { fixtureFile } from "../../support/cloud/index.ts";
import { activeFlyerNine } from "../../support/cloud/seed-data.ts";
import { settled } from "../../support/settled.ts";
import { expect, test } from "../../support/test.ts";

const FIRST_LOGO = { x: 850, y: 2708 };
const SECOND_LOGO = { x: 668, y: 2708 };
const TEXT_PLACE = { x: 730, y: 1395 };
const DESIGN_NAME = "Combustible con farmacias";
const COMPANY = "Farmacias del Sur";
const PUBLISHED_NAME = "Combustible farmacias";
const NEW_OPTION = 10;
const MAX_THUMBNAIL_LENGTH = 400_000;

test(
  "an advisor saves a design, it stays private and the administrator publishes it",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    const firstDesign = () => cloud.designs[0];
    // 1) The advisor builds a design and saves it
    const advisor = await openApp({ user: "asesor" });
    await test.step("the advisor builds a design and saves it", async () => {
      expect.soft(await advisor.studio.isTabVisible(), "the advisor sees Estudio").toBe(true);
      await advisor.flyerEditor.setZoom(1.6);
      await advisor.logoEditor.enter();
      expect
        .soft(
          (await advisor.studio.saveButton()).visible,
          "with no changes there is no save button",
        )
        .toBe(false);

      await advisor.logoEditor.replaceWithBrand(FIRST_LOGO, "farmacia del pueblo");
      await advisor.logoEditor.uploadLogo(SECOND_LOGO, {
        name: "gofarma_180.png",
        mimeType: "image/png",
        buffer: fixtureFile("gofarma_180.png"),
      });
      await advisor.logoEditor.writeText(TEXT_PLACE, "Lunes y jueves");
      expect
        .soft(
          (await advisor.studio.saveButton()).visible,
          'with changes "Guardar en Estudio" appears',
        )
        .toBe(true);

      await advisor.studio.save({ name: DESIGN_NAME, company: COMPANY });
      expect.soft(cloud.designs, "one design is in the table").toHaveLength(1);
      const design = firstDesign();
      expect.soft(design?.user_id, "its owner is the advisor").toMatch(/01$/);
      expect.soft(design?.autor, "with their name").toBe("Asesor Prueba");
      expect.soft(design?.estado, "and it is private").toBe("privado");
      expect.soft(designData(design).cambios, "it keeps the 3 changes").toHaveLength(3);
      expect
        .soft(Object.keys(designData(design).subidos), "and the uploaded logo inside")
        .toHaveLength(1);
      const thumbnail = String(design?.miniatura);
      expect.soft(thumbnail, "the thumbnail is a JPEG").toMatch(/^data:image\/jpeg;base64,/);
      expect.soft(thumbnail.length, "and a small one").toBeLessThan(MAX_THUMBNAIL_LENGTH);
      expect
        .soft(await advisor.studio.openDesignLabel(), "the bar names the design")
        .toBe(`Diseño: ${DESIGN_NAME} ×`);
      expect
        .soft(
          (await advisor.studio.saveButton()).label,
          "and the button offers to save the changes",
        )
        .toBe("Guardar cambios");

      // Editing it and saving the changes on the same one
      await advisor.logoEditor.resizeFirstChange(120);
      const dialog = await advisor.studio.openSaveDialog();
      expect.soft(dialog.offersSameDesign, 'the window offers "the same"').toBe(true);
      await advisor.studio.confirmSave({});
      expect.soft(cloud.designs, "saving the changes does not duplicate it").toHaveLength(1);
    });

    await test.step("Estudio lists it and it is requested", async () => {
      // 2) Estudio: list, use, request
      await advisor.studio.open();
      const cards = await advisor.studio.cards();
      expect.soft(cards, "the advisor sees 1 design").toHaveLength(1);
      expect
        .soft(cards[0]?.buttons, "with the buttons of a private design")
        .toEqual(["Usar", "Ver completo", "Pedir que se publique", "Borrar"]);

      await advisor.studio.requestPublication();
      expect.soft(firstDesign()?.estado, "the request is sent").toBe("pedido");
      expect.soft(firstDesign()?.pedido_at, "and it has a date").toBeTruthy();
      expect
        .soft((await advisor.studio.cards())[0]?.buttons, "the request can be cancelled")
        .toEqual(["Usar", "Ver completo", "Cancelar pedido", "Borrar"]);
    });

    await test.step("it is used from a clean page, as on another day", async () => {
      // Using it from a clean page, as on another day
      const otherDay = await openApp({ user: "asesor" });
      await otherDay.studio.open();
      await otherDay.studio.use();
      expect
        .soft(await otherDay.logoEditor.changes(), '"Usar" applies the 3 changes')
        .toHaveLength(3);
      expect
        .soft(await otherDay.logoEditor.openDesignName(), "and remembers the design")
        .toBe(DESIGN_NAME);
      expect
        .soft(
          await otherDay.studio.uploadedLogoInMemory(),
          "the uploaded logo came back from the cloud",
        )
        .toBe(true);
      expect
        .soft(await otherDay.flyerEditor.companyName(), "it fills the empty company")
        .toBe(COMPANY);
      expect.soft(otherDay.pageErrors(), "no JavaScript errors on the other day").toEqual([]);
    });

    // 3) Another advisor sees nothing; the administrator sees it all
    const stranger = await openApp({ user: "asesor2" });
    await stranger.studio.open();
    expect.soft(await stranger.studio.cards(), "another advisor does not see it").toEqual([]);
    expect.soft(stranger.pageErrors(), "no JavaScript errors for the other advisor").toEqual([]);
    const admin = await openApp({ user: "admin" });
    await test.step("it is private but the administrator sees it", async () => {
      await settled(async () => (await admin.studio.tabBadge()) !== "");
      expect.soft(await admin.studio.tabBadge(), "the tab counts the requests").toBe("1");
      await admin.studio.open();
      expect
        .soft(await admin.studio.filters(), "the filters count what they hold")
        .toEqual(["Mis diseños 0", "Todos 1", "Pedidos 1"]);
      await admin.studio.showFilter("requests");
      expect.soft(await admin.studio.cards(), 'it is listed in "Pedidos"').toHaveLength(1);
    });

    await test.step("the administrator approves it", async () => {
      // 4) The administrator approves
      await admin.studio.approve(PUBLISHED_NAME);
      const design = firstDesign();
      const options = cloud.bucketJson["_opciones.json"].opts;
      expect
        .soft(
          options.map(({ n }) => n),
          "a new option exists",
        )
        .toEqual([1, 9, NEW_OPTION]);
      const active = activeFile(cloud, NEW_OPTION);
      expect.soft(active?.name, "it points to a new image").toMatch(/flyer_\d+_op\d+\.jpg/);
      expect
        .soft(activeFile(cloud, 9)?.name, "the original flyer is not touched")
        .toBe(activeFlyerNine().name);
      expect
        .soft(legalFile(cloud, NEW_OPTION)?.text, "the legal text comes from the original")
        .toBe("Legal de prueba para la opción 9.");
      expect
        .soft(
          cloud.bucketJson["_facultades.json"].roles.asesor?.[`opcion_${String(NEW_OPTION)}`],
          "the advisor sees the new version, as the original",
        )
        .toBe(true);
      expect.soft(design?.estado, "the design is marked published").toBe("publicado");
      expect.soft(design?.opcion_publicada, "as that option").toBe(NEW_OPTION);
      await settled(() => cloud.adminCalls.length > 1);
      expect
        .soft(
          cloud.adminCalls.some(
            (call) =>
              call.action === "notify_estudio" &&
              call.que === "resuelto" &&
              call.id === design?.id &&
              Boolean(call.flyer),
          ),
          "approving mails the author, with the name of the flyer",
        )
        .toBe(true);
      const created = options.find(({ n }) => n === NEW_OPTION);
      expect.soft(created?.rubro, "it stays out of the routing by category").toBe("ninguno");
      expect.soft(created?.nombre, "and has the chosen name").toBe(PUBLISHED_NAME);

      expect
        .soft(
          cloud.uploads.map(({ name }) => name),
          "the publication uploads its image and files",
        )
        .toEqual(
          expect.arrayContaining([
            `_active${String(NEW_OPTION)}.json`,
            `_legal${String(NEW_OPTION)}.json`,
            active?.name,
            "_opciones.json",
            "_facultades.json",
          ]),
        );
      const image = cloud.bucketBinaries[active?.name ?? ""];
      expect.soft(image, "the published image is in the bucket").toBeDefined();
      expect
        .soft(
          await admin.flyerSections.imageSize(image ?? Buffer.alloc(0)),
          "with the size of the flyer",
        )
        .toEqual({ width: 1240, height: 7382 });
    });

    await test.step("the advisor sees it published", async () => {
      // The advisor, when reloading, sees both options in the bar
      const reloaded = await openApp({ user: "asesor" });
      await settled(async () => (await reloaded.flyerSections.tabs()).length === 2);
      expect
        .soft(
          (await reloaded.flyerSections.tabs()).map(({ label }) => label),
          "the bar shows both flyers",
        )
        .toEqual(["Combustible", PUBLISHED_NAME]);
      await reloaded.studio.open();
      const [published] = await reloaded.studio.cards();
      expect
        .soft(published?.status, "the design reads as published")
        .toBe(`Publicado como «${PUBLISHED_NAME}»`);
      expect
        .soft(published?.buttons, "and leads to the published flyer")
        .toEqual(["Usar", "Ver completo", "Ir al flyer publicado"]);
      expect.soft(reloaded.pageErrors(), "no JavaScript errors after reloading").toEqual([]);
    });

    expect.soft(advisor.pageErrors(), "no JavaScript errors for the advisor").toEqual([]);
    expect.soft(admin.pageErrors(), "no JavaScript errors for the administrator").toEqual([]);
  },
);
