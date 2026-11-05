import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useShortcutTip } from "./use-shortcut-tip.tsx";

function WithTip({ marginTop = 200 }: { readonly marginTop?: number }) {
  const tip = useShortcutTip("Enter");
  return (
    <div style={{ marginTop, marginLeft: 200 }}>
      <button type="button" {...tip.target}>
        Bajar
      </button>
      {tip.element}
    </div>
  );
}

const tooltip = () => page.getByRole("tooltip");

function mouseIsReal(isReal: boolean) {
  const real = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const answer = real(query);
    if (query.includes("pointer")) Object.defineProperty(answer, "matches", { value: isReal });
    return answer;
  });
}

describe("the tip of a shortcut", () => {
  it("says the key when the mouse rests on the button, above it", async () => {
    mouseIsReal(true);
    const screen = await render(<WithTip />);
    await screen.getByRole("button").hover();
    await expect.element(tooltip()).toMatchTextContent(/(Ctrl|⌘) \+ Enter/);
    expect(tooltip().element().getAttribute("data-below")).toBe("false");
    vi.restoreAllMocks();
  });

  it("goes below when there is no room above", async () => {
    mouseIsReal(true);
    const screen = await render(<WithTip marginTop={0} />);
    await screen.getByRole("button").hover();
    await expect.element(tooltip()).toBeVisible();
    expect(tooltip().element().getAttribute("data-below")).toBe("true");
    vi.restoreAllMocks();
  });

  it("goes away with the mouse, on pressing, on going over the page or on leaving the window", async () => {
    mouseIsReal(true);
    const screen = await render(<WithTip />);
    const button = screen.getByRole("button");
    await button.hover();
    await expect.element(tooltip()).toBeVisible();
    await button.unhover();
    await expect.element(tooltip()).not.toBeInTheDocument();

    await button.hover();
    await expect.element(tooltip()).toBeVisible();
    await button.click();
    await expect.element(tooltip()).not.toBeInTheDocument();

    await button.unhover();
    await button.hover();
    await expect.element(tooltip()).toBeVisible();
    window.dispatchEvent(new Event("scroll"));
    await expect.element(tooltip()).not.toBeInTheDocument();

    await button.unhover();
    await button.hover();
    await expect.element(tooltip()).toBeVisible();
    window.dispatchEvent(new Event("blur"));
    await expect.element(tooltip()).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("with no real mouse there is no tip: a phone has no keyboard", async () => {
    mouseIsReal(false);
    const screen = await render(<WithTip />);
    await screen.getByRole("button").hover();
    await new Promise((resolve) => {
      setTimeout(resolve, 450);
    });
    expect(tooltip().query()).toBeNull();
    vi.restoreAllMocks();
  });

  it("says Cmd on a Mac and Ctrl elsewhere", async () => {
    mouseIsReal(true);
    const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const screen = await render(<WithTip />);
    await screen.getByRole("button").hover();
    await expect.element(tooltip()).toMatchTextContent(/⌘ \+ Enter/);
    await screen.getByRole("button").unhover();

    platform.mockReturnValue("Win32");
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Chrome on Windows");
    await screen.getByRole("button").hover();
    await expect.element(tooltip()).toMatchTextContent(/Ctrl \+ Enter/);
    vi.restoreAllMocks();
  });
});
