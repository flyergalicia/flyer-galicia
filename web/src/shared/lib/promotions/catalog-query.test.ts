import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { Backend } from "@/shared/supabase/index.ts";
import { createInventedBackend } from "@/shared/supabase/testing/invented-backend.ts";
import { jsonResponse, type RecordedRequest } from "@/shared/supabase/testing/recording-fetch.ts";
import {
  catalogNeverUpdated,
  catalogReadNotice,
  type PromotionCatalog,
  promotionCatalogOptions,
  shownPromotions,
} from "./catalog-query.ts";

const GALICIA = {
  id: 1,
  titulo: "Coto",
  beneficio: "25%",
  fecha_hasta: "2099-01-01",
  provincias: [],
};
const MODO = {
  id: "a",
  titulo: "YPF",
  beneficio: "10%",
  fecha_hasta: "2099-01-01",
  provincias: null,
};
const META = {
  last_sync_at: "2026-10-30T12:00:00Z",
  total: 1,
  ubicaciones: [{ nombre: "MENDOZA" }],
};

type Answers = Partial<Record<"galicia" | "modo" | "meta", (request: RecordedRequest) => Response>>;

function backendAnswering({ galicia, modo, meta }: Answers): Backend {
  return createInventedBackend((request) => {
    const answers: Record<string, ((one: RecordedRequest) => Response) | undefined> = {
      "/rest/v1/promos_galicia_cache": galicia ?? (() => jsonResponse([GALICIA])),
      "/rest/v1/promos_modo_cache": modo ?? (() => jsonResponse([MODO])),
      "/rest/v1/promos_galicia_meta": meta ?? (() => jsonResponse(META)),
    };
    return answers[request.path]?.(request) ?? new Response(null, { status: 204 });
  }).backend;
}

function page(from: number, count: number) {
  return Array.from({ length: count }, (_, at) => ({ ...GALICIA, id: from + at }));
}

function read(answers: Answers = {}): Promise<PromotionCatalog> {
  return new QueryClient().fetchQuery(promotionCatalogOptions(backendAnswering(answers)));
}

const NOTHING: PromotionCatalog = {
  galicia: [],
  modo: [],
  all: [],
  meta: null,
  locations: [],
  failure: null,
};

describe("reading the catalog", () => {
  it("brings Galicia, MODO and how old it is", async () => {
    const catalog = await read();
    expect(catalog.galicia.map(({ id }) => id)).toEqual([1]);
    expect(catalog.modo.map(({ id }) => id)).toEqual(["m:a"]);
    expect(catalog.all).toHaveLength(2);
    expect(catalog.meta).toEqual({ last_sync_at: META.last_sync_at, total: 1 });
    expect(catalog.locations).toEqual([{ nombre: "MENDOZA", localidades: [] }]);
    expect(catalog.failure).toBeNull();
  });

  it("asks for the same columns as always, by pages in a stable order", async () => {
    const seen: URLSearchParams[] = [];
    await read({
      galicia: ({ query }) => {
        seen.push(query);
        return jsonResponse([GALICIA]);
      },
    });
    expect(seen[0]?.get("select")).toBe(
      "id,titulo,subtitulo,imagen,fecha_hasta,tipo_promocion,provincias,primera_vez,proximamente,fecha_desde,dias,beneficio",
    );
    expect(seen[0]?.get("order")).toBe("id.asc");
  });

  it("a catalog of more than a page arrives whole", async () => {
    let asked = 0;
    const { galicia } = await read({
      galicia: () => {
        asked += 1;
        return jsonResponse(asked === 1 ? page(0, 1000) : page(1000, 3));
      },
    });
    expect(galicia).toHaveLength(1003);
  });

  it("a failure is not an empty catalog (invariant 24)", async () => {
    const catalog = await read({
      galicia: () => jsonResponse({ message: "No hay permiso" }, 403),
    });
    expect(catalog.failure).toBe("No hay permiso");
    expect(catalog.galicia).toEqual([]);
    expect(catalogNeverUpdated(catalog)).toBe(false);
  });

  it("without the table of MODO, it goes on with Galicia", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const catalog = await read({
      modo: () => jsonResponse({ message: "does not exist", code: "42P01" }, 404),
    });
    expect(catalog.modo).toEqual([]);
    expect(catalog.all).toBe(catalog.galicia);
    expect(catalog.failure).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("without being able to read how old it is, it still has the promotions", async () => {
    const catalog = await read({
      meta: () => jsonResponse({ message: "se cortó" }, 500),
    });
    expect(catalog.meta).toBeNull();
    expect(catalog.locations).toEqual([]);
    expect(catalog.galicia).toHaveLength(1);
  });
});

describe("what can be seen", () => {
  it("follows the tick", async () => {
    const catalog = await read();
    expect(shownPromotions(catalog, true)).toBe(catalog.all);
    expect(shownPromotions(catalog, false)).toBe(catalog.galicia);
    expect(shownPromotions(undefined, true)).toEqual([]);
  });
});

describe("a catalog that was never updated", () => {
  it("is empty, with nothing that explains it", () => {
    expect(catalogNeverUpdated(NOTHING)).toBe(true);
    expect(catalogNeverUpdated({ ...NOTHING, meta: { last_sync_at: null, total: 0 } })).toBe(true);
    expect(catalogNeverUpdated({ ...NOTHING, meta: { last_sync_at: null, total: 5 } })).toBe(false);
    expect(catalogNeverUpdated({ ...NOTHING, galicia: [GALICIA] })).toBe(false);
  });
});

describe("what is said about a reading", () => {
  it("nothing when it went well", () => {
    expect(catalogReadNotice(NOTHING)).toBeNull();
    expect(
      catalogReadNotice({ ...NOTHING, galicia: [GALICIA], meta: { last_sync_at: null, total: 1 } }),
    ).toBeNull();
  });

  it("the failure", () => {
    expect(catalogReadNotice({ ...NOTHING, failure: "se cortó" })).toBe(
      "No se pudo leer el catálogo de promociones: se cortó",
    );
  });

  it("that it is incomplete, if the base says how many there are", () => {
    expect(
      catalogReadNotice({
        ...NOTHING,
        galicia: [GALICIA],
        failure: "se cortó",
        meta: { last_sync_at: null, total: 2 },
      }),
    ).toMatch(/incompleto \(1 de 2\)/);
  });

  it("that it should have rows, when nothing explains why it has none", () => {
    expect(catalogReadNotice({ ...NOTHING, meta: { last_sync_at: null, total: 3 } })).toMatch(
      /0 resultados pero debería haber 3/,
    );
  });
});
