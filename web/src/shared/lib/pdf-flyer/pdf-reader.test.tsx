import { afterEach, describe, expect, it, vi } from "vitest";
import { PDF_READER, VerifiedBinaries } from "./pdf-reader.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what pdf.js asks for", () => {
  it("only the two WASM files, and nothing else", async () => {
    const binaries = new VerifiedBinaries();
    await expect(binaries.fetch({ kind: "cMapUrl", filename: "a.bcmap" })).rejects.toThrow(
      /pidió a\.bcmap/,
    );
    await expect(binaries.fetch({ kind: "wasmUrl", filename: "otro.wasm" })).rejects.toThrow(
      /pidió otro\.wasm/,
    );
    await expect(binaries.fetch({})).rejects.toThrow(/pidió undefined/);
  });

  it("comes with what it asked for, or says what happened", async () => {
    const binaries = new VerifiedBinaries();
    const answer = vi.spyOn(globalThis, "fetch");
    answer.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    await expect(binaries.fetch({ kind: "wasmUrl", filename: "jbig2.wasm" })).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    answer.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(binaries.fetch({ kind: "wasmUrl", filename: "openjpeg.wasm" })).rejects.toThrow(
      "HTTP 500",
    );
  });
});

describe("the reader", () => {
  it("does not stay broken if its worker did not arrive", async () => {
    const answer = vi.spyOn(globalThis, "fetch");
    answer.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(PDF_READER.load()).rejects.toThrow("HTTP 503");
    expect(PDF_READER.isReady()).toBe(false);
    answer.mockResolvedValueOnce(new Response("// the worker"));
    const library = await PDF_READER.load();
    expect(library.version).toMatch(/^\d+\.\d+/);
    expect(library.GlobalWorkerOptions.workerSrc).toMatch(/^blob:/);
    expect(PDF_READER.isReady()).toBe(true);
    const probe: unknown = window["__flyerProbe"]?.["pdfReader"]?.();
    expect(probe).toEqual({ version: library.version });
  });
});
