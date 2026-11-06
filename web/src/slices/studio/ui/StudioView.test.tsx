// The tab Estudio over a simulated table: what each one sees and what each button does.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { DesignDeskWorks } from "@/shared/lib/studio/design-desk.ts";
import { ADVISOR } from "@/shared/lib/testing/app-harness.tsx";
import { type Answer, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { aDesign, ME, openStudio } from "../testing/studio-on-screen.ts";

const OTHER = "other-person";
const cards = () => page.getByTestId("design-card");
const FIRST_NAME = "Combustible con farmacias";
const card = (id: string) =>
  page.getByRole("article", { name: id === "a" ? FIRST_NAME : `Diseño ${id}`, exact: true });
const button = (id: string, name: string) => card(id).getByRole("button", { name, exact: true });
const notice = () => page.getByRole("status");
const field = () => page.getByTestId("text-window-field");
const windowButton = (name: string) =>
  page.getByRole("dialog").getByRole("button", { name, exact: true });
const confirm = (name: string) =>
  page.getByRole("alertdialog").getByRole("button", { name, exact: true });
// A list that is late, a while to see that nothing draws on its own, and what a change draws.
const PROPOSALS_LATE_MS = 1500;
const QUIET_MS = 400;
const FEW_DRAWS = 5;
const pause = (ms: number) =>
  new Promise((done) => {
    setTimeout(done, ms);
  });
/** As on a busy computer: each reading of the clock is a while after the one before. */
function busyClock() {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => (now += 1));
}
const buttonsOf = (id: string) =>
  Array.from(
    document.querySelectorAll(`[data-design="${id}"] button`),
    (element) => element.textContent,
  );

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the list", () => {
  it("shows each design with what it says and what can be done with it", async () => {
    await openStudio({
      designs: [
        aDesign("a", { nombre: FIRST_NAME, empresa: "Farmacias del Sur" }),
        aDesign("b", { estado: "rechazado", nota_admin: "Falta el logo" }),
        aDesign("c", { estado: "pedido" }),
        aDesign("d", { estado: "publicado", opcion_publicada: 9 }),
        aDesign("e", { estado: "publicado", opcion_publicada: 77 }),
        aDesign("f", { opcion: 77 }),
      ],
    });
    await expect.element(card("a")).toMatchTextContent("Combustible con farmacias");
    await expect.element(card("a")).toMatchTextContent("Farmacias del Sur");
    await expect.element(card("a")).toMatchTextContent(/Sobre «Combustible» · 22\/10\/2026/);
    await expect.element(card("f")).toMatchTextContent(/Sobre «opción 77»/);
    expect(buttonsOf("a")).toEqual(["Usar", "Ver completo", "Pedir que se publique", "Borrar"]);
    expect(buttonsOf("b")).toEqual(["Usar", "Ver completo", "Volver a pedir", "Borrar"]);
    await expect.element(card("b")).toMatchTextContent("Falta el logo");
    expect(buttonsOf("c")).toEqual(["Usar", "Ver completo", "Cancelar pedido", "Borrar"]);
    expect(buttonsOf("d")).toEqual(["Usar", "Ver completo", "Ir al flyer publicado"]);
    expect(buttonsOf("e")).toEqual(["Usar", "Ver completo"]);
    await expect.element(card("d")).toMatchTextContent("Publicado como «Combustible»");
  });

  it("reads again on showing the screen", async () => {
    const { table, show, harness } = await openStudio({ isActive: false });
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/flyer_disenos", "GET").length).toBeGreaterThan(0);
    });
    table.rows = [aDesign("late")];
    await show(true);
    await expect.element(card("late")).toBeVisible();
  });

  it("says so when it could not be read: it is not an empty list", async () => {
    await openStudio({
      tables: {
        flyer_disenos: ({ query }) =>
          query.has("user_id")
            ? jsonResponse([])
            : jsonResponse({ message: "permission denied by policy" }, 403),
      },
    });
    await expect
      .element(page.getByTestId("studio-failure"))
      .toHaveTextContent("No se pudieron leer los diseños: no tenés permiso para hacer eso.");
    expect(document.querySelector('[data-testid="design-card"]')).toBeNull();
  });

  it("with nothing there it says how to get something", async () => {
    await openStudio();
    await expect.element(page.getByText("Todavía no hay diseños.")).toBeVisible();
  });

  it("the search goes by name, company and author", async () => {
    await openStudio({
      designs: [aDesign("a", { nombre: "Primero" }), aDesign("b", { empresa: "ACME" })],
    });
    await page.getByRole("searchbox", { name: "Buscar por nombre o empresa" }).fill("acmé");
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-testid="design-card"]')).toHaveLength(1);
    });
    await page.getByRole("searchbox", { name: "Buscar por nombre o empresa" }).fill("nada de nada");
    await expect.element(page.getByText("No hay diseños con ese nombre.")).toBeVisible();
  });

  it("an administrator has filters, and opens on the requests while one is waiting", async () => {
    await openStudio({
      role: "admin",
      designs: [
        aDesign("mine"),
        aDesign("waiting", { user_id: OTHER, estado: "pedido", autor: "Otra" }),
        aDesign("asked", { user_id: OTHER, estado: "consulta" }),
      ],
    });
    await expect.element(card("waiting")).toBeVisible();
    await expect.element(card("waiting")).toMatchTextContent("de Otra");
    await expect.element(card("asked")).toMatchTextContent("Esperando respuesta");
    expect(buttonsOf("asked")).toEqual([
      "Usar",
      "Ver completo",
      "Aprobar y publicar",
      "Otra pregunta",
      "No aprobar",
      "Compartir",
      "Borrar",
    ]);
    expect(document.querySelector('[data-design="mine"]')).toBeNull();
    const filters = page.getByTestId("studio-filters").getByRole("tab");
    await expect.element(filters.nth(0)).toHaveTextContent("Mis diseños 1");
    await expect.element(filters.nth(1)).toHaveTextContent("Todos 3");
    await expect.element(filters.nth(2)).toHaveTextContent("Pedidos 2");
    await filters.nth(0).click();
    await expect.element(card("mine")).toBeVisible();
    await filters.nth(2).click();
    await expect.element(card("asked")).toBeVisible();
    await filters.nth(1).click();
    await expect.element(cards().nth(2)).toBeVisible();
  });

  it("with no request waiting an administrator opens on their own, and says when there are none", async () => {
    await openStudio({ role: "admin", designs: [aDesign("mine")] });
    await expect.element(card("mine")).toBeVisible();
    await page.getByTestId("studio-filters").getByRole("tab").nth(2).click();
    await expect.element(page.getByText("No hay pedidos pendientes.")).toBeVisible();
  });

  it("opens while the proposals are on their way, and is drawn again only when something changes", async () => {
    busyClock();
    const { draws } = await openStudio({
      role: "admin",
      underHeader: true,
      designs: [aDesign("waiting", { user_id: OTHER, estado: "pedido" })],
      intercept: async ({ query }) => {
        if (query.get("tipo") === "eq.fuente") await pause(PROPOSALS_LATE_MS);
        return null;
      },
    });
    await expect.element(card("waiting")).toBeVisible();
    await expect.element(page.getByTestId("header-requests")).toHaveTextContent("1");
    const before = draws();
    await pause(QUIET_MS);
    expect(draws() - before).toBeLessThan(FEW_DRAWS);
    await expect.element(page.getByTestId("flyers-to-copy")).toBeVisible();
  });

  it("whoever only received a copy waits for no proposals, and is not drawn again and again", async () => {
    busyClock();
    const { draws } = await openStudio({
      underHeader: true,
      permissions: { estudio: false, opcion_9: true },
      designs: [aDesign("copy", { compartido_por: "Admin Inventado" })],
    });
    await expect.element(card("copy")).toBeVisible();
    const before = draws();
    await pause(QUIET_MS);
    expect(draws() - before).toBeLessThan(FEW_DRAWS);
  });

  it("whoever only received a copy can use it, not ask for anything, and has no sections", async () => {
    await openStudio({
      permissions: { estudio: false, opcion_9: true },
      designs: [
        aDesign("copy", {
          compartido_por: "Admin Inventado",
          compartido_at: "2026-10-23T15:00:00.000Z",
        }),
      ],
    });
    await expect
      .element(card("copy"))
      .toMatchTextContent(/Te lo compartió Admin Inventado el 23\/10/);
    expect(buttonsOf("copy")).toEqual(["Usar", "Ver completo", "Borrar"]);
    await expect.element(page.getByTestId("studio-intro")).toMatchTextContent(/te compartió/);
    expect(document.querySelector('[data-testid="studio-saved-sets"]')).toBeNull();
    expect(document.querySelector('[data-testid="flyers-to-copy"]')).toBeNull();
  });

  it("an administrator is told which copy is whose", async () => {
    await openStudio({
      role: "admin",
      designs: [aDesign("copy", { user_id: OTHER, compartido_por: "Admin" })],
    });
    await page.getByTestId("studio-filters").getByRole("tab").nth(1).click();
    await expect.element(card("copy")).toMatchTextContent("Copia compartida por Admin");
  });
});

