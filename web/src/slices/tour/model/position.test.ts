import { describe, expect, it } from "vitest";
import { spotlightOf, tipPlace, veilHole } from "./position.ts";

const PC = { width: 1366, height: 800 };
const PHONE = { width: 390, height: 844 };
const TIP = { width: 360, height: 224 };

describe("the light", () => {
  it("goes 6 px beyond the element, and the veil has a hole there", () => {
    const rect = { left: 342.4, top: 200, width: 52, height: 46 };

    expect(spotlightOf(rect)).toEqual({ left: 336.4, top: 194, width: 64, height: 58 });
    expect(veilHole(rect)).toBe(
      "polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 336px 194px, 336px 252px, 400px 252px, 400px 194px, 336px 194px)",
    );
  });
});

describe("the globe", () => {
  it("goes to the right when it fits, centred on the element, with the arrow at its middle", () => {
    expect(tipPlace({ left: 342, top: 200, width: 52, height: 46 }, TIP, PC)).toEqual({
      side: "right",
      left: 410,
      top: 111,
      arrow: { left: -8, top: 104 },
    });
  });

  it("goes to the left when it does not fit to the right", () => {
    expect(tipPlace({ left: 1139, top: 160, width: 210, height: 46 }, TIP, PC)).toEqual({
      side: "left",
      left: 763,
      top: 71,
      arrow: { right: -8, top: 104 },
    });
  });

  it("goes below on a phone, kept inside from the sides, and above if it does not fit below", () => {
    const below = tipPlace({ left: 25, top: 200, width: 323, height: 46 }, TIP, PHONE);
    expect(below).toEqual({ side: "bottom", left: 10, top: 262, arrow: { top: -8, left: 168.5 } });

    const above = tipPlace({ left: 10, top: 700, width: 369, height: 50 }, TIP, PHONE);
    expect(above).toEqual({ side: "top", left: 14.5, top: 460, arrow: { bottom: -8, left: 172 } });
  });

  it("keeps the arrow off the corners", () => {
    const place = tipPlace({ left: 0, top: 790, width: 20, height: 4 }, TIP, PC);
    expect(place.arrow).toEqual({ left: -8, top: 200 });
    expect(tipPlace({ left: 0, top: 0, width: 4, height: 4 }, TIP, PC).arrow).toEqual({
      left: -8,
      top: 12,
    });
  });

  it("on a phone stays inside the window for any element shown in the middle that leaves it room", () => {
    const outside: string[] = [];
    for (const height of [20, 60, 120, 200, 300]) {
      for (const tipHeight of [184, 264, 323, 422]) {
        if (height > PHONE.height - 2 * (tipHeight + 26)) continue;
        const rect = { left: 10, top: (PHONE.height - height) / 2, width: 369, height };
        const { top, left } = tipPlace(rect, { width: 360, height: tipHeight }, PHONE);
        const fits =
          left >= 0 && top >= 0 && left + 360 <= PHONE.width && top + tipHeight <= PHONE.height;
        if (!fits) outside.push(`${String(height)}/${String(tipHeight)}`);
      }
    }
    expect(outside).toEqual([]);
  });

  it("goes above the window for an element taller than it, as today (the list of the Hunter)", () => {
    const place = tipPlace({ left: 10, top: -3, width: 369, height: 850 }, TIP, PHONE);
    expect(place).toMatchObject({ side: "top", top: -243 });
  });
});
