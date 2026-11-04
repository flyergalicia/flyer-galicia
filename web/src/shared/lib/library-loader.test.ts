import { describe, expect, it, vi } from "vitest";
import { createLibraryLoader } from "./library-loader.ts";

describe("a library that comes down when needed", () => {
  it("comes down once, however many ask", async () => {
    const bring = vi.fn<() => Promise<string>>().mockResolvedValue("librería");
    const library = createLibraryLoader(bring);
    expect(library.isReady()).toBe(false);

    const first = library.load();
    expect(library.load()).toBe(first);
    await expect(first).resolves.toBe("librería");

    expect(library.isReady()).toBe(true);
    expect(bring).toHaveBeenCalledOnce();
  });

  it("a failure can be tried again", async () => {
    const bring = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Sin red"))
      .mockResolvedValue("librería");
    const library = createLibraryLoader(bring);

    await expect(library.load()).rejects.toThrow("Sin red");
    expect(library.isReady()).toBe(false);

    await expect(library.load()).resolves.toBe("librería");
    expect(library.isReady()).toBe(true);
  });
});
