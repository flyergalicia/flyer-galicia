import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { attachPreviewWindowZoom, type PreviewWindowZoom } from "./preview-window-zoom.ts";

const NATURAL = { width: 400, height: 1600 };

function pictureAddress() {
  const canvas = document.createElement("canvas");
  canvas.width = NATURAL.width;
  canvas.height = NATURAL.height;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, NATURAL.width, NATURAL.height);
  }
  return canvas.toDataURL("image/png");
}

const ADDRESS = pictureAddress();

interface Stage {
  readonly body: HTMLDivElement;
  readonly image: HTMLImageElement;
  readonly zoom: PreviewWindowZoom;
  readonly percent: () => number | undefined;
  readonly zoomed: () => boolean | undefined;
  readonly panning: () => boolean | undefined;
}

let stages: Stage[] = [];

async function stage({ width = 600, height = 400, withPicture = true } = {}): Promise<Stage> {
  const body = document.createElement("div");
  body.style.cssText = `width:${String(width)}px;height:${String(height)}px;overflow:auto`;
  const image = document.createElement("img");
  image.style.display = "block";
  image.style.height = "auto";
  body.append(image);
  document.body.append(body);
  if (withPicture) {
    image.src = ADDRESS;
    await image.decode();
  }
  const percents: number[] = [];
  const zoomeds: boolean[] = [];
  const pannings: boolean[] = [];
  const zoom = attachPreviewWindowZoom({
    body,
    image,
    onPercent: (percent) => percents.push(percent),
    onZoomed: (isZoomed) => zoomeds.push(isZoomed),
    onPanning: (isPanning) => pannings.push(isPanning),
  });
  const made: Stage = {
    body,
    image,
    zoom,
    percent: () => percents.at(-1),
    zoomed: () => zoomeds.at(-1),
    panning: () => pannings.at(-1),
  };
  stages.push(made);
  return made;
}

function wheel(element: HTMLElement, { deltaY = -120, ctrlKey = true, x = 100, y = 100 } = {}) {
  const event = new WheelEvent("wheel", {
    deltaY,
    ctrlKey,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
  return event;
}

function mouse(target: EventTarget, type: string, x = 0, y = 0, button = 0) {
  target.dispatchEvent(
    new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true }),
  );
}

function touches(
  element: HTMLElement,
  type: string,
  points: readonly (readonly [number, number])[],
) {
  const list = points.map(
    ([clientX, clientY], identifier) =>
      new Touch({ identifier, target: element, clientX, clientY }),
  );
  const event = new TouchEvent(type, { touches: list, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

function press(key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    cancelable: true,
    bubbles: true,
    ...modifiers,
  });
  document.dispatchEvent(event);
  return event;
}

beforeEach(async () => {
  await page.viewport(1366, 800);
});

afterEach(() => {
  for (const { zoom, body } of stages) {
    zoom.stop();
    body.remove();
  }
  stages = [];
  vi.restoreAllMocks();
});

describe("how it starts (invariant 20)", () => {
  it("on a computer, 100 % is the whole flyer: it fits in height and in width", async () => {
    const { image, body, percent, zoomed } = await stage();
    expect(percent()).toBe(100);
    expect(zoomed()).toBe(false);
    const box = image.getBoundingClientRect();
    expect(box.height).toBeLessThanOrEqual(body.clientHeight);
    expect(box.width).toBeLessThanOrEqual(body.clientWidth);
    expect(box.height).toBeGreaterThan(body.clientHeight - 4);
  });

  it("on a phone, 100 % is its width: it goes down with the finger", async () => {
    await page.viewport(390, 800);
    const { image, body } = await stage({ width: 360, height: 700 });
    expect(image.getBoundingClientRect().width).toBeCloseTo(body.clientWidth - 2, 0);
  });

  it("is never made larger than its real size", async () => {
    const { image } = await stage({ width: 900, height: 5000 });
    expect(image.getBoundingClientRect().width).toBe(NATURAL.width);
  });

  it("a picture that arrives later starts whole too", async () => {
    const { image, percent, zoom } = await stage({ withPicture: false });
    expect(percent(), "with no picture there is nothing to say").toBeUndefined();
    zoom.zoomIn();
    expect(percent()).toBeUndefined();
    image.src = ADDRESS;
    await vi.waitFor(() => {
      expect(percent()).toBe(100);
    });
  });
});

describe("the wheel", () => {
  it("alone, it does nothing to the zoom and is not stopped: it goes over the flyer", async () => {
    const { body, percent } = await stage();
    const event = wheel(body, { ctrlKey: false });
    expect(event.defaultPrevented).toBe(false);
    await new Promise(requestAnimationFrame);
    expect(percent()).toBe(100);
  });

  it("with Ctrl or Cmd it zooms where the mouse is, and several in a frame go together", async () => {
    const { body, image, percent, zoomed } = await stage();
    const box = image.getBoundingClientRect();
    const event = wheel(body, { x: box.left + box.width / 2, y: box.top + 100 });
    wheel(body, { x: box.left + box.width / 2, y: box.top + 100 });
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => {
      expect(percent()).toBe(156);
    });
    expect(zoomed()).toBe(true);
    const meta = new WheelEvent("wheel", { deltaY: 120, metaKey: true, cancelable: true });
    body.dispatchEvent(meta);
    await vi.waitFor(() => {
      expect(percent()).toBe(125);
    });
  });

  it("what was under the mouse stays under the mouse", async () => {
    const { body, image } = await stage({ width: 300, height: 300 });
    const before = image.getBoundingClientRect();
    const x = before.left + before.width / 2;
    const y = before.top + 150;
    const fraction = (y - before.top) / before.height;
    wheel(body, { x, y });
    await vi.waitFor(() => {
      expect(image.getBoundingClientRect().height).toBeGreaterThan(before.height);
    });
    const after = image.getBoundingClientRect();
    expect((y - after.top) / after.height).toBeCloseTo(fraction, 1);
  });

  it("a gesture that goes one way and comes back does nothing", async () => {
    const { body, percent } = await stage();
    wheel(body);
    wheel(body, { deltaY: 120 });
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    expect(percent()).toBe(100);
  });

  it("stops at 100 % going out, and at one and a half times its real size going in", async () => {
    const { zoom, percent, image } = await stage();
    zoom.zoomOut();
    expect(percent()).toBe(100);
    for (let step = 0; step < 30; step += 1) zoom.zoomIn();
    expect(image.getBoundingClientRect().width).toBeCloseTo(NATURAL.width * 1.5, 0);
    const reached = percent();
    zoom.zoomIn();
    expect(percent()).toBe(reached);
  });
});

