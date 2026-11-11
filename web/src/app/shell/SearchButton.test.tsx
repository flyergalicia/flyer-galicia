// The shortcut on the search button reads at the minimum letter on every system (invariant 15).
import "@/shared/ui/tokens/tokens.css";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SearchButton } from "./SearchButton.tsx";

async function shortcutSize(platform: string, text: string): Promise<number> {
  const screen = await render(<SearchButton onOpen={vi.fn<() => void>()} platform={platform} />);
  return Number.parseFloat(getComputedStyle(screen.getByText(text).element()).fontSize);
}

describe("the shortcut of the search button", () => {
  it("Ctrl K has lower case, so it reads at 12 px", async () => {
    expect(await shortcutSize("Win32", "Ctrl K")).toBeGreaterThanOrEqual(12);
  });

  it("⌘K is a label in capitals and keeps its 11 px", async () => {
    expect(await shortcutSize("MacIntel", "⌘K")).toBe(11);
  });
});
