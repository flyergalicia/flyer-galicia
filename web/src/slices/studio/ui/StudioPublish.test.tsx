// "Aprobar y publicar": what it leaves in the bucket, and what it does when something goes wrong.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { paintedLogo } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { jsonResponse, type RecordedRequest } from "@/shared/supabase/testing/recording-fetch.ts";
import { aDesign, flyerFiles, openStudio, type StudioCloud } from "../testing/studio-on-screen.ts";

const logos = vi.hoisted(() => ({ failures: 0 }));

vi.mock("@/shared/lib/promotions/logo-file.ts", async (original) => ({
  ...(await original<typeof import("@/shared/lib/promotions/logo-file.ts")>()),
  fetchLogoBlob: () => {
    if (logos.failures > 0) {
      logos.failures -= 1;
      return Promise.reject(new Error("HTTP 503"));
    }
    return paintedLogo(40, 20);
  },
}));

const OTHER = "other-person";
const CUT = { y: 100, h: 200 };
const notice = () => page.getByRole("status");
const WAIT = { timeout: 15_000 };
const ACTIVE_OF = (option: number) => `_active${String(option)}.json`;

function requested(fields: Readonly<Record<string, unknown>> = {}) {
  return aDesign("d", {
    user_id: OTHER,
    estado: "pedido",
    datos: { cambios: [], recortes: [CUT], subidos: {}, legal: "" },
    ...fields,
  });
}

function asAdmin(extra: StudioCloud = {}): StudioCloud {
  return { role: "admin", designs: [requested()], ...extra };
}

function uploads(harness: { network: { to: (path: string) => RecordedRequest[] } }) {
  return harness.network
    .to("/storage/v1/object/flyers/")
    .map(({ path }) => path.split("/").at(-1) ?? "");
}

function isUpload({ path, method }: RecordedRequest, name: string): boolean {
  return method === "POST" && path.endsWith(`/${name}`);
}

