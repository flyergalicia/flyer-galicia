import { describe, expect, it } from "vitest";
import {
  downloadBlock,
  EMPTY_FLYER_SLOT,
  type FlyerSlot,
  flyerSlotReducer,
  isOptionReady,
  readyScene,
} from "./flyer-slot.ts";
import { testScene } from "./testing/test-scene.ts";

function selected(option: number, from: FlyerSlot = EMPTY_FLYER_SLOT): FlyerSlot {
  return flyerSlotReducer(from, { type: "selected", option });
}

describe("the flyer on screen", () => {
  it("starts with nothing to download", () => {
    expect(downloadBlock(EMPTY_FLYER_SLOT)).toBe("not-loaded");
    expect(readyScene(EMPTY_FLYER_SLOT)).toBeNull();
    expect(isOptionReady(EMPTY_FLYER_SLOT, 1)).toBe(false);
  });

  it("waits while it loads", () => {
    expect(downloadBlock(selected(1))).toBe("loading");
    expect(readyScene(selected(1))).toBeNull();
  });

  it("is ready when its picture arrives", () => {
    const scene = testScene();
    const slot = flyerSlotReducer(selected(1), { type: "loaded", option: 1, scene });
    expect(downloadBlock(slot)).toBeNull();
    expect(readyScene(slot)).toBe(scene);
    expect(isOptionReady(slot, 1)).toBe(true);
    expect(isOptionReady(slot, 2)).toBe(false);
  });

  it.each(["no-flyer", "network"] as const)(
    "an option with no picture (%s) keeps the scene and cannot be drawn",
    (reason) => {
      const scene = testScene();
      const first = flyerSlotReducer(selected(1), { type: "loaded", option: 1, scene });
      const failed = flyerSlotReducer(selected(2, first), { type: "failed", option: 2, reason });
      expect(failed.scene).toBe(scene);
      expect(readyScene(failed)).toBeNull();
      expect(downloadBlock(failed)).toBe(reason);
      expect(isOptionReady(failed, 2)).toBe(false);
      expect(isOptionReady(failed, 1)).toBe(false);
    },
  );

  it("trying again clears the failure", () => {
    const failed = flyerSlotReducer(selected(1), { type: "failed", option: 1, reason: "network" });
    const again = selected(1, failed);
    expect(downloadBlock(again)).toBe("loading");
    const scene = testScene();
    expect(readyScene(flyerSlotReducer(again, { type: "loaded", option: 1, scene }))).toBe(scene);
  });

  it("what arrives late for another option changes nothing", () => {
    const slot = selected(2, selected(1));
    expect(flyerSlotReducer(slot, { type: "loaded", option: 1, scene: testScene() })).toBe(slot);
    expect(flyerSlotReducer(slot, { type: "failed", option: 1, reason: "network" })).toBe(slot);
  });
});
