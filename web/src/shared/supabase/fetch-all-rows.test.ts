import { describe, expect, it, vi } from "vitest";
import { fetchAllRows, type PageBuilder } from "./fetch-all-rows.ts";

function pagesOf(total: number): PageBuilder<number> {
  const rows = Array.from({ length: total }, (_, index) => index);
  return vi.fn<PageBuilder<number>>((from, to) =>
    Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
  );
}

describe("fetchAllRows", () => {
  it("keeps asking while a page comes full", async () => {
    const buildPage = pagesOf(2500);

    const result = await fetchAllRows(buildPage);

    expect(result.ok && result.value.length).toBe(2500);
    expect(vi.mocked(buildPage).mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks one more time when the last page was exactly full", async () => {
    const buildPage = pagesOf(1000);

    const result = await fetchAllRows(buildPage);

    expect(result.ok && result.value.length).toBe(1000);
    expect(buildPage).toHaveBeenCalledTimes(2);
  });

  it("takes another page size", async () => {
    const buildPage = pagesOf(5);

    const result = await fetchAllRows(buildPage, 2);

    expect(result).toEqual({ ok: true, value: [0, 1, 2, 3, 4] });
    expect(vi.mocked(buildPage).mock.calls.at(-1)).toEqual([4, 5]);
  });

  it("gives no rows as a result when there are none, with a null answer too", async () => {
    await expect(fetchAllRows(() => Promise.resolve({ data: null, error: null }))).resolves.toEqual(
      { ok: true, value: [] },
    );
  });

  it("an error on a later page is a failure that still has what arrived", async () => {
    const cause = { message: "se cortó" };
    const buildPage: PageBuilder<number> = (from) =>
      Promise.resolve(from === 0 ? { data: [1, 2], error: null } : { data: null, error: cause });

    await expect(fetchAllRows(buildPage, 2)).resolves.toEqual({
      ok: false,
      error: { cause, partialRows: [1, 2] },
    });
  });

  it("a page that rejects is a failure too, not an exception", async () => {
    const cause = new Error("Failed to fetch");
    const buildPage: PageBuilder<number> = () => Promise.reject(cause);

    await expect(fetchAllRows(buildPage)).resolves.toEqual({
      ok: false,
      error: { cause, partialRows: [] },
    });
  });
});