function message(diseno_id: string, rol: string, texto: string) {
  return {
    diseno_id,
    rol,
    tipo: rol === "admin" ? "consulta" : "respuesta",
    texto,
    autor_nombre: rol === "admin" ? "Admin" : "",
    created_at: "2026-10-22T15:00:00.000Z",
  };
}

/** The session reads its own profile from the same table. */
function profilesAnswer(list: readonly object[] | null): Answer {
  return ({ query }) => {
    if (query.has("id")) return jsonResponse({ ...ADVISOR, role: "admin" });
    return list ? jsonResponse(list) : jsonResponse({ message: "Failed to fetch" }, 500);
  };
}

describe("the conversation", () => {
  it("shows on an open request, and goes away once it is resolved", async () => {
    await openStudio({
      designs: [
        aDesign("open", { estado: "consulta" }),
        aDesign("closed", { estado: "rechazado" }),
      ],
      messages: [
        message("open", "admin", "¿De qué fecha es?"),
        message("open", "autor", "De hoy"),
        message("closed", "admin", "Vieja"),
      ],
    });
    await expect
      .element(card("open"))
      .toMatchTextContent("Pregunta del administrador · 22/10/2026");
    await expect.element(card("open")).toMatchTextContent("Respuesta de el autor");
    await expect.element(card("open")).toMatchTextContent("Te hicieron una pregunta");
    expect(document.querySelector('[data-design="closed"] [data-part="message"]')).toBeNull();
    expect(buttonsOf("open")).toEqual([
      "Usar",
      "Ver completo",
      "Responder",
      "Cancelar pedido",
      "Borrar",
    ]);
  });

  it("the administrator asks, and the author answers", async () => {
    const { harness, table } = await openStudio({
      role: "admin",
      designs: [aDesign("d", { user_id: OTHER, estado: "pedido", autor: "Otra" })],
      rpc: () => {
        table_row().estado = "consulta";
        return new Response(null, { status: 204 });
      },
    });
    function table_row() {
      return Object(table.rows[0]);
    }
    await button("d", "Preguntar").click();
    await expect.element(page.getByText(/Le llega a Otra en su Estudio/)).toBeVisible();
    await windowButton("Enviar pregunta").click();
    await expect.element(notice()).toMatchTextContent("Escribí la pregunta.");
    await button("d", "Preguntar").click();
    await field().fill("¿Seguro?");
    await windowButton("Enviar pregunta").click();
    await expect
      .element(notice())
      .toMatchTextContent("Pregunta enviada. Te aviso acá cuando responda.");
    expect(harness.network.to("/rest/v1/rpc/flyer_diseno_consultar")[0]?.body).toEqual({
      p_id: "d",
      p_texto: "¿Seguro?",
    });
    await expect.element(card("d")).toMatchTextContent("Esperando respuesta");
    // Asking mails nobody: the question reaches the author in their Estudio.
    expect(harness.adminCalls()).toEqual([]);
  });

  it("an answer that fails says so", async () => {
    await openStudio({
      designs: [aDesign("d", { estado: "consulta" })],
      rpc: () => jsonResponse({ message: "Ese diseño no tiene una pregunta abierta" }, 400),
    });
    await button("d", "Responder").click();
    await windowButton("Enviar respuesta").click();
    await expect.element(notice()).toMatchTextContent("Escribí la respuesta.");
    await button("d", "Responder").click();
    await field().fill("Sí");
    await windowButton("Enviar respuesta").click();
    await expect.element(notice()).toMatchTextContent(/^No se pudo:/);
  });

  it("cancelling the window asks nothing", async () => {
    const { harness } = await openStudio({
      designs: [aDesign("d", { estado: "consulta" })],
    });
    await button("d", "Responder").click();
    await windowButton("Cancelar").click();
    expect(harness.network.to("/rest/v1/rpc/")).toEqual([]);
  });

  it("a successful answer says it went to the administrator", async () => {
    await openStudio({
      designs: [aDesign("d", { estado: "consulta" })],
      rpc: () => new Response(null, { status: 204 }),
    });
    await button("d", "Responder").click();
    await field().fill("Sí");
    await windowButton("Enviar respuesta").click();
    await expect.element(notice()).toMatchTextContent("Respuesta enviada al administrador.");
  });
});

