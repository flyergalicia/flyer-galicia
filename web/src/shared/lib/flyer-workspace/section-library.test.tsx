import { describe, expect, it, vi } from "vitest";
import { createSectionLibrary } from "./section-library.ts";

const PICTURE = new Image();
type Load = (address: string) => Promise<HTMLImageElement | null>;
const OUR = "https://bucket/fuente.jpg";

describe("the pictures of the sections", () => {
  it("brings only those of our bucket, once, and remembers them", async () => {
    const load = vi.fn<Load>(() => Promise.resolve(PICTURE));
    const library = createSectionLibrary({ isOurs: (address) => address === OUR, load });
    await expect(library.fetch("https://afuera/x.jpg")).resolves.toBeNull();
    const [one, two] = await Promise.all([library.fetch(OUR), library.fetch(OUR)]);
    expect(one).toBe(PICTURE);
    expect(two).toBe(PICTURE);
    await library.fetch(OUR);
    expect(load).toHaveBeenCalledTimes(1);
    expect(library.images().get(OUR)).toBe(PICTURE);
  });

  it("says how many are missing, and brings those of some cuts", async () => {
    const load = vi.fn<Load>((address) => Promise.resolve(address === OUR ? PICTURE : null));
    const library = createSectionLibrary({ isOurs: () => true, load });
    const cuts = [
      { y: 1, h: 2 },
      { y: 2, h: 3, ins: { u: OUR, sy: 0, sh: 5 } },
      { y: 3, h: 3, ins: { u: "otra", sy: 0, sh: 5 } },
      { y: 4, h: 3, ins: { u: OUR, sy: 9, sh: 5 } },
    ];
    expect(library.missing(cuts)).toBe(3);
    await library.bring(cuts);
    expect(load).toHaveBeenCalledTimes(2);
    // One that did not arrive is asked for again the next time.
    expect(library.missing(cuts)).toBe(1);
    await library.fetch("otra");
    expect(load).toHaveBeenCalledTimes(3);
  });
});
