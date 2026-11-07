// Replaces pruebas/t45_estudio_ver_completo_aviso.cjs.
import { settled } from "../../support/settled.ts";
import { expect, test } from "../../support/test.ts";

const WHOLE_FLYER_HEIGHT = 7382;
const CROPPED_HEIGHT = 340;

test('"Ver completo" shows the whole design and requesting it tells the administrator', async ({
  cloud,
  openApp,
}) => {
  const advisor = await openApp({ user: "asesor" });
  await advisor.logoEditor.enter();
  await advisor.flyerSections.removeBand(669, CROPPED_HEIGHT);
  await advisor.studio.save({ name: "Sin cashback" });
  const design = cloud.designs.at(-1);
  expect.soft(design, "the design is saved").toBeDefined();

  await advisor.studio.open();
  const view = await advisor.studio.openCompleteView();
  expect
    .soft(view.height, '"Ver completo" shows the whole flyer of the design, with the crop')
    .toBe(WHOLE_FLYER_HEIGHT - CROPPED_HEIGHT);
  await advisor.studio.closeCompleteView();
  expect.soft(await advisor.studio.completeViewOpen(), 'it closes with "Cerrar"').toBe(false);

  // Requesting the publication tells the administrator
  cloud.adminCalls.length = 0;
  await advisor.studio.requestPublication();
  expect.soft(design?.estado, "the request is sent").toBe("pedido");
  await settled(() => cloud.adminCalls.length > 0);
  expect
    .soft(cloud.adminCalls, "requesting mails the administrator")
    .toContainEqual({ action: "notify_estudio_pedido", id: design?.id });
  expect.soft(advisor.pageErrors(), "no JavaScript errors for the advisor").toEqual([]);
  await advisor.close();

  // The administrator sees "Ver completo" with the button to approve
  const admin = await openApp({ user: "admin" });
  await admin.studio.open();
  await admin.studio.openCompleteView();
  expect
    .soft(await admin.studio.approveVisibleInCompleteView(), "it can be approved from that view")
    .toBe(true);
  expect.soft(admin.pageErrors(), "no JavaScript errors for the administrator").toEqual([]);
});