describe("what the author does", () => {
  it("asking to publish it tells the administrator by mail", async () => {
    const { table, harness } = await openStudio({ designs: [aDesign("d")] });
    await button("d", "Pedir que se publique").click();
    await expect
      .element(page.getByRole("alertdialog"))
      .toMatchTextContent(/al lado de «Combustible»/);
    await confirm("Pedir").click();
    await expect
      .element(notice())
      .toMatchTextContent("Pedido enviado. Te vas a enterar acá cuando lo revise.");
    expect(table.rows[0]?.estado).toBe("pedido");
    await vi.waitFor(() => {
      expect(harness.adminCalls()).toContainEqual({ action: "notify_estudio_pedido", id: "d" });
    });
  });

  it("saying no to the question changes nothing", async () => {
    const { table } = await openStudio({ designs: [aDesign("d")] });
    await button("d", "Pedir que se publique").click();
    await confirm("Cancelar").click();
    expect(table.rows[0]?.estado).toBe("privado");
  });

  it("cancelling a request that changed meanwhile does not step on it", async () => {
    const { table } = await openStudio({ designs: [aDesign("d", { estado: "pedido" })] });
    await expect.element(button("d", "Cancelar pedido")).toBeVisible();
    Object(table.rows[0]).estado = "publicado";
    await button("d", "Cancelar pedido").click();
    await expect
      .element(notice())
      .toMatchTextContent("Ese diseño cambió mientras tanto. Te muestro cómo quedó.");
    expect(table.rows[0]?.estado).toBe("publicado");
    await expect.element(card("d")).toMatchTextContent("Publicado");
  });

  it("cancelling a request that is open", async () => {
    const { table } = await openStudio({ designs: [aDesign("d", { estado: "pedido" })] });
    await button("d", "Cancelar pedido").click();
    await expect.element(notice()).toMatchTextContent("Pedido cancelado.");
    expect(table.rows[0]?.estado).toBe("privado");
  });

  it("a failure on changing it says so", async () => {
    await openStudio({
      designs: [aDesign("d", { estado: "pedido" })],
      tables: {
        flyer_disenos: ({ method, query }) =>
          method === "PATCH"
            ? jsonResponse({ message: "row-level security" }, 403)
            : jsonResponse(query.has("user_id") ? [] : [aDesign("d", { estado: "pedido" })]),
      },
    });
    await button("d", "Cancelar pedido").click();
    await expect
      .element(notice())
      .toMatchTextContent("No se pudo: no tenés permiso para hacer eso.");
  });

  it("deleting it asks first, closes its tab and says what stays", async () => {
    const { table, works } = await openStudio({
      designs: [aDesign("d"), aDesign("p", { estado: "publicado" })],
      role: "admin",
    });
    await page.getByTestId("studio-filters").getByRole("tab").nth(1).click();
    await button("p", "Borrar").click();
    await expect.element(page.getByRole("alertdialog")).toMatchTextContent(/NO se borra/);
    await confirm("Cancelar").click();
    await button("d", "Borrar").click();
    await expect.element(page.getByRole("alertdialog")).toMatchTextContent("No se puede deshacer.");
    await confirm("Borrar").click();
    await expect.element(notice()).toMatchTextContent("Diseño borrado.");
    expect(table.rows.map(({ id }) => id)).toEqual(["p"]);
    expect(works.closeDesign).toHaveBeenCalledWith("d");
    expect(document.querySelector('[data-design="d"]')).toBeNull();
  });

  it("a delete that fails says so", async () => {
    await openStudio({
      designs: [aDesign("d")],
      tables: {
        flyer_disenos: ({ method, query }) => {
          if (method === "DELETE") return jsonResponse({ message: "Failed to fetch" }, 500);
          return jsonResponse(query.has("user_id") ? [] : [aDesign("d")]);
        },
      },
    });
    await button("d", "Borrar").click();
    await confirm("Borrar").click();
    await expect
      .element(notice())
      .toMatchTextContent("No se pudo borrar: sin conexión. Probá de nuevo.");
  });
});

