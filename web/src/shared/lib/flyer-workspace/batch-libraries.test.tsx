import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { renderHook } from "vitest-browser-react";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import type { LibraryLoader } from "../library-loader.ts";
import { createLibraryLoader } from "../library-loader.ts";
import { BATCH_LIBRARIES, useBatchLibraries } from "./batch-libraries.ts";

const notice = () => page.getByRole("status");

async function hook(library?: LibraryLoader<unknown>) {
  const harness = createAppHarness();
  const { result } = await renderHook(() => useBatchLibraries(library), {
    wrapper: ({ children }) => harness.wrap(children),
  });
  return result;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what a batch needs before it starts", () => {
  it("are the libraries of the PDF and of the ZIP, once", async () => {
    await expect(BATCH_LIBRARIES.load()).resolves.toHaveLength(2);
    expect(BATCH_LIBRARIES.isReady()).toBe(true);
    const result = await hook();
    await expect(result.current()).resolves.toBe(true);
  });

  it("says it is preparing them while they come down", async () => {
    const result = await hook(createLibraryLoader(() => Promise.resolve("listas")));
    await expect(result.current()).resolves.toBe(true);
    await expect.element(notice()).toHaveTextContent("Preparando el ZIP…");
  });

  it("says nothing when they are already here", async () => {
    const library = createLibraryLoader(() => Promise.resolve("listas"));
    await library.load();
    const result = await hook(library);
    await expect(result.current()).resolves.toBe(true);
    expect(document.body.textContent).not.toContain("Preparando");
  });

  it("if they do not arrive it says so without naming a library, and it can be tried again", async () => {
    const bring = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("jszip.min.js 500"))
      .mockResolvedValueOnce("listas");
    const result = await hook(createLibraryLoader(bring));
    await expect(result.current()).resolves.toBe(false);
    await expect
      .element(notice())
      .toHaveTextContent("No se pudo preparar el ZIP. Revisá la conexión y probá de nuevo.");
    await expect(result.current()).resolves.toBe(true);
    expect(bring).toHaveBeenCalledTimes(2);
  });
});
