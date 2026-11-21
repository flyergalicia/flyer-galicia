import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Modal } from "@/shared/ui/index.ts";
import { usePrimaryAction } from "./primary-action-context.ts";
import { PrimaryActionProvider } from "./PrimaryActionProvider.tsx";

function Screen({ action, isActive }: { readonly action: () => void; readonly isActive: boolean }) {
  usePrimaryAction(action, isActive);
  return null;
}

function WithWindow({ action }: { readonly action: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <PrimaryActionProvider>
      <Screen action={action} isActive />
      {open && (
        <Modal
          onClose={() => {
            setOpen(false);
          }}
        >
          <Modal.Header>Ventana</Modal.Header>
        </Modal>
      )}
    </PrimaryActionProvider>
  );
}

describe("Ctrl+Enter", () => {
  it("does the main action of the screen that is showing", async () => {
    const shown = vi.fn<() => void>();
    const hidden = vi.fn<() => void>();
    await render(
      <PrimaryActionProvider>
        <Screen action={hidden} isActive={false} />
        <Screen action={shown} isActive />
      </PrimaryActionProvider>,
    );

    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    expect(shown).toHaveBeenCalledOnce();
    expect(hidden).not.toHaveBeenCalled();
  });

  it("also with Cmd, and only with the keys together", async () => {
    const action = vi.fn<() => void>();
    await render(
      <PrimaryActionProvider>
        <Screen action={action} isActive />
      </PrimaryActionProvider>,
    );

    await userEvent.keyboard("{Enter}");
    expect(action).not.toHaveBeenCalled();
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    expect(action).toHaveBeenCalledOnce();
  });

  it("does nothing with a window on top", async () => {
    const action = vi.fn<() => void>();
    await render(<WithWindow action={action} />);

    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    expect(action).not.toHaveBeenCalled();
  });

  it("does nothing if no screen has one", async () => {
    await render(
      <PrimaryActionProvider>
        <span>Sin acción</span>
      </PrimaryActionProvider>,
    );

    await expect(userEvent.keyboard("{Control>}{Enter}{/Control}")).resolves.toBeUndefined();
  });

  it("holding the keys down does not repeat it", async () => {
    const action = vi.fn<() => void>();
    await render(
      <PrimaryActionProvider>
        <Screen action={action} isActive />
      </PrimaryActionProvider>,
    );

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, repeat: true, bubbles: true }),
    );

    expect(action).not.toHaveBeenCalled();
  });

  it("uses the last action, and stops when the screen leaves", async () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    const screen = await render(
      <PrimaryActionProvider>
        <Screen action={first} isActive />
      </PrimaryActionProvider>,
    );
    await screen.rerender(
      <PrimaryActionProvider>
        <Screen action={second} isActive />
      </PrimaryActionProvider>,
    );
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();

    await screen.rerender(
      <PrimaryActionProvider>
        <Screen action={second} isActive={false} />
      </PrimaryActionProvider>,
    );
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(second).toHaveBeenCalledOnce();
  });

  it("asks for its provider", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(render(<Screen action={vi.fn<() => void>()} isActive />)).rejects.toThrow(
      /PrimaryActionProvider/,
    );
    vi.restoreAllMocks();
  });
});
