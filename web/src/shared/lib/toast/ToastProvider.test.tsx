import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useToast } from "./toast-context.ts";
import { TOAST_MS, ToastProvider } from "./ToastProvider.tsx";

function Buttons() {
  const { show, hide } = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          show("Uno");
        }}
      >
        uno
      </button>
      <button
        type="button"
        onClick={() => {
          show("Dos");
        }}
      >
        dos
      </button>
      <button
        type="button"
        onClick={() => {
          hide("Uno");
        }}
      >
        sacar uno
      </button>
    </>
  );
}

function Alone() {
  useToast();
  return null;
}

const open = () =>
  render(
    <ToastProvider>
      <Buttons />
    </ToastProvider>,
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("the floating notice", () => {
  it("there is only one, and the last one wins", async () => {
    const screen = await open();

    await screen.getByRole("button", { name: "uno" }).click();
    await screen.getByRole("button", { name: "dos" }).click();

    // Before its time is up: by then, any text could be left there with the notice hidden.
    await expect
      .element(screen.getByRole("status"), { timeout: TOAST_MS / 3 })
      .toHaveTextContent("Dos");
    expect(screen.getByRole("status").elements()).toHaveLength(1);
  });

  it("each one starts its time over, and it goes away by itself", async () => {
    const screen = await open();
    vi.useFakeTimers();

    await screen.getByRole("button", { name: "uno" }).click();
    vi.advanceTimersByTime(TOAST_MS - 100);
    await screen.getByRole("button", { name: "dos" }).click();
    vi.advanceTimersByTime(TOAST_MS - 100);
    await expect.element(screen.getByRole("status")).toHaveAttribute("data-visible", "true");

    vi.advanceTimersByTime(100);
    await expect.element(screen.getByRole("status")).toHaveAttribute("data-visible", "false");
    vi.useRealTimers();
  });

  it("taking one away does not erase a newer one", async () => {
    const screen = await open();

    await screen.getByRole("button", { name: "dos" }).click();
    await screen.getByRole("button", { name: "sacar uno" }).click();
    await expect.element(screen.getByRole("status")).toHaveAttribute("data-visible", "true");

    await screen.getByRole("button", { name: "uno" }).click();
    await screen.getByRole("button", { name: "sacar uno" }).click();
    await expect.element(screen.getByRole("status")).toHaveAttribute("data-visible", "false");
  });

  it("asks for its provider", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(render(<Alone />)).rejects.toThrow(/ToastProvider/);
    vi.restoreAllMocks();
  });
});