describe("Usar", () => {
  it("asks the editor to open it, with what is saved", async () => {
    const opened: unknown[] = [];
    const { works } = await openStudio({
      designs: [aDesign("d", { empresa: "ACME", base_name: "flyer_t9.jpg" })],
      desk: {
        openDesign: vi.fn<DesignDeskWorks["openDesign"]>(async (load) => {
          opened.push(await load());
        }),
      },
    });
    await button("d", "Usar").click();
    await expect.element(notice()).toMatchTextContent("Abriendo «Diseño d»…");
    await vi.waitFor(() => {
      expect(works.openDesign).toHaveBeenCalled();
      expect(opened).toHaveLength(1);
    });
    expect(opened[0]).toMatchObject({
      id: "d",
      name: "Diseño d",
      company: "ACME",
      option: 9,
      mine: true,
      shared: false,
      baseName: "flyer_t9.jpg",
    });
  });

  it("a flyer that no longer exists, or that this person does not have, is said", async () => {
    await openStudio({
      designs: [aDesign("gone", { opcion: 77 }), aDesign("other", { opcion: 5 })],
    });
    await button("gone", "Usar").click();
    await expect
      .element(notice())
      .toMatchTextContent("El flyer sobre el que se armó este diseño ya no existe.");
    await button("other", "Usar").click();
    await expect
      .element(notice())
      .toMatchTextContent(
        "No tenés habilitado el flyer «Rubro Uno», que es la base de este diseño.",
      );
  });

  it("a copy from the administrator opens without that flyer: sharing is permission for it", async () => {
    const opened: { shared: boolean }[] = [];
    await openStudio({
      designs: [aDesign("c", { opcion: 5, compartido_por: "Admin" })],
      desk: {
        openDesign: vi.fn<DesignDeskWorks["openDesign"]>(async (load) => {
          opened.push(await load());
        }),
      },
    });
    await button("c", "Usar").click();
    await vi.waitFor(() => {
      expect(opened[0]?.shared).toBe(true);
    });
  });

  it("if it cannot be read it says so", async () => {
    await openStudio({
      designs: [aDesign("d")],
      desk: {
        openDesign: vi.fn<DesignDeskWorks["openDesign"]>(() =>
          Promise.reject(new Error("Failed to fetch")),
        ),
      },
    });
    await button("d", "Usar").click();
    await expect
      .element(notice())
      .toMatchTextContent("No se pudo abrir el diseño: sin conexión. Probá de nuevo.");
  });
});