describe("the double click", () => {
  it("comes closer where it points, and another one goes back to the whole flyer", async () => {
    const { body, image, percent } = await stage();
    const box = image.getBoundingClientRect();
    mouse(body, "dblclick", box.left + 10, box.top + 10);
    expect(percent()).toBeGreaterThan(100);
    body.scrollTop = 50;
    mouse(body, "dblclick", box.left + 10, box.top + 10);
    expect(percent()).toBe(100);
    expect(body.scrollTop).toBe(0);
  });

  it("with a narrow flyer it comes closer to the width of the window", async () => {
    const { body, image } = await stage({ width: 800, height: 200 });
    mouse(body, "dblclick", 10, 10);
    expect(image.getBoundingClientRect().width).toBeGreaterThan(100);
  });

  it("with no picture there is nothing to come closer to", async () => {
    const { body, percent } = await stage({ withPicture: false });
    mouse(body, "dblclick", 10, 10);
    expect(percent()).toBeUndefined();
  });
});

describe("dragging", () => {
  it("whole there is nothing to move: it is not even taken", async () => {
    const { body, panning } = await stage();
    mouse(body, "mousedown", 100, 100);
    expect(panning()).toBeUndefined();
  });

  it("zoomed it goes over the flyer, even when the mouse leaves the window", async () => {
    const { body, zoom, panning } = await stage({ width: 300, height: 300 });
    for (let step = 0; step < 6; step += 1) zoom.zoomIn();
    body.scrollTop = 300;
    mouse(body, "mousedown", 100, 200);
    expect(panning()).toBe(true);
    mouse(document, "mousemove", 100, 150);
    expect(body.scrollTop).toBe(350);
    mouse(document, "mousemove", 101, 200);
    mouse(document, "mouseup");
    expect(panning()).toBe(false);
    mouse(document, "mousemove", 100, 50);
    expect(body.scrollTop, "once released it stays").toBe(300);
  });

  it("only with the main button", async () => {
    const { body, zoom, panning } = await stage();
    zoom.zoomIn();
    mouse(body, "mousedown", 100, 100, 2);
    expect(panning()).toBeUndefined();
    mouse(document, "mouseup");
    expect(panning()).toBeUndefined();
  });
});

describe("the fingers", () => {
  it("two pinch where they are, and one goes over the flyer as always", async () => {
    const { body, percent } = await stage();
    expect(touches(body, "touchstart", [[100, 100]]).defaultPrevented).toBe(false);
    expect(touches(body, "touchmove", [[100, 120]]).defaultPrevented).toBe(false);
    const started = touches(body, "touchstart", [
      [100, 100],
      [200, 100],
    ]);
    expect(started.defaultPrevented).toBe(true);
    const moved = touches(body, "touchmove", [
      [50, 100],
      [250, 100],
    ]);
    expect(moved.defaultPrevented).toBe(true);
    expect(percent()).toBe(200);
    touches(body, "touchend", [[50, 100]]);
    touches(body, "touchmove", [
      [0, 100],
      [400, 100],
    ]);
    expect(percent(), "the gesture ended").toBe(200);
    touches(body, "touchend", [
      [0, 100],
      [400, 100],
    ]);
  });
});

describe("the keys", () => {
  it("+ and = come closer, − and _ go away, and 0 sees the whole flyer", async () => {
    const { percent } = await stage();
    expect(press("+").defaultPrevented).toBe(true);
    expect(percent()).toBe(125);
    press("=");
    expect(percent()).toBe(156);
    press("-");
    expect(percent()).toBe(125);
    press("+");
    press("_");
    expect(percent()).toBe(125);
    press("0");
    expect(percent()).toBe(100);
  });

  it("with Ctrl, Cmd or Alt they are not its own, and neither is another key", async () => {
    const { percent } = await stage();
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(press("+", modifier).defaultPrevented).toBe(false);
    }
    expect(press("a").defaultPrevented).toBe(false);
    expect(percent()).toBe(100);
  });
});

describe("when it is stopped", () => {
  it("hears nothing more", async () => {
    const { zoom, body, percent } = await stage();
    wheel(body);
    zoom.stop();
    press("+");
    mouse(body, "dblclick", 10, 10);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    expect(percent()).toBe(100);
  });
});

describe("a window that changes size", () => {
  it("measures again, a moment later", async () => {
    const { image, body } = await stage();
    const before = image.getBoundingClientRect().width;
    body.style.height = "200px";
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    await vi.waitFor(() => {
      expect(image.getBoundingClientRect().width).toBeLessThan(before);
    });
  });
});
