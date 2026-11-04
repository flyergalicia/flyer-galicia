import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { fetchLogoFile, usePromotionLogoSource } from "./logo-file.ts";

function Sources() {
  const source = usePromotionLogoSource();
  return (
    <ul>
      <li data-testid="modo">{source("modo/317.png")}</li>
      <li data-testid="galicia">{source("coto.png")}</li>
      <li data-testid="none">{source(null)}</li>
    </ul>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the logos", () => {
  it("are asked where they live (invariant 26)", async () => {
    const screen = await render(createAppHarness().wrap(<Sources />));
    await expect
      .element(screen.getByTestId("modo"))
      .toMatchTextContent(/\/storage\/v1\/object\/public\/flyers\/modo\/317\.png$/);
    await expect
      .element(screen.getByTestId("galicia"))
      .toMatchTextContent(/galicia\.ar.*coto\.png$/);
    await expect.element(screen.getByTestId("none")).toHaveTextContent("");
  });

  it("bring their bytes, or nothing if they cannot", async () => {
    const answers = vi.spyOn(globalThis, "fetch");
    answers.mockResolvedValueOnce(new Response(new Uint8Array([1, 2])));
    expect((await fetchLogoFile("https://logos.invalid/a.png"))?.byteLength).toBe(2);

    answers.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await fetchLogoFile("https://logos.invalid/b.png")).toBeNull();

    answers.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await fetchLogoFile("https://logos.invalid/c.png")).toBeNull();
  });
});