describe("Ir al flyer publicado", () => {
  it("goes there if the profile has it", async () => {
    const { works } = await openStudio({
      designs: [
        aDesign("d", { estado: "publicado", opcion_publicada: 9 }),
        aDesign("e", { estado: "publicado", opcion_publicada: 5 }),
      ],
    });
    await button("d", "Ir al flyer publicado").click();
    expect(works.showFlyer).toHaveBeenCalledWith(9);
    await button("e", "Ir al flyer publicado").click();
    await expect
      .element(notice())
      .toMatchTextContent("Ese flyer no está habilitado para tu perfil.");
  });
});

describe("Ver completo", () => {
  it("shows the whole design, and the administrator can approve from there", async () => {
    await openStudio({
      role: "admin",
      designs: [
        aDesign("d", {
          user_id: OTHER,
          estado: "pedido",
          datos: { cambios: [], recortes: [{ y: 300, h: 100 }], subidos: {} },
        }),
      ],
    });
    await button("d", "Ver completo").click();
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-testid="flyer-viewer"] canvas')?.getAttribute("height"),
      ).toBe("800");
    });
    await page.getByRole("dialog").getByRole("button", { name: "Aprobar y publicar" }).click();
    await expect.element(field()).toHaveValue("Diseño d");
    await windowButton("Cancelar").click();
  });

  it("closes with Cerrar, and the author has no approve there", async () => {
    await openStudio({
      designs: [aDesign("d", { datos: { recortes: [{ y: 300, h: 100 }] } })],
    });
    await button("d", "Ver completo").click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="flyer-viewer"] canvas')).not.toBeNull();
    });
    await expect
      .element(page.getByRole("dialog").getByRole("button", { name: "Aprobar y publicar" }))
      .not.toBeInTheDocument();
    await page.getByTestId("viewer-close").click();
    await expect.element(page.getByTestId("flyer-viewer")).not.toBeInTheDocument();
  });

  it("a design without changes, or whose flyer is gone, says so", async () => {
    await openStudio({ designs: [aDesign("d"), aDesign("gone", { opcion: 77 })] });
    await button("d", "Ver completo").click();
    await expect
      .element(notice())
      .toMatchTextContent("No se pudo armar la vista completa: el diseño no tiene cambios");
    await button("gone", "Ver completo").click();
    await expect.element(notice()).toMatchTextContent("El flyer base de este diseño ya no existe.");
  });
});

