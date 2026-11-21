import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { type OptionOnScreen, useOptionOnScreen } from "./option-on-screen-context.ts";
import { OptionOnScreenProvider } from "./OptionOnScreenProvider.tsx";

function ReaderAlone() {
  useOptionOnScreen();
  return null;
}

describe("the flyer open in the editor", () => {
  it("is known to whoever asks, once it is said", async () => {
    const holders: OptionOnScreen[] = [];
    function Reader() {
      holders.push(useOptionOnScreen());
      return null;
    }
    await render(
      <OptionOnScreenProvider>
        <Reader />
      </OptionOnScreenProvider>,
    );
    const [holder] = holders;
    expect(holder?.get()).toBeNull();
    holder?.set(9);
    expect(holder?.get()).toBe(9);
  });

  it("without the provider it says what is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(render(<ReaderAlone />)).rejects.toThrow(/OptionOnScreenProvider/);
    vi.restoreAllMocks();
  });
});
