import { afterEach, describe, expect, it, vi } from "vitest";
import { ZOOM_TIP } from "@/shared/lib/zoom-pan-gestures.ts";
import { attachPictureZoom } from "./picture-zoom.ts";

function stage(naturalWidth = 1000) {
  const pane = document.createElement("div");
  pane.style.width = "640px";
  pane.style.height = "400px";
  pane.style.overflow = "auto";
  const picture = document.createElement("img");
  Object.defineProperty(picture, "naturalWidth", { value: naturalWidth });
  pane.append(picture);
  document.body.append(pane);
  const percents: number[] = [];
  const tips: string[] = [];
  const zoom = attachPictureZoom({
    pane,
    picture,
    onPercent: (percent) => percents.push(percent),
    onTip: (text) => tips.push(text),
  });
  return { pane, picture, percents, tips, zoom };
}

const nextFrame = () =>
  new Promise((done) => {
    requestAnimationFrame(done);
  });

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe("the zoom of the picture", () => {
  it("at 100% the picture fits by itself, and over it it takes a width", () => {
    const { picture, percents, zoom } = stage();
    zoom.zoomIn();
    expect(percents.at(-1)).toBe(125);
    expect(picture.style.maxWidth).toBe("none");
    expect(picture.style.width).toBe("750px");

    zoom.reset();
    expect(percents.at(-1)).toBe(100);
    expect(picture.style.width).toBe("");
    expect(picture.style.maxWidth).toBe("");
    zoom.detach();
  });

  it("the base is what fits in the pane or the picture, whichever is smaller", () => {
    const { picture, zoom } = stage(300);
    zoom.zoomIn();
    expect(picture.style.width).toBe("375px");
    zoom.detach();
  });

  it("goes up to 300% and down to 20%", () => {
    const { percents, zoom } = stage();
    for (let turn = 0; turn < 10; turn += 1) zoom.zoomIn();
    expect(percents.at(-1)).toBe(300);
    for (let turn = 0; turn < 20; turn += 1) zoom.zoomOut();
    expect(percents.at(-1)).toBe(20);
    zoom.detach();
  });

  it("the size of the window counts once it stops changing, if it is zoomed", async () => {
    vi.useFakeTimers();
    const { pane, picture, zoom } = stage();
    zoom.zoomIn();
    pane.style.width = "440px";
    window.dispatchEvent(new Event("resize"));
    expect(picture.style.width).toBe("750px");
    await vi.advanceTimersByTimeAsync(200);
    expect(picture.style.width).toBe("500px");
    vi.useRealTimers();
    zoom.detach();
  });

  it("at 100% the size of the window does not write anything", async () => {
    vi.useFakeTimers();
    const { percents, zoom } = stage();
    const before = percents.length;
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(200);
    expect(percents.length).toBe(before);
    vi.useRealTimers();
    zoom.detach();
  });

  it("the wheel alone does not zoom and says how, with Ctrl it zooms", async () => {
    const { pane, percents, tips, zoom } = stage();
    const event = { clientX: 10, clientY: 10, bubbles: true, cancelable: true };
    pane.dispatchEvent(new WheelEvent("wheel", event));
    expect(tips).toEqual([ZOOM_TIP]);
    expect(percents).toEqual([]);

    pane.dispatchEvent(new WheelEvent("wheel", { ...event, ctrlKey: true, deltaY: -100 }));
    await nextFrame();
    expect(percents).toEqual([125]);
    zoom.detach();
  });

  it("with no picture yet, the wheel is the wheel", () => {
    const { pane, tips, zoom } = stage(0);
    pane.dispatchEvent(new WheelEvent("wheel", { bubbles: true, ctrlKey: true, deltaY: -100 }));
    pane.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    expect(tips).toEqual([]);
    zoom.detach();
  });

  it("a picture that has not arrived has no width to keep", () => {
    const { picture, zoom } = stage(0);
    zoom.zoomIn();
    expect(picture.style.width).toBe("");
    zoom.detach();
  });

  it("dragging does not start on the head of the preview", () => {
    const { pane, zoom } = stage();
    const head = document.createElement("div");
    head.dataset["previewHead"] = "";
    pane.append(head);
    head.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    expect(pane.dataset["panning"]).toBeUndefined();
    pane.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    expect(pane.dataset["panning"]).toBe("true");
    document.dispatchEvent(new MouseEvent("mouseup"));
    zoom.detach();
  });
});
