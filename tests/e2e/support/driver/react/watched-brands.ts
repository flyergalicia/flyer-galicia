// Admin → Config → Marcas vigiladas, as Promociones looks at it.
import { type Locator, type Page, type Route } from "@playwright/test";
import { type DesignLogo, type WatchedBrandView } from "../promotions.ts";

const WAIT_MS = 15_000;
const PUBLISH_WAIT_MS = 45_000;
const DESIGNS_TABLE = "**/rest/v1/flyer_disenos*";
const DESIGN_ID = "design-to-watch";
const UPLOADED_KEY = "pc:1:subido.png";

function panel(page: Page): Locator {
  return page.getByTestId("admin-panel");
}

function rows(page: Page): Locator {
  return panel(page).getByTestId("watched-row");
}

function readWatched(page: Page): Promise<WatchedBrandView[]> {
  return rows(page).evaluateAll((lines) =>
    lines.map((line) => ({
      brand: line.querySelector('[data-testid="watched-brand"]')?.textContent ?? "",
      status: line.querySelector('[data-testid="watched-state"]')?.textContent ?? "",
    })),
  );
}

async function openWatchedBrands(page: Page): Promise<WatchedBrandView[]> {
  if (!(await panel(page).isVisible())) {
    await page
      .getByRole("banner")
      .getByRole("button", { name: /^⚙ Admin/ })
      .click();
    await panel(page).waitFor({ timeout: WAIT_MS });
  }
  await panel(page)
    .getByRole("tablist", { name: "Pilares del panel" })
    .getByRole("tab", { name: "Config", exact: true })
    .click();
  await panel(page)
    .getByRole("tablist", { name: "Hojas de Config" })
    .getByRole("tab", { name: "Marcas vigiladas", exact: true })
    .click();
  await rows(page).first().waitFor({ timeout: WAIT_MS });
  return readWatched(page);
}

const PLACE = { x: 100, y: 2000, w: 150, h: 60, bg: "rgb(255,255,255)" };

/** Where each logo of the design is on the flyer: one under the other, in the same column. */
function placed(index: number, change: object): object {
  const y = PLACE.y + index * (PLACE.h + 10);
  return {
    ...PLACE,
    y,
    tx: PLACE.x,
    ty: y,
    tw: PLACE.w,
    th: PLACE.h,
    ox: PLACE.x,
    oy: y,
    ow: PLACE.w,
    oh: PLACE.h,
    ...change,
  };
}

/** What the logo editor saves for each kind of logo of a design. */
function changeOf(logo: DesignLogo, index: number): object {
  if (logo.kind === "text") {
    return placed(index, { tipo: "txt", texto: logo.text, fs: 20, peso: 700, color: "#000000" });
  }
  if (logo.kind === "catalogBrand") return placed(index, { img: logo.logoFile, t: logo.title });
  if (logo.kind === "uploaded") return placed(index, { img: UPLOADED_KEY, t: logo.title });
  return placed(index, { img: "orig:100,2000,150,60", t: logo.title });
}

function designRow(base: number, logos: readonly DesignLogo[], uploaded: string) {
  const now = new Date().toISOString();
  return {
    id: DESIGN_ID,
    user_id: "otra-persona",
    autor: "Otra Persona",
    nombre: "Diseño con marcas",
    empresa: "",
    opcion: base,
    base_name: "",
    miniatura: "",
    estado: "pedido",
    tipo: "diseno",
    nota_admin: "",
    opcion_publicada: null,
    pedido_at: now,
    revisado_at: null,
    created_at: now,
    updated_at: now,
    compartido_por: null,
    compartido_de: null,
    compartido_at: null,
    datos: {
      v: 1,
      cambios: logos.map(changeOf),
      subidos: { [UPLOADED_KEY]: uploaded },
      recortes: [],
      legal: "",
    },
  };
}

type DesignRow = ReturnType<typeof designRow>;

/** What the app changes on the design: its status and the option it was published as. */
function withChanges(row: DesignRow, changes: unknown): DesignRow {
  if (typeof changes !== "object" || changes === null) return row;
  const estado: unknown = Reflect.get(changes, "estado");
  return typeof estado === "string" ? { ...row, estado } : row;
}

/** The table answers with this design, asked for by someone; it changes as the app changes it. */
function answerDesign(row: DesignRow) {
  let current: DesignRow = row;
  return async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isThis = url.searchParams.get("id") === `eq.${DESIGN_ID}`;
    const method = request.method();
    if (method === "PATCH" && isThis) {
      current = withChanges(current, request.postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([current]),
      });
    } else if (method === "GET" && isThis) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(current),
      });
    } else if (method === "GET" && url.searchParams.get("tipo") === "eq.diseno") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Content-Range": "0-0/1" },
        body: JSON.stringify([current]),
      });
    } else await route.fallback();
  };
}

/** A small picture, as a logo uploaded from the computer is kept with its design. */
function uploadedPicture(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const graphics = canvas.getContext("2d");
    if (graphics) {
      graphics.fillStyle = "#0000ff";
      graphics.fillRect(0, 0, 8, 8);
    }
    return canvas.toDataURL("image/png");
  });
}

/**
 * What publishing a design from Estudio does to Marcas vigiladas, done for real: someone asked for a
 * design with these logos, and the administrator approves and publishes it.
 */
async function publishDesignWith(
  page: Page,
  base: number,
  logos: readonly DesignLogo[],
): Promise<void> {
  if (await panel(page).isVisible()) {
    await panel(page).getByRole("button", { name: "Cerrar", exact: true }).click();
    await panel(page).waitFor({ state: "detached", timeout: WAIT_MS });
  }
  const answer = answerDesign(designRow(base, logos, await uploadedPicture(page)));
  await page.route(DESIGNS_TABLE, answer);
  try {
    await page
      .getByRole("banner")
      .getByRole("tab", { name: /^Estudio/ })
      .click();
    const card = page.locator(`[data-testid="design-card"][data-design="${DESIGN_ID}"]`);
    await card.getByRole("button", { name: "Aprobar y publicar", exact: true }).click();
    const name = page.getByTestId("text-window-field");
    await name.waitFor({ timeout: WAIT_MS });
    await page.locator('dialog:has([data-testid="text-window-field"]) button').last().click();
    await page
      .getByRole("status")
      .filter({ hasText: /^(Publicado:|Se creó el flyer|No se pudo publicar)/ })
      .first()
      .waitFor({ timeout: PUBLISH_WAIT_MS });
  } finally {
    await page.unroute(DESIGNS_TABLE, answer);
  }
}

export function createWatchedBrands(page: Page) {
  return {
    openWatchedBrands: () => openWatchedBrands(page),
    closeWatchedBrands: async () => {
      await panel(page).getByRole("button", { name: "Cerrar", exact: true }).click();
      await panel(page).waitFor({ state: "detached", timeout: WAIT_MS });
    },
    stopWatchingFirstBrand: async () => {
      const before = await rows(page).count();
      await rows(page).first().getByRole("button", { name: "Dejar de vigilar" }).click();
      await page.waitForFunction(
        (count) =>
          document.querySelectorAll('[data-testid="admin-panel"] [data-testid="watched-row"]')
            .length === count,
        before - 1,
        { timeout: WAIT_MS },
      );
      return readWatched(page);
    },
    // The number of the new option is the one Estudio takes: the next free one.
    addDesignLogosToWatchedBrands: (base: number, _created: number, logos: DesignLogo[]) =>
      publishDesignWith(page, base, logos),
  };
}
