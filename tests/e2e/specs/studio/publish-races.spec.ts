// Replaces pruebas/t12_estudio_carreras_publicar.cjs.
import { activeFile, addDesign, textChange } from "../../support/cloud/designs.ts";
import { type Cloud } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

function requestedDesign(cloud: Cloud, id: string) {
  const now = new Date().toISOString();
  return addDesign(cloud, {
    id,
    nombre: `Diseño ${id}`,
    estado: "pedido",
    pedido_at: now,
    datos: { v: 1, cambios: [textChange("Lunes")], subidos: {} },
  });
}

test("a late answer does not overwrite a newer change", async ({ cloud, openApp }) => {
  const design = requestedDesign(cloud, "d1-0000-4000-8000-000000000000");
  const admin = await openApp({ user: "admin" });
  await admin.studio.open();

  // The author cancels elsewhere while the administrator has the list open.
  design.estado = "privado";
  await admin.studio.reject("No va");

  expect
    .soft(design.estado, "the late rejection does not overwrite the cancelling")
    .toBe("privado");
  expect.soft(design.nota_admin, "and leaves no note").toBe("");
  expect
    .soft(await admin.flyerEditor.latestNotice(), "it tells the design changed meanwhile")
    .toBe("Ese diseño cambió mientras tanto. Te muestro cómo quedó.");
  expect.soft(admin.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("publishing skips a used option number and a second attempt does nothing", async ({
  cloud,
  openApp,
}) => {
  const design = requestedDesign(cloud, "d2-0000-4000-8000-000000000000");
  // It remains from an earlier attempt.
  const leftover = { name: "flyer_viejo_op10.jpg", imageUrl: "x", cfg: {} };
  cloud.bucketJson["_active10.json"] = leftover;
  const admin = await openApp({ user: "admin" });
  await admin.studio.open();
  await admin.studio.showFilter("requests");
  await admin.studio.waitForCards();

  await admin.studio.approveTwiceAtOnce(design.id, "Variante B", "Variante B duplicada");

  expect.soft(activeFile(cloud, 10), "the file that existed is not overwritten").toEqual(leftover);
  expect.soft(activeFile(cloud, 11)?.name, "it uses option 11").toMatch(/_op11\.jpg$/);
  const names = cloud.bucketJson["_opciones.json"].opts.map(({ nombre }) => nombre);
  expect
    .soft(
      names.filter((name) => name.includes("Variante B")),
      "the double click publishes once",
    )
    .toHaveLength(1);
  expect.soft(design.estado, "the design is published").toBe("publicado");
  expect.soft(design.opcion_publicada, "as option 11").toBe(11);
  expect.soft(admin.pageErrors(), "no JavaScript errors").toEqual([]);
});
