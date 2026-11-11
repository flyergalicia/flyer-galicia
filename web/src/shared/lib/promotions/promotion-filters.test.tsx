import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { PromotionFiltersProvider } from "./PromotionFiltersProvider.tsx";
import {
  createPromotionFiltersPort,
  NO_PROMOTION_FILTERS,
  usePromotionFiltersPort,
} from "./promotion-filters.ts";
import { usePromotionPicker } from "./promotion-picking.ts";

function Reads() {
  usePromotionFiltersPort();
  return <p>Hay</p>;
}

function ReadsPicker() {
  usePromotionPicker();
  return null;
}

describe("what Promociones has chosen", () => {
  it("is read by the windows, and nothing is chosen before it opens", () => {
    const port = createPromotionFiltersPort();
    expect(port.read()).toEqual(NO_PROMOTION_FILTERS);
    port.publish({ ...NO_PROMOTION_FILTERS, province: "SALTA" });
    expect(port.read().province).toBe("SALTA");
    expect(port.takeAsked()).toBeNull();
  });

  it("what is asked waits until it is attended, and is attended once", () => {
    const port = createPromotionFiltersPort();
    const heard = vi.fn<() => void>();
    const stop = port.onAsked(heard);
    port.ask({ hideOnline: true, listActive: true });
    port.ask({ province: "SALTA" });
    expect(heard).toHaveBeenCalledTimes(2);
    expect(port.read()).toMatchObject({ hideOnline: true, province: "SALTA" });
    expect(Reflect.has(port.read(), "listActive")).toBe(false);
    expect(port.takeAsked()).toEqual({ hideOnline: true, listActive: true, province: "SALTA" });
    expect(port.takeAsked()).toBeNull();
    stop();
    port.ask({ province: "" });
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe("their hooks", () => {
  it("need their provider", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(render(<Reads />)).rejects.toThrow(/provider/);
    await expect(render(<ReadsPicker />)).rejects.toThrow(/PromotionPickerContext/);
    vi.restoreAllMocks();
    const screen = await render(
      <PromotionFiltersProvider>
        <Reads />
      </PromotionFiltersProvider>,
    );
    await expect.element(screen.getByText("Hay")).toBeVisible();
  });
});
