import { describe, expect, it, vi } from "vitest";
import { createInventedBackend } from "./testing/invented-backend.ts";
import { jsonResponse } from "./testing/recording-fetch.ts";

describe("bucket.readJson", () => {
  it("asks for it fresh every time", async () => {
    const { backend, network, url } = createInventedBackend(() => jsonResponse({ roles: {} }));
    vi.spyOn(Date, "now").mockReturnValueOnce(1234).mockReturnValueOnce(5678);

    await expect(backend.bucket.readJson("_facultades.json")).resolves.toEqual({
      ok: true,
      value: { roles: {} },
    });
    await backend.bucket.readJson("_facultades.json");
    vi.restoreAllMocks();

    const [first, second] = network.requests;
    expect(first?.url).toBe(`${url}/storage/v1/object/public/flyers/_facultades.json?t=1234`);
    expect(first?.init?.cache).toBe("no-cache");
    expect(second?.query.get("t")).toBe("5678");
  });

  it.each([404, 400])("%s means the file does not exist", async (status) => {
    const { backend } = createInventedBackend(() => jsonResponse({}, status));

    await expect(backend.bucket.readJson("_legal2.json")).resolves.toEqual({
      ok: false,
      error: { kind: "not-found", status },
    });
  });

  it.each([408, 429, 500, 503])("%s means it could not be fetched", async (status) => {
    const { backend } = createInventedBackend(() => jsonResponse({}, status));

    await expect(backend.bucket.readJson("_active9.json")).resolves.toEqual({
      ok: false,
      error: { kind: "unreachable", status },
    });
  });

  it("no answer at all means it could not be fetched", async () => {
    const { backend } = createInventedBackend(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(backend.bucket.readJson("_opciones.json")).resolves.toEqual({
      ok: false,
      error: { kind: "unreachable", status: null },
    });
  });

  it("a file that is not JSON is invalid", async () => {
    const { backend } = createInventedBackend(() => new Response("<html>", { status: 200 }));

    await expect(backend.bucket.readJson("_titulos.json")).resolves.toEqual({
      ok: false,
      error: { kind: "invalid", status: 200 },
    });
  });
});

describe("bucket names", () => {
  it("the compiler takes the names of the contract and refuses others", () => {
    const { backend } = createInventedBackend(() => jsonResponse({}));
    const accepted = (): unknown => [
      backend.bucket.readJson("_active.json"),
      backend.bucket.readJson("_active12.json"),
      backend.bucket.readJson("_legal3.json"),
      backend.bucket.publicUrl("flyer_1730000000000_op2.jpg"),
      backend.bucket.publicUrl("flyer_t1.jpg"),
      backend.bucket.publicUrl("fuente_1730000000000.jpg"),
      backend.bucket.publicUrl("modo/abc.png"),
      backend.bucket.upload("index_1730000000000.html", "x"),
      backend.bucket.upload("_active_img.png", "x"),
      backend.bucket.upload("_active4_img.jpg", "x"),
    ];
    const refused = (): unknown => [
      // @ts-expect-error not a file of the bucket
      backend.bucket.readJson("_otro.json"),
      // @ts-expect-error an image is not read as JSON
      backend.bucket.readJson("flyer_t1.jpg"),
      // @ts-expect-error not a name of the bucket
      backend.bucket.publicUrl("flyer.jpg"),
    ];
    expect([accepted, refused]).toHaveLength(2);
  });

  it("publicUrl is the address the current app builds", () => {
    const { backend, url } = createInventedBackend(() => jsonResponse({}));

    expect(backend.bucket.publicUrl("modo/123.png")).toBe(
      `${url}/storage/v1/object/public/flyers/modo/123.png`,
    );
  });
});

describe("bucket writes", () => {
  it("uploads to the bucket with its options", async () => {
    const { backend, network } = createInventedBackend(() => jsonResponse({ Key: "flyers/x" }));

    const result = await backend.bucket.upload(
      "_facultades.json",
      new Blob(["{}"], { type: "application/json" }),
      { contentType: "application/json", upsert: true },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    const [request] = network.to("/storage/v1/object/flyers/_facultades.json", "POST");
    expect(request?.headers.get("x-upsert")).toBe("true");
  });

  it("a refused upload says what the server said", async () => {
    const { backend } = createInventedBackend(() =>
      jsonResponse({ statusCode: "409", error: "Duplicate", message: "ya existe" }, 400),
    );

    await expect(backend.bucket.upload("flyer_t1.jpg", "x")).resolves.toEqual({
      ok: false,
      error: { kind: "rejected", status: 400, message: "ya existe" },
    });
  });

  it("a dropped connection is passing", async () => {
    const { backend } = createInventedBackend(() => {
      throw new TypeError("Failed to fetch");
    });

    const upload = await backend.bucket.upload("flyer_t1.jpg", "x");
    const list = await backend.bucket.list();
    const remove = await backend.bucket.remove(["flyer_t1.jpg"]);

    for (const result of [upload, list, remove]) {
      expect(!result.ok && result.error.kind).toBe("transient");
    }
  });

  it("lists the files of the bucket", async () => {
    const { backend, network } = createInventedBackend(() =>
      jsonResponse([{ name: "flyer_t1.jpg" }]),
    );

    await expect(
      backend.bucket.list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } }),
    ).resolves.toEqual({ ok: true, value: [{ name: "flyer_t1.jpg" }] });
    expect(network.to("/storage/v1/object/list/flyers", "POST")[0]?.body).toMatchObject({
      prefix: "",
      limit: 100,
    });
  });

  it("removes files by name", async () => {
    const { backend, network } = createInventedBackend(() => jsonResponse([{ name: "x" }]));

    await expect(backend.bucket.remove(["flyer_t1.jpg", "_active3.json"])).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(network.to("/storage/v1/object/flyers", "DELETE")[0]?.body).toEqual({
      prefixes: ["flyer_t1.jpg", "_active3.json"],
    });
  });

  it("a refused list or removal is told", async () => {
    const { backend } = createInventedBackend(() =>
      jsonResponse({ statusCode: "403", error: "x", message: "no" }, 403),
    );

    const list = await backend.bucket.list();
    const remove = await backend.bucket.remove(["flyer_t1.jpg"]);

    expect(!list.ok && list.error.kind).toBe("rejected");
    expect(!remove.ok && remove.error.kind).toBe("rejected");
  });

  it("a client that breaks ends up as a failure", async () => {
    const { backend } = createInventedBackend(() => jsonResponse({}));
    vi.spyOn(backend.db.storage, "from").mockImplementation(() => {
      throw new Error("roto");
    });

    for (const result of [
      await backend.bucket.upload("flyer_t1.jpg", "x"),
      await backend.bucket.list(),
      await backend.bucket.remove(["flyer_t1.jpg"]),
    ]) {
      expect(!result.ok && result.error.message).toBe("roto");
    }
  });
});