describe("No aprobar", () => {
  it("keeps the note and mails the author", async () => {
    const { table, harness } = await openStudio({
      role: "admin",
      designs: [aDesign("d", { user_id: OTHER, estado: "pedido" })],
    });
    await button("d", "No aprobar").click();
    await field().fill("Falta el logo");
    await windowButton("No aprobar").click();
    await expect.element(notice()).toMatchTextContent("Listo: no aprobado.");
    expect(table.rows[0]).toMatchObject({ estado: "rechazado", nota_admin: "Falta el logo" });
    await vi.waitFor(() => {
      expect(harness.adminCalls()).toContainEqual({
        action: "notify_estudio",
        id: "d",
        que: "resuelto",
      });
    });
  });

  it("cancelling leaves it as it was", async () => {
    const { table, harness } = await openStudio({
      role: "admin",
      designs: [aDesign("d", { user_id: OTHER, estado: "pedido" })],
    });
    await button("d", "No aprobar").click();
    await userEvent.keyboard("{Escape}");
    await expect.element(field()).not.toBeInTheDocument();
    expect(table.rows[0]?.estado).toBe("pedido");
    expect(harness.adminCalls()).toEqual([]);
  });
});

describe("Compartir", () => {
  const people = [
    { id: ME, full_name: "Yo", email: "yo@x", role: "admin", status: "active" },
    { id: OTHER, full_name: "El Autor", email: "a@x", role: "asesor", status: "active" },
    { id: "h", full_name: "Hunter", email: "h@x", role: "hunter", status: "active" },
    { id: "l", full_name: "Líder", email: "l@x", role: "lider", status: "active" },
    { id: "p", full_name: "Pendiente", email: "p@x", role: "asesor", status: "pending" },
    { id: "v", full_name: " ", email: "vip@x", role: "vip", status: "active" },
    { id: "z", full_name: "Zoe", email_asesor: "z@x", role: "otro", status: "active" },
    { id: "n", full_name: "", role: "prospect", status: "active" },
  ];
  const designs = () => [
    aDesign("d", { user_id: OTHER, estado: "privado" }),
    aDesign("copy", { user_id: "z", compartido_de: "d", compartido_por: "Yo" }),
  ];
  const openWindow = async (answer: () => Response) => {
    const opened = await openStudio({
      role: "admin",
      designs: designs(),
      rpc: answer,
      tables: { profiles: profilesAnswer(people) },
    });
    await page.getByTestId("studio-filters").getByRole("tab").nth(1).click();
    await button("d", "Compartir").click();
    await expect.element(page.getByTestId("share-person").first()).toBeVisible();
    return opened;
  };

  it("lists whoever can receive it, not the author nor who only sees a list", async () => {
    await openWindow(() => jsonResponse({}));
    const names = Array.from(
      document.querySelectorAll('[data-testid="share-person"] [data-part="name"]'),
      (name) => name.textContent,
    );
    expect(names).toEqual([
      "(sin nombre)",
      "vip@x",
      "Zoe ya tiene una copia: se le reemplaza por esta versión",
    ]);
    await expect.element(page.getByTestId("share-confirm")).toBeDisabled();
    await page.getByRole("searchbox", { name: "Buscar por nombre o mail" }).fill("nadie");
    await expect.element(page.getByText("Nadie con ese nombre.")).toBeVisible();
    await page.getByRole("searchbox", { name: "Buscar por nombre o mail" }).fill("VIP");
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-testid="share-person"]')).toHaveLength(1);
    });
  });

  it("sends a copy to each one and tells what happened", async () => {
    const { harness } = await openWindow(() =>
      jsonResponse({
        nuevos: ["Vip"],
        actualizados: ["Zoe"],
        salteados: [{ nombre: "Otro", motivo: "ya lo tiene y pidió publicarlo" }],
      }),
    );
    await page.getByTestId("share-person").nth(1).getByRole("checkbox").click();
    await expect
      .element(page.getByTestId("share-confirm"))
      .toHaveTextContent("Compartir con 1 persona");
    await page.getByTestId("share-person").nth(2).getByRole("checkbox").click();
    await expect
      .element(page.getByTestId("share-confirm"))
      .toHaveTextContent("Compartir con 2 personas");
    await page.getByTestId("share-person").nth(2).getByRole("checkbox").click();
    await page.getByTestId("share-person").nth(2).getByRole("checkbox").click();
    await page.getByTestId("share-confirm").click();
    await expect
      .element(notice())
      .toMatchTextContent(
        "Compartido con Vip. Zoe ya lo tenía: le llegó esta versión. No se compartió con Otro (ya lo tiene y pidió publicarlo).",
      );
    expect(harness.network.to("/rest/v1/rpc/flyer_diseno_compartir")[0]?.body).toEqual({
      p_id: "d",
      p_para: ["v", "z"],
    });
    await vi.waitFor(() => {
      expect(harness.adminCalls()).toContainEqual({
        action: "notify_estudio",
        id: "d",
        que: "compartido",
      });
    });
  });

  it("with nobody new it does not mail", async () => {
    const { harness } = await openWindow(() => jsonResponse({ salteados: [] }));
    await page.getByTestId("share-person").first().getByRole("checkbox").click();
    await page.getByTestId("share-confirm").click();
    await expect.element(notice()).toMatchTextContent("Listo.");
    expect(harness.adminCalls()).toEqual([]);
  });

  it("a failure says so and the window stays", async () => {
    await openWindow(() => jsonResponse({ message: "Failed to fetch" }, 500));
    await page.getByTestId("share-person").first().getByRole("checkbox").click();
    await page.getByTestId("share-confirm").click();
    await expect.element(notice()).toMatchTextContent(/^No se pudo compartir:/);
    await expect.element(page.getByTestId("share-confirm")).toBeEnabled();
    await windowButton("Cancelar").click();
    await expect.element(page.getByTestId("share-people")).not.toBeInTheDocument();
  });

  it("a list of people that could not be read is said, and nobody else", async () => {
    await openStudio({
      role: "admin",
      designs: designs(),
      tables: { profiles: profilesAnswer(null) },
    });
    await page.getByTestId("studio-filters").getByRole("tab").nth(1).click();
    await button("d", "Compartir").click();
    await expect
      .element(page.getByTestId("share-people"))
      .toMatchTextContent(/No se pudo leer la lista de personas/);
  });

  it("with no other person it says so", async () => {
    await openStudio({
      role: "admin",
      designs: designs(),
      tables: { profiles: profilesAnswer([]) },
    });
    await page.getByTestId("studio-filters").getByRole("tab").nth(1).click();
    await button("d", "Compartir").click();
    await expect.element(page.getByText("No hay otras personas activas.")).toBeVisible();
  });
});
