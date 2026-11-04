import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ProvinceSelect } from "./ProvinceSelect.tsx";

const PROVINCES = ["BUENOS AIRES", "CAPITAL FEDERAL", "CORDOBA", "MENDOZA"];

function Example({
  start = "",
  onChange,
  disabled = false,
}: {
  readonly start?: string;
  readonly onChange?: (value: string) => void;
  readonly disabled?: boolean;
}) {
  const [value, setValue] = useState(start);
  return (
    <>
      <p data-testid="chosen">{value}</p>
      <ProvinceSelect
        data-testid="province"
        provinces={PROVINCES}
        value={value}
        allLabel="Todas"
        disabled={disabled}
        disabledLabel="Sin lista"
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
      <button type="button">Otra cosa</button>
    </>
  );
}

async function open(props: Parameters<typeof Example>[0] = {}) {
  const screen = await render(<Example {...props} />);
  return screen;
}

function chosen(screen: Awaited<ReturnType<typeof open>>) {
  return screen.getByTestId("chosen").element().textContent;
}

function menu() {
  return document.querySelector('[data-testid="province-menu"]');
}

function row(value: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-value="${value}"]`);
  if (!found) throw new Error(`No row for "${value}"`);
  return found;
}

function selectOf(screen: Awaited<ReturnType<typeof open>>): HTMLSelectElement {
  const select = screen.getByTestId("province").element();
  if (!(select instanceof HTMLSelectElement)) throw new Error("It is not a select");
  return select;
}

async function touchSelect(screen: Awaited<ReturnType<typeof open>>) {
  await screen.getByTestId("province").click();
  await vi.waitFor(() => {
    expect(menu()).not.toBeNull();
  });
}

async function press(key: string) {
  await userEvent.keyboard(key);
}

describe("ProvinceSelect", () => {
  it("looks like a select, with what is chosen", async () => {
    const screen = await open({ start: "MENDOZA" });
    expect(selectOf(screen).value).toBe("MENDOZA");
    expect(selectOf(screen).selectedOptions[0]?.textContent).toBe("Mendoza");
    expect(selectOf(screen).title).toMatch(/Shift \+ clic/);
  });

  it("touching it opens its own list; touching it again closes it", async () => {
    const screen = await open();
    await touchSelect(screen);
    expect(document.activeElement).toBe(selectOf(screen));

    await screen.getByTestId("province").click();
    await vi.waitFor(() => {
      expect(menu()).toBeNull();
    });
  });

  it("one click chooses and closes", async () => {
    const onChange = vi.fn<(value: string) => void>();
    const screen = await open({ onChange });
    await touchSelect(screen);

    row("CORDOBA").click();

    await vi.waitFor(() => {
      expect(chosen(screen)).toBe("CORDOBA");
    });
    expect(menu()).toBeNull();

    await touchSelect(screen);
    row("CORDOBA").click();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("Shift + click adds another in the order of the list, and the list stays open", async () => {
    const screen = await open({ start: "MENDOZA" });
    await touchSelect(screen);

    row("BUENOS AIRES").dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));

    await vi.waitFor(() => {
      expect(chosen(screen)).toBe("BUENOS AIRES;MENDOZA");
    });
    expect(menu()).not.toBeNull();
    expect(selectOf(screen).selectedOptions[0]?.textContent).toBe("Buenos Aires y Mendoza");
    expect(menu()?.textContent).toMatch(/Elegidas: Buenos Aires y Mendoza/);
    expect(row("MENDOZA").getAttribute("aria-pressed")).toBe("true");
    expect(row("BUENOS AIRES").textContent).toContain("✓");
    expect(row("").getAttribute("aria-pressed")).toBe("false");
  });

  it("the + adds, and with several the − takes one out", async () => {
    const screen = await open({ start: "MENDOZA" });
    await touchSelect(screen);
    await screen.getByRole("button", { name: "Sumar Cordoba" }).click();
    await vi.waitFor(() => {
      expect(chosen(screen)).toBe("CORDOBA;MENDOZA");
    });
    await screen.getByRole("button", { name: "Sacar Mendoza" }).click();
    await vi.waitFor(() => {
      expect(chosen(screen)).toBe("CORDOBA");
    });
  });

  it("the first row means all of them, and closes", async () => {
    const screen = await open({ start: "CORDOBA;MENDOZA" });
    await touchSelect(screen);
    expect(document.querySelector('[data-value=""] + button')).toBeNull();

    row("").dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));

    await vi.waitFor(() => {
      expect(chosen(screen)).toBe("");
    });
    expect(menu()).toBeNull();
  });

  it("what left the list is not chosen anymore", async () => {
    const screen = await open({ start: "CHUBUT;MENDOZA" });
    expect(selectOf(screen).value).toBe("MENDOZA");
  });

  it("a person can still choose on the control itself", async () => {
    const screen = await open();
    await userEvent.selectOptions(selectOf(screen), "CORDOBA");
    await vi.waitFor(() => {
      expect(chosen(screen)).toBe("CORDOBA");
    });
  });

  it("clicking elsewhere closes it, and on the list it keeps the focus on the control", async () => {
    const screen = await open();
    await touchSelect(screen);
    const inside = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    row("CORDOBA").dispatchEvent(inside);
    expect(inside.defaultPrevented).toBe(true);
    expect(menu()).not.toBeNull();

    screen
      .getByRole("button", { name: "Otra cosa" })
      .element()
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await vi.waitFor(() => {
      expect(menu()).toBeNull();
    });
  });

  it("a touch elsewhere, or a new size of the window, close it", async () => {
    const screen = await open();
    await touchSelect(screen);
    document.body.dispatchEvent(new Event("touchstart", { bubbles: true }));
    await vi.waitFor(() => {
      expect(menu()).toBeNull();
    });

    await touchSelect(screen);
    document.dispatchEvent(new Event("touchstart"));
    window.dispatchEvent(new Event("resize"));
    await vi.waitFor(() => {
      expect(menu()).toBeNull();
    });
  });

  it("follows the control when something scrolls, and closes if the control hid", async () => {
    const screen = await open();
    await touchSelect(screen);
    const list = menu();
    if (!(list instanceof HTMLElement)) throw new Error("No list");
    const before = list.style.top;
    list.dispatchEvent(new Event("scroll"));
    expect(list.style.top).toBe(before);
    window.dispatchEvent(new Event("scroll"));
    expect(menu()).not.toBeNull();

    selectOf(screen).style.display = "none";
    window.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => {
      expect(menu()).toBeNull();
    });
  });

  it("the keyboard opens it, moves over it and chooses", async () => {
    const screen = await open({ start: "CAPITAL FEDERAL" });
    selectOf(screen).focus();
    await press("{ArrowDown}");
    await vi.waitFor(() => {
      expect(menu()).not.toBeNull();
    });

    await press("{ArrowDown}");
    expect(row("CAPITAL FEDERAL").closest("li")?.dataset.focused).toBe("true");
    await press("{ArrowDown}");
    expect(row("CORDOBA").closest("li")?.dataset.focused).toBe("true");
    await press("{ArrowUp}");
    await press("{ArrowUp}");
    expect(row("BUENOS AIRES").closest("li")?.dataset.focused).toBe("true");
    await press("{Enter}");

    await vi.waitFor(() => {
      expect(chosen(screen)).toBe("BUENOS AIRES");
    });
    expect(menu()).toBeNull();
  });

  it("Shift + Enter adds with the keyboard; Enter without a row closes", async () => {
    const screen = await open({ start: "MENDOZA" });
    selectOf(screen).focus();
    await press(" ");
    await vi.waitFor(() => {
      expect(menu()).not.toBeNull();
    });
    await press("{Enter}");
    await vi.waitFor(() => {
      expect(menu()).toBeNull();
    });

    selectOf(screen).focus();
    await press("{Enter}");
    await press("{ArrowDown}");
    await press("{ArrowUp}");
    await press("{Shift>}{Enter}{/Shift}");
    await vi.waitFor(() => {
      expect(chosen(screen)).toBe("CORDOBA;MENDOZA");
    });
    expect(menu()).not.toBeNull();
  });

  it("a letter jumps to the next province that starts that way", async () => {
    const screen = await open();
    selectOf(screen).focus();
    await press("{ArrowUp}");
    await press("c");
    expect(row("CAPITAL FEDERAL").closest("li")?.dataset.focused).toBe("true");
    await press("c");
    expect(row("CORDOBA").closest("li")?.dataset.focused).toBe("true");
    await press("z");
    expect(row("CORDOBA").closest("li")?.dataset.focused).toBe("true");
    await press("-");
    expect(row("CORDOBA").closest("li")?.dataset.focused).toBe("true");
  });

  it("Escape closes it alone, not what is under it; Tab closes it too", async () => {
    const screen = await open();
    const heard = vi.fn<() => void>();
    document.addEventListener("keydown", heard);
    await touchSelect(screen);
    await press("{Escape}");
    await vi.waitFor(() => {
      expect(menu()).toBeNull();
    });
    expect(heard).not.toHaveBeenCalled();
    document.removeEventListener("keydown", heard);

    await touchSelect(screen);
    await press("{Tab}");
    await vi.waitFor(() => {
      expect(menu()).toBeNull();
    });
  });

  it("with the list closed, other keys do nothing", async () => {
    const screen = await open();
    selectOf(screen).focus();
    await press("{Home}");
    expect(menu()).toBeNull();
  });

  it("a finger opens it too", async () => {
    const screen = await open();
    const finger = new Event("touchend", { bubbles: true, cancelable: true });
    selectOf(screen).dispatchEvent(finger);
    await vi.waitFor(() => {
      expect(menu()).not.toBeNull();
    });
    expect(finger.defaultPrevented).toBe(true);
  });

  it("only the main button of the mouse opens it", async () => {
    const screen = await open();
    selectOf(screen).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2 }));
    expect(menu()).toBeNull();
  });

  it("disabled it does not open, and says why", async () => {
    const screen = await open({ disabled: true });
    expect(selectOf(screen).selectedOptions[0]?.textContent).toBe("Sin lista");
    const finger = new Event("touchend", { bubbles: true });
    selectOf(screen).dispatchEvent(finger);
    expect(menu()).toBeNull();
  });

  it("opens above when it does not fit below", async () => {
    const screen = await render(
      <div style={{ position: "fixed", bottom: 0, left: 0, width: 300 }}>
        <Example />
      </div>,
    );
    await touchSelect(screen);
    const list = menu();
    if (!(list instanceof HTMLElement)) throw new Error("No list");
    const box = selectOf(screen).getBoundingClientRect();
    expect(list.getBoundingClientRect().bottom).toBeLessThanOrEqual(box.top);
  });
});