async function pressApprove(name?: string) {
  await page.getByRole("article").getByRole("button", { name: "Aprobar y publicar" }).click();
  if (name !== undefined) await page.getByTestId("text-window-field").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Publicar", exact: true }).click();
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("publishing", () => {
  it("creates the next option beside the original, with its picture, its legal and who sees it", async () => {
    const { harness, table, bucketFiles } = await openStudio(asAdmin());
    await pressApprove("Sin cashback");
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("Publicado: «Sin cashback» ya está al lado de «Combustible».");
    const names = uploads(harness);
    expect(names.find((name) => /^flyer_\d+_op10\.jpg$/.test(name))).toBeTruthy();
    expect(bucketFiles[ACTIVE_OF(10)]).toMatchObject({ cfg: { recDe: 9 } });
    expect(bucketFiles["_legal10.json"]).toMatchObject({ text: "Legal de la nueve" });
    const opts: readonly { n: number; orden: number }[] = Object(
      bucketFiles["_opciones.json"],
    ).opts;
    const place = (number: number) => opts.findIndex(({ n }) => n === number);
    expect(place(10)).toBe(place(9) + 1);
    expect(opts[place(10)]).toMatchObject({ nombre: "Sin cashback", rubro: "ninguno" });
    expect(opts.map(({ orden }) => orden)).toEqual(opts.map((_, index) => index));
    expect(Object.keys(Object(bucketFiles["_flyer_cfgs.json"])).join()).toMatch(/_op10\.jpg$/);
    expect(table.rows[0]).toMatchObject({ estado: "publicado", opcion_publicada: 10 });
    await vi.waitFor(() => {
      expect(harness.adminCalls()).toContainEqual({
        action: "notify_estudio",
        id: "d",
        que: "resuelto",
        flyer: "Sin cashback",
      });
    });
    expect(bucketFiles[ACTIVE_OF(9)]).toEqual(flyerFiles()["_active9.json"]);
  });

  it("the legal text of the design goes first, and the new one sees who saw the original", async () => {
    const { bucketFiles } = await openStudio(
      asAdmin({
        designs: [requested({ datos: { recortes: [CUT], legal: "Legal propio" } })],
        files: {
          "_facultades.json": { roles: { asesor: { opcion_9: true }, vip: { opcion_9: false } } },
        },
      }),
    );
    await pressApprove("Con legal");
    await expect.element(notice(), WAIT).toMatchTextContent(/^Publicado/);
    expect(bucketFiles["_legal10.json"]).toMatchObject({ text: "Legal propio" });
    expect(bucketFiles["_facultades.json"]).toMatchObject({
      roles: { asesor: { opcion_10: true }, vip: { opcion_10: false } },
    });
  });

  it("a whole flyer keeps its calibration as it is", async () => {
    const logo = {
      tipo: "txt",
      texto: "Hola",
      x: 10,
      y: 10,
      w: 100,
      h: 40,
      tx: 10,
      ty: 10,
      tw: 100,
      th: 40,
    };
    const { bucketFiles } = await openStudio(
      asAdmin({ designs: [requested({ datos: { cambios: [logo] } })] }),
    );
    await pressApprove("Entero");
    await expect.element(notice(), WAIT).toMatchTextContent(/^Publicado/);
    expect(bucketFiles[ACTIVE_OF(10)]).toMatchObject({ cfg: {} });
    expect(Object.keys(Object(Object(bucketFiles[ACTIVE_OF(10)])["cfg"]))).toEqual([]);
  });

  it("no name, or cancelling, publishes nothing", async () => {
    const { harness } = await openStudio(asAdmin());
    await pressApprove("");
    await expect.element(notice(), WAIT).toMatchTextContent("Hace falta un nombre.");
    await page.getByRole("article").getByRole("button", { name: "Aprobar y publicar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    expect(uploads(harness)).toEqual([]);
  });

  it("a base flyer that is gone is said", async () => {
    await openStudio(asAdmin({ designs: [requested({ opcion: 77 })] }));
    await page.getByRole("article").getByRole("button", { name: "Aprobar y publicar" }).click();
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("El flyer base de este diseño ya no existe.");
  });

  it("a logo uploaded from the PC that was not kept stops it before reserving a number", async () => {
    const { harness, table } = await openStudio(
      asAdmin({
        designs: [
          requested({
            datos: { cambios: [{ img: "pc:abc:a.png", t: "a", x: 10, y: 10, w: 10, h: 10 }] },
          }),
        ],
      }),
    );
    await pressApprove("Con logo");
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent(/No se pudo publicar: le falta el logo subido de la PC «a\.png»/);
    expect(uploads(harness)).toEqual([]);
    expect(table.rows[0]?.estado).toBe("pedido");
  });

  it("several lost logos are counted", async () => {
    await openStudio(
      asAdmin({
        designs: [
          requested({
            datos: {
              cambios: [
                { img: "pc:a:a.png", x: 1, y: 1, w: 1, h: 1 },
                { img: "pc:b:b.png", x: 2, y: 2, w: 1, h: 1 },
              ],
            },
          }),
        ],
      }),
    );
    await pressApprove("Con logos");
    await expect.element(notice(), WAIT).toMatchTextContent(/le falta 2 logos subidos de la PC/);
  });

  it("a request that is no longer open stops it", async () => {
    const { table } = await openStudio(asAdmin());
    await expect.element(page.getByRole("article")).toBeVisible();
    Object(table.rows[0]).estado = "privado";
    await pressApprove("Tarde");
    await expect.element(notice(), WAIT).toMatchTextContent(/ese diseño ya no está pedido/);
  });

  it("a number with a file skips to the next one: an option that exists is never rewritten", async () => {
    const { bucketFiles, table } = await openStudio(
      asAdmin({
        intercept: (request) =>
          isUpload(request, ACTIVE_OF(10))
            ? jsonResponse(
                { statusCode: "409", error: "Duplicate", message: "already exists" },
                409,
              )
            : null,
      }),
    );
    await pressApprove("Otra");
    await expect.element(notice(), WAIT).toMatchTextContent(/^Publicado/);
    expect(bucketFiles[ACTIVE_OF(10)]).toBeUndefined();
    expect(bucketFiles[ACTIVE_OF(11)]).toBeDefined();
    expect(table.rows[0]).toMatchObject({ opcion_publicada: 11 });
  });

  it("another failure on reserving the number stops it", async () => {
    const { table } = await openStudio(
      asAdmin({
        intercept: (request) =>
          isUpload(request, ACTIVE_OF(10))
            ? jsonResponse({ statusCode: "403", error: "Forbidden", message: "not allowed" }, 403)
            : null,
      }),
    );
    await pressApprove("Otra");
    await expect.element(notice(), WAIT).toMatchTextContent(/^No se pudo publicar:/);
    expect(table.rows[0]?.estado).toBe("pedido");
  });

  it("a request cancelled while it was being drawn creates nothing, and leaves nothing behind", async () => {
    const opened = await openStudio(
      asAdmin({
        intercept: ({ path, query }) => {
          if (path === "/rest/v1/flyer_disenos" && query.get("select") === "estado") {
            Object(opened.table.rows[0]).estado = "privado";
          }
          return null;
        },
      }),
    ).catch(() => {
      throw new Error("It did not open");
    });
    await pressApprove("Tarde");
    await expect.element(notice(), WAIT).toMatchTextContent(/no se creó el flyer/);
    const { harness, bucketFiles } = opened;
    expect(uploads(harness)).not.toContain("_opciones.json");
    expect(bucketFiles["_opciones.json"]).toEqual(flyerFiles()["_opciones.json"]);
    await vi.waitFor(() => {
      expect(harness.network.to("/storage/v1/object/flyers", "DELETE")[0]?.body).toMatchObject({
        prefixes: expect.arrayContaining([ACTIVE_OF(10), "_legal10.json"]),
      });
    });
  });

  it("a list of flyers that could not be read stops it: saving would step on all of them", async () => {
    let isCut = false;
    const { harness } = await openStudio(
      asAdmin({
        intercept: ({ path, method }) =>
          isCut && method === "GET" && path.endsWith("/_opciones.json")
            ? jsonResponse({}, 503)
            : null,
      }),
    );
    await expect.element(page.getByRole("article")).toBeVisible();
    isCut = true;
    await pressApprove("Sin lista");
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("No se pudo publicar: no se pudo leer la lista de flyers");
    expect(uploads(harness)).not.toContain("_opciones.json");
  });

  it("a list that does not keep it is tried again and, if it is still not there, says so", async () => {
    const { harness } = await openStudio(
      asAdmin({
        intercept: (request) =>
          isUpload(request, "_opciones.json") ? jsonResponse({ Key: "ignored" }) : null,
      }),
    );
    await pressApprove("No queda");
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("No se pudo publicar: la opción nueva no quedó guardada");
    expect(harness.network.to("/storage/v1/object/flyers/_opciones.json")).toHaveLength(2);
  });

  it("a list that cannot be saved says so", async () => {
    await openStudio(
      asAdmin({
        intercept: (request) =>
          isUpload(request, "_opciones.json")
            ? jsonResponse({ statusCode: "500", error: "x", message: "no" }, 500)
            : null,
      }),
    );
    await pressApprove("No guarda");
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("No se pudo publicar: no se pudo guardar la opción nueva");
  });

  it("permissions that could not be saved are told, and the rest stays", async () => {
    const { table } = await openStudio(
      asAdmin({
        intercept: (request) =>
          isUpload(request, "_facultades.json")
            ? jsonResponse({ statusCode: "500", error: "x", message: "no" }, 500)
            : null,
      }),
    );
    await pressApprove("Sin permisos");
    await expect.element(notice(), WAIT).toMatchTextContent(/Revisá en Facultades quién lo ve\.$/);
    expect(table.rows[0]?.estado).toBe("publicado");
  });

  it("permissions that could not be read do not overwrite everybody's", async () => {
    let isCut = false;
    const { harness } = await openStudio(
      asAdmin({
        intercept: ({ path, method }) =>
          isCut && method === "GET" && path.endsWith("/_facultades.json")
            ? jsonResponse({}, 503)
            : null,
      }),
    );
    await expect.element(page.getByRole("article")).toBeVisible();
    isCut = true;
    await pressApprove("Sin leer");
    await expect.element(notice(), WAIT).toMatchTextContent(/Revisá en Facultades quién lo ve\.$/);
    expect(uploads(harness)).not.toContain("_facultades.json");
  });

  it("a design that could not be marked says the flyer exists, and sends no mail", async () => {
    const { harness } = await openStudio(
      asAdmin({
        intercept: ({ path, method, query }) =>
          path === "/rest/v1/flyer_disenos" && method === "PATCH" && query.has("estado")
            ? jsonResponse({ code: "PGRST116", message: "no rows" }, 406)
            : null,
      }),
    );
    await pressApprove("A medias");
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent(/Se creó el flyer «A medias» \(opción 10\)/);
    expect(harness.adminCalls()).toEqual([]);
  });

  it("the second press while it publishes does nothing", async () => {
    const { harness } = await openStudio(
      asAdmin({
        intercept: async (request) => {
          if (isUpload(request, ACTIVE_OF(10))) {
            await new Promise((resolve) => {
              setTimeout(resolve, 600);
            });
          }
          return null;
        },
      }),
    );
    await pressApprove("Una");
    await pressApprove("Dos");
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent("Ya hay una publicación en curso. Esperá a que termine.");
    await expect.element(notice(), WAIT).toMatchTextContent(/^Publicado: «Una»/);
    expect(harness.network.to("/storage/v1/object/flyers/_active10.json")).toHaveLength(1);
    expect(harness.network.to("/storage/v1/object/flyers/_active11.json")).toHaveLength(0);
  });

  it("a design without amounts is born as the version without cashback of the original", async () => {
    const { bucketFiles } = await openStudio(
      asAdmin({
        designs: [requested({ datos: { recortes: [{ y: 0, h: 880 }] } })],
        files: {
          "_active9.json": {
            ...flyerFiles()["_active9.json"],
            cfg: { imgW: 800, imgH: 900, montos: { y: 200 }, cashback: { y: 200 } },
          },
        },
      }),
    );
    await pressApprove("Sin importes");
    await expect.element(notice(), WAIT).toMatchTextContent(/^Publicado/);
    expect(bucketFiles["_opciones.json"]).toMatchObject({
      opts: expect.arrayContaining([expect.objectContaining({ n: 10, sinCB: 9 })]),
    });
  });

  it("a legal text that could not be read is an empty one, and a flyer without calibration has none", async () => {
    const { bucketFiles } = await openStudio(
      asAdmin({
        designs: [requested({ datos: { recortes: [CUT], legal: "  " } })],
        files: {
          "_active9.json": { imageUrl: flyerFiles()["_active9.json"].imageUrl },
          "_legal9.json": "un texto suelto",
        },
      }),
    );
    await pressApprove("Sin legal");
    await expect.element(notice(), WAIT).toMatchTextContent(/^Publicado/);
    expect(bucketFiles["_legal10.json"]).toMatchObject({ text: "" });
  });

  it("a flyer that cannot be painted gives its reason", async () => {
    await openStudio(
      asAdmin({ files: { "_active9.json": { imageUrl: "data:image/png;base64,AAAA" } } }),
    );
    await pressApprove("Roto");
    await expect
      .element(notice(), WAIT)
      .toHaveTextContent("No se pudo publicar: no se pudo bajar la imagen del flyer base");
  });

  it("a failure of the network gives its reason", async () => {
    await openStudio(
      asAdmin({
        intercept: ({ path, query }) => {
          if (path === "/rest/v1/flyer_disenos" && query.get("select")?.startsWith("id,datos")) {
            throw new TypeError("Failed to fetch");
          }
          return null;
        },
      }),
    );
    await pressApprove("Sin red");
    await expect
      .element(notice(), WAIT)
      .toHaveTextContent("No se pudo publicar: sin conexión. Probá de nuevo.");
  });

  it("a section that does not arrive stops it: it would come out with a gap", async () => {
    const { table, harness } = await openStudio(asAdmin());
    await expect.element(page.getByRole("article")).toBeVisible();
    const section = {
      u: `${harness.url}/storage/v1/object/public/flyers/fuente_1.jpg`,
      sy: 0,
      sh: 100,
      sw: 800,
      pad: 0,
    };
    Object(table.rows[0]).datos = { recortes: [{ y: 300, h: 100, ins: section }] };
    await pressApprove("Con hueco");
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent(/no se pudo bajar una sección insertada/);
    expect(uploads(harness)).toEqual([]);
  });

  it("a list of watched brands that cannot be read does not stop it", async () => {
    const logo = {
      img: "marca.png",
      t: "Marca",
      x: 10,
      y: 10,
      w: 80,
      h: 40,
      tx: 10,
      ty: 10,
      tw: 80,
      th: 40,
      bg: "rgb(255,255,255)",
    };
    logos.failures = 1;
    const { table } = await openStudio(
      asAdmin({
        designs: [requested({ datos: { cambios: [logo] } })],
        intercept: ({ path, method }) =>
          method === "GET" && path.endsWith("/_vigilar.json") ? jsonResponse({}, 503) : null,
      }),
    );
    await pressApprove("Sin vigilar");
    await expect.element(notice(), WAIT).toMatchTextContent(/^Publicado/);
    expect(table.rows[0]?.estado).toBe("publicado");
  });

  it("the second read of the list failing leaves the permissions to be looked at", async () => {
    let reads = 0;
    await openStudio(
      asAdmin({
        intercept: ({ path, method }) => {
          if (method !== "GET" || !path.endsWith("/_opciones.json")) return null;
          reads += 1;
          // Entering and the publication read it twice before; the fifth is that of the permissions.
          return reads >= 5 ? jsonResponse({}, 503) : null;
        },
      }),
    );
    await expect.element(page.getByRole("article")).toBeVisible();
    await pressApprove("Lista cortada");
    await expect
      .element(notice(), WAIT)
      .toMatchTextContent(/No se pudo publicar|Revisá en Facultades/);
  });

  it("the calibration goes with what was there, a taken number by its status too", async () => {
    const { bucketFiles } = await openStudio(
      asAdmin({
        files: { "_flyer_cfgs.json": { "otro.jpg": { imgW: 1 } } },
        intercept: (request) =>
          isUpload(request, ACTIVE_OF(10))
            ? jsonResponse({ statusCode: "409", error: "Conflict", message: "conflict" }, 409)
            : null,
      }),
    );
    await pressApprove("Junto");
    await expect.element(notice(), WAIT).toMatchTextContent(/^Publicado/);
    expect(Object(bucketFiles["_flyer_cfgs.json"])["otro.jpg"]).toEqual({ imgW: 1 });
  });

  it("a number that stays taken every time gives up", async () => {
    const { harness } = await openStudio(
      asAdmin({
        intercept: ({ method, path }) =>
          method === "POST" && /_active\d+\.json$/.test(path)
            ? jsonResponse(
                { statusCode: "409", error: "Duplicate", message: "already exists" },
                409,
              )
            : null,
      }),
    );
    await pressApprove("Ninguno");
    await expect.element(notice(), WAIT).toMatchTextContent(/^No se pudo publicar:/);
    expect(uploads(harness).filter((name) => /^_active\d+\.json$/.test(name))).toHaveLength(6);
  });

  it("the logos of Promociones of the design are watched on the new option", async () => {
    const logo = {
      img: "marca.png",
      t: "Marca",
      x: 10,
      y: 10,
      w: 80,
      h: 40,
      tx: 10,
      ty: 10,
      tw: 80,
      th: 40,
      bg: "rgb(255,255,255)",
    };
    const { bucketFiles } = await openStudio(
      asAdmin({ designs: [requested({ datos: { cambios: [logo] } })] }),
    );
    await pressApprove("Vigilado");
    await expect.element(notice(), WAIT).toMatchTextContent(/^Publicado/);
    expect(bucketFiles["_vigilar.json"]).toMatchObject({
      opciones: { 10: [{ img: "marca.png", origen: "estudio" }] },
    });
  });
});
