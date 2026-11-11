import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { closeFloating, useCloseWithFloating } from "./close-floating.ts";

function Floating({ startsOpen }: { readonly startsOpen: boolean }) {
  const [open, setOpen] = useState(startsOpen);
  useCloseWithFloating(() => {
    setOpen(false);
  }, open);
  return (
    <button type="button" onClick={() => setOpen(true)}>
      {open ? "abierta" : "cerrada"}
    </button>
  );
}

describe("what floats", () => {
  it("closes when it is asked to, only while it is open", async () => {
    const screen = await render(
      <>
        <Floating startsOpen />
        <Floating startsOpen={false} />
      </>,
    );
    await expect.element(screen.getByRole("button", { name: "abierta" })).toBeVisible();

    closeFloating();

    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "cerrada" }).elements()).toHaveLength(2);
    });
  });

  it("with nothing open, closing does nothing", () => {
    expect(() => {
      closeFloating();
    }).not.toThrow();
  });
});
