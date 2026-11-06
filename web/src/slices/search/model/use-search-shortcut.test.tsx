import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useSearchShortcut } from "./use-search-shortcut.ts";

function press(key: string, extra: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
  document.body.dispatchEvent(event);
  return event;
}

function Probe({ onKey }: { readonly onKey: (key: string) => void }) {
  const [isOpen, setOpen] = useState(false);
  const keys = useSearchShortcut(isOpen, () => {
    setOpen((open) => !open);
  });
  return (
    <button
      type="button"
      data-open={isOpen}
      onClick={() => {
        keys.attach((event) => {
          onKey(event.key);
        });
      }}
    >
      atender
    </button>
  );
}

async function mount() {
  const heard = vi.fn<(key: string) => void>();
  const screen = await render(<Probe onKey={heard} />);
  await screen.getByRole("button").click();
  const isOpen = () => screen.getByRole("button").element().getAttribute("data-open") === "true";
  return { heard, isOpen };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the shortcut of the search", () => {
  it("opens and closes with Ctrl+K and with Cmd+K, and keeps the key", async () => {
    const { isOpen } = await mount();

    const first = press("k", { ctrlKey: true });
    await vi.waitFor(() => {
      expect(isOpen()).toBe(true);
    });
    expect(first.defaultPrevented).toBe(true);
    press("K", { metaKey: true });
    await vi.waitFor(() => {
      expect(isOpen()).toBe(false);
    });
  });

  it("is not Ctrl+Shift+K, Ctrl+Alt+K, K alone, nor the key held down", async () => {
    const { isOpen } = await mount();

    expect(press("k", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(press("k", { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(press("k").defaultPrevented).toBe(false);
    press("k", { ctrlKey: true, repeat: true });
    expect(isOpen()).toBe(false);
  });

  it("while open, every key is the search's: nobody under it hears them", async () => {
    const { heard, isOpen } = await mount();
    const underneath = vi.fn<() => void>();
    const later = vi.fn<() => void>();
    document.addEventListener("keydown", underneath);

    press("v");
    expect(underneath).toHaveBeenCalledTimes(1);
    expect(heard).not.toHaveBeenCalled();

    press("k", { ctrlKey: true });
    await vi.waitFor(() => {
      expect(isOpen()).toBe(true);
    });
    press("v");
    expect(heard).toHaveBeenCalledWith("v");
    window.addEventListener("keydown", later, true);
    press("Escape");
    press("a", { isComposing: true });
    expect(underneath).toHaveBeenCalledTimes(1);
    expect(later).not.toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalledWith("a");
    document.removeEventListener("keydown", underneath);
    window.removeEventListener("keydown", later, true);
  });
});
