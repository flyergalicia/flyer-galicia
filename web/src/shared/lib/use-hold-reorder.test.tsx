import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { type DropSide, HOLD_TO_LIFT_MS, useHoldReorder } from "./use-hold-reorder.ts";

const ITEMS = ["uno", "dos", "tres"];

interface Spies {
  readonly lifted: () => void;
  readonly dropped: () => void;
  readonly moved: (lifted: string, over: string, side: DropSide) => void;
  readonly pressed: (id: string) => void;
}

function Row({ enabled, watch }: { readonly enabled: boolean; readonly watch: Spies }) {
  const container = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  const { holdingId, liftedId, handlers } = useHoldReorder({
    enabled,
    container,
    itemSelector: "[data-id]",
    idOf: (item) => item.dataset.id ?? "",
    onLift: watch.lifted,
    onMove: watch.moved,
    onDrop: watch.dropped,
  });
  return (
    <div ref={container} data-testid="row" style={{ display: "flex", gap: 10 }} {...handlers}>
      {ITEMS.map((id) => (
        <button
          key={id}
          type="button"
          data-id={id}
          style={{ width: 80, display: hidden && id === "tres" ? "none" : "block" }}
          onClick={() => {
            watch.pressed(id);
            setHidden(id === "uno" && hidden);
          }}
        >
          {id}
        </button>
      ))}
      <input data-id="campo" aria-label="campo" />
      <div data-id="con-campo">
        <input aria-label="adentro" />
      </div>
      <output data-testid="holding">{holdingId ?? "-"}</output>
      <output data-testid="lifted">{liftedId ?? "-"}</output>
    </div>
  );
}

function spies(): Spies {
  return {
    lifted: vi.fn<Spies["lifted"]>(),
    dropped: vi.fn<Spies["dropped"]>(),
    moved: vi.fn<Spies["moved"]>(),
    pressed: vi.fn<Spies["pressed"]>(),
  };
}

function press(element: Element, x = 10, y = 10, init: PointerEventInit = {}): void {
  element.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      ...init,
    }),
  );
}

function point(type: string, element: Element, x = 0, y = 10): void {
  element.dispatchEvent(
    new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }),
  );
}

async function open(enabled = true) {
  const all = spies();
  const screen = await render(<Row enabled={enabled} watch={all} />);
  const row = screen.getByTestId("row").element();
  const item = (name: string) => screen.getByRole("button", { name }).element();
  return { all, screen, row, item };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("holding an item", () => {
  it("lifts it when the time is up", async () => {
    const { all, screen, item } = await open();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    press(item("dos"));
    await expect.element(screen.getByTestId("holding")).toHaveTextContent("dos");
    expect(all.lifted).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(HOLD_TO_LIFT_MS);
    expect(all.lifted).toHaveBeenCalledOnce();
    await expect.element(screen.getByTestId("lifted")).toHaveTextContent("dos");
    await expect.element(screen.getByTestId("holding")).toHaveTextContent("-");
  });

  it("does not for whoever cannot move them", async () => {
    const { all, item } = await open(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    press(item("dos"));
    await vi.advanceTimersByTimeAsync(HOLD_TO_LIFT_MS);

    expect(all.lifted).not.toHaveBeenCalled();
  });

  it("moving before the time is up is not holding", async () => {
    const { all, row, item } = await open();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    press(item("dos"), 10, 10);
    point("pointermove", row, 40, 10);
    await vi.advanceTimersByTimeAsync(HOLD_TO_LIFT_MS);

    expect(all.lifted).not.toHaveBeenCalled();
  });

  it("a small movement does not count", async () => {
    const { all, row, item } = await open();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    press(item("dos"), 10, 10);
    point("pointermove", row, 12, 12);
    await vi.advanceTimersByTimeAsync(HOLD_TO_LIFT_MS);

    expect(all.lifted).toHaveBeenCalledOnce();
  });

  it("leaving before the time is up is not holding", async () => {
    const { all, row, item } = await open();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    press(item("dos"));
    point("pointerleave", row);
    row.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(HOLD_TO_LIFT_MS);

    expect(all.lifted).not.toHaveBeenCalled();
  });

  it("ignores another button of the mouse, what is not an item, and an item being edited", async () => {
    const { all, screen, row, item } = await open();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    press(item("dos"), 10, 10, { button: 2 });
    press(row);
    press(screen.getByLabelText("adentro").element());
    await vi.advanceTimersByTimeAsync(HOLD_TO_LIFT_MS);

    expect(all.lifted).not.toHaveBeenCalled();
  });

  it("a finger can be any button", async () => {
    const { all, item } = await open();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    press(item("dos"), 10, 10, { pointerType: "touch", button: 2 });
    await vi.advanceTimersByTimeAsync(HOLD_TO_LIFT_MS);

    expect(all.lifted).toHaveBeenCalledOnce();
  });
});

async function lifted(name = "dos") {
  const opened = await open();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  press(opened.item(name));
  await vi.advanceTimersByTimeAsync(HOLD_TO_LIFT_MS);
  return opened;
}

describe("dragging what was lifted", () => {
  it("says over which one it is, and on which side", async () => {
    const { all, row, item } = await lifted();
    const { left, width } = item("uno").getBoundingClientRect();

    point("pointermove", row, left + 2);
    expect(all.moved).toHaveBeenLastCalledWith("dos", "uno", "before");

    point("pointermove", row, left + width - 2);
    expect(all.moved).toHaveBeenLastCalledWith("dos", "uno", "after");
  });

  it("says nothing out of any item", async () => {
    const { all, row } = await lifted();

    point("pointermove", row, 99_999);

    expect(all.moved).not.toHaveBeenCalled();
  });

  it("releasing drops it, and the click that follows does not count", async () => {
    const { all, screen, row, item } = await lifted();

    point("pointerup", row);
    expect(all.dropped).toHaveBeenCalledOnce();
    await expect.element(screen.getByTestId("lifted")).toHaveTextContent("-");

    item("dos").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(all.pressed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    item("dos").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(all.pressed).toHaveBeenCalledOnce();
  });

  it("a cancelled pointer drops it too, and leaving does not", async () => {
    const { all, row } = await lifted();

    point("pointerleave", row);
    row.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    expect(all.dropped).not.toHaveBeenCalled();

    point("pointercancel", row);
    expect(all.dropped).toHaveBeenCalledOnce();
  });

  it("the menu of the browser does not get in the way", async () => {
    const { row, item } = await lifted();
    const onHeld = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });

    item("dos").dispatchEvent(onHeld);
    expect(onHeld.defaultPrevented).toBe(true);

    point("pointerup", row);
    const free = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    item("dos").dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
  });
});

describe("releasing without having lifted", () => {
  it("drops nothing", async () => {
    const { all, row, item } = await open();

    press(item("dos"));
    point("pointerup", row);

    expect(all.dropped).not.toHaveBeenCalled();
  });

  it("the clicks count as usual", async () => {
    const { all, screen } = await open();

    await screen.getByRole("button", { name: "dos" }).click();

    expect(all.pressed).toHaveBeenCalledWith("dos");
  });
});
