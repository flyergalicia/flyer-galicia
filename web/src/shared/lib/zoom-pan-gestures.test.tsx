import { afterEach, describe, expect, it, vi } from "vitest";
import { attachZoomPanGestures, ZOOM_TIP, type ZoomPanOptions } from "./zoom-pan-gestures.ts";

const LIMITS = { min: 0.5, max: 2, step: 2 };

function stage(options: Partial<ZoomPanOptions> = {}) {
  const pane = document.createElement("div");
  pane.style.cssText = "width:300px;height:200px;overflow:auto;position:relative";
  const target = document.createElement("div");
  const size = (zoom: number) => {
    target.style.width = `${String(400 * zoom)}px`;
    target.style.height = `${String(400 * zoom)}px`;
  };
  size(1);
  pane.append(target);
  document.body.append(pane);
  const state = { zoom: 1 };
  const applied: number[] = [];
  const tips: string[] = [];
  const detach = attachZoomPanGestures({
    pane,
    target,
    limits: LIMITS,
    readZoom: () => state.zoom,
    applyZoom: (zoom) => {
      state.zoom = zoom;
      applied.push(zoom);
      size(zoom);
    },
    onTip: (text) => tips.push(text),
    ...options,
  });
  return { pane, target, applied, tips, detach, state };
}

const nextFrame = () =>
  new Promise((done) => {
    requestAnimationFrame(done);
  });
const wheel = (fields: WheelEventInit) => new WheelEvent("wheel", { cancelable: true, ...fields });

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the gestures on a preview", () => {
  it("Ctrl + wheel zooms and the mouse stays over the same place", async () => {
    const { pane, target, applied, detach } = stage();
    const box = target.getBoundingClientRect();
    const clientX = box.left + 100;
    const clientY = box.top + 50;
    const event = wheel({ ctrlKey: true, deltaY: -1, clientX, clientY });
    pane.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await nextFrame();
    expect(applied).toEqual([2]);
    const after = target.getBoundingClientRect();
    expect((clientX - after.left) / after.width).toBeCloseTo(0.25, 2);
    expect((clientY - after.top) / after.height).toBeCloseTo(0.125, 2);
    detach();
  });

  it("with Cmd as well, and turning the other way it goes down", async () => {
    const { pane, applied, detach } = stage();
    pane.dispatchEvent(wheel({ metaKey: true, deltaY: 1 }));
    await nextFrame();
    expect(applied).toEqual([0.5]);
    detach();
  });

  it("several turns in one frame count as one change", async () => {
    const { pane, applied, detach, state } = stage();
    state.zoom = 0.5;
    pane.dispatchEvent(wheel({ ctrlKey: true, deltaY: -1 }));
    pane.dispatchEvent(wheel({ ctrlKey: true, deltaY: -1 }));
    await nextFrame();
    expect(applied).toEqual([2]);
    detach();
  });

  it("turns that cancel each other change nothing", async () => {
    const { pane, applied, detach } = stage();
    pane.dispatchEvent(wheel({ ctrlKey: true, deltaY: -1 }));
    pane.dispatchEvent(wheel({ ctrlKey: true, deltaY: 1 }));
    await nextFrame();
    expect(applied).toEqual([]);
    detach();
  });

  it("at its ceiling nothing is applied", async () => {
    const { pane, applied, detach, state } = stage();
    state.zoom = 2;
    pane.dispatchEvent(wheel({ ctrlKey: true, deltaY: -1 }));
    await nextFrame();
    expect(applied).toEqual([]);
    detach();
  });

  it("the wheel alone says how, once in this browser, and only with nothing to go over", () => {
    const long = stage();
    long.pane.dispatchEvent(wheel({}));
    expect(long.tips).toEqual([]);
    long.detach();

    const { pane, target, tips, detach } = stage();
    target.style.height = "10px";
    pane.dispatchEvent(wheel({}));
    pane.dispatchEvent(wheel({}));
    expect(tips).toEqual([ZOOM_TIP]);
    detach();
  });

  it("without the storage of the browser it says nothing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    const { pane, target, tips, detach } = stage();
    target.style.height = "10px";
    pane.dispatchEvent(wheel({}));
    expect(tips).toEqual([]);
    detach();
  });

  it("with nothing to zoom it does not take the wheel", () => {
    const { pane, tips, detach } = stage({ canZoom: () => false });
    const event = wheel({ ctrlKey: true, deltaY: -1 });
    pane.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    pane.dispatchEvent(wheel({}));
    expect(tips).toEqual([]);
    detach();
  });

  it("dragging moves it, except over what it is told and with another button", () => {
    const { pane, detach } = stage({ noDragOn: "button, a" });
    const link = document.createElement("a");
    pane.append(link);
    link.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    expect(pane.dataset["panning"]).toBeUndefined();
    pane.dispatchEvent(new MouseEvent("mousedown", { button: 2 }));
    expect(pane.dataset["panning"]).toBeUndefined();
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 5, clientY: 5 }));
    expect(pane.scrollTop).toBe(0);

    pane.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 100, clientY: 100 }));
    expect(pane.dataset["panning"]).toBe("true");
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 80, clientY: 60 }));
    expect(pane.scrollTop).toBe(40);
    expect(pane.scrollLeft).toBe(20);
    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(pane.dataset["panning"]).toBeUndefined();
    detach();
  });

  it("the mouse leaving the page lets go of the drag", () => {
    const { pane, detach } = stage();
    pane.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    document.dispatchEvent(new MouseEvent("mouseleave"));
    expect(pane.dataset["panning"]).toBeUndefined();
    detach();
  });

  it("taking the gestures away leaves nothing behind, not even a change on its way", async () => {
    const { pane, applied, tips, detach } = stage();
    pane.dispatchEvent(wheel({ ctrlKey: true, deltaY: -1 }));
    detach();
    await nextFrame();
    expect(applied).toEqual([]);
    pane.dispatchEvent(wheel({}));
    expect(tips).toEqual([]);
    pane.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    expect(pane.dataset["panning"]).toBeUndefined();
  });
});