describe("bucket.readText", () => {
  it("brings a file a list brought, fresh, at the address of its name", async () => {
    const { backend, network, url } = createInventedBackend(
      () => new Response("<html>flyer</html>", { status: 200 }),
    );
    await expect(backend.bucket.readText("index_12.html")).resolves.toEqual({
      ok: true,
      value: "<html>flyer</html>",
    });
    expect(network.requests[0]?.url).toBe(`${url}/storage/v1/object/public/flyers/index_12.html`);
    expect(network.requests[0]?.init?.cache).toBe("no-cache");
    expect(backend.bucket.listedUrl("raro'.html")).toBe(
      `${url}/storage/v1/object/public/flyers/raro'.html`,
    );
  });

  it("says when it does not exist and when it could not be fetched", async () => {
    const gone = createInventedBackend(() => new Response("", { status: 404 }));
    await expect(gone.backend.bucket.readText("a.html")).resolves.toEqual({
      ok: false,
      error: { kind: "not-found", status: 404 },
    });
    const busy = createInventedBackend(() => new Response("", { status: 503 }));
    await expect(busy.backend.bucket.readText("a.html")).resolves.toEqual({
      ok: false,
      error: { kind: "unreachable", status: 503 },
    });
    const offline = createInventedBackend(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(offline.backend.bucket.readText("a.html")).resolves.toEqual({
      ok: false,
      error: { kind: "unreachable", status: null },
    });
  });
});
