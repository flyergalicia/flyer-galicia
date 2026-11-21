import { afterEach, describe, expect, it, vi } from "vitest";
import { addressOfVersion, ownVersion, publishedVersion } from "./version-check.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function answering(body: unknown, ok = true) {
  const asked = vi.fn<(url: string, init: RequestInit) => Promise<unknown>>(() =>
    Promise.resolve({ ok, json: () => Promise.resolve(body) }),
  );
  vi.stubGlobal("fetch", asked);
  return asked;
}

describe("the version of the page", () => {
  it("is in its mark", () => {
    expect(ownVersion({ querySelector: () => null })).toBeNull();
  });
});

describe("the published version", () => {
  it("comes from the file, asked without cache", async () => {
    const asked = answering({ v: "abc" });

    await expect(publishedVersion(123)).resolves.toBe("abc");
    expect(asked).toHaveBeenCalledWith("version.json?t=123", { cache: "no-store" });
  });

  it("is nothing if it cannot be read", async () => {
    answering({ v: "abc" }, false);
    await expect(publishedVersion(1)).resolves.toBeNull();

    answering("texto");
    await expect(publishedVersion(1)).resolves.toBeNull();

    answering({ v: 3 });
    await expect(publishedVersion(1)).resolves.toBeNull();

    answering({ v: "" });
    await expect(publishedVersion(1)).resolves.toBeNull();

    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(publishedVersion(1)).resolves.toBeNull();
  });
});

describe("the address of a version", () => {
  it("skips the page kept in the cache", () => {
    expect(addressOfVersion("/flyer-galicia/", "a b")).toBe("/flyer-galicia/?v=a%20b");
  });
});
