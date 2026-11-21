import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFileName,
  createFlyerPdf,
  dateForFileName,
  detailOf,
  downloadBlob,
  safeFileName,
  saveFlyerPdf,
  saveFlyerPng,
} from "./output.ts";
import { paintedCanvas } from "./testing/test-scene.ts";

const NOW = new Date(2026, 10, 4);
const CONTEXT = { now: NOW, configuration: "BAU" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** The link a spied method was called on. */
function linkOf(spy: { mock: { contexts: unknown[] } }): HTMLAnchorElement {
  const [link] = spy.mock.contexts;
  if (link instanceof HTMLAnchorElement) return link;
  throw new Error("Expected a link");
}

function textOf(buffer: ArrayBuffer): string {
  return new TextDecoder("latin1").decode(buffer);
}

describe("the PDF", () => {
  it("is one page 210 mm wide and exactly as tall as the flyer, with its image in JPEG", async () => {
    const result = await createFlyerPdf(paintedCanvas(1240, 2480));
    if (!result.ok) throw new Error(result.error.detail);
    const text = textOf(result.value.toArrayBuffer());
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1);
    const box = text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(Number(box?.[1])).toBeCloseTo(595.28, 1);
    expect(Number(box?.[2])).toBeCloseTo(1190.55, 1);
    expect(text).toContain("/DCTDecode");
  });

  it("saving says that it came out, with its name", async () => {
    // jsPDF clicks its link on the next turn.
    const click = vi.spyOn(HTMLAnchorElement.prototype, "dispatchEvent").mockReturnValue(true);
    const saved = await saveFlyerPdf(paintedCanvas(10, 10), "Flyer ACME");
    expect(saved).toEqual({ ok: true, value: true });
    await vi.waitFor(() => {
      expect(click).toHaveBeenCalled();
    });
    expect(linkOf(click).download).toBe("Flyer ACME.pdf");
  });

  it("a canvas that cannot be read is a failure, not a false success", async () => {
    const broken = paintedCanvas(10, 10);
    vi.spyOn(broken, "toDataURL").mockImplementation(() => {
      throw new DOMException("tainted");
    });
    const created = await createFlyerPdf(broken);
    expect(created).toEqual({ ok: false, error: { kind: "generation", detail: "tainted" } });
    await expect(saveFlyerPdf(broken, "x")).resolves.toEqual(created);
  });

  it("a failed save is a failure too", async () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("blocked");
    });
    await expect(saveFlyerPdf(paintedCanvas(10, 10), "x")).resolves.toEqual({
      ok: false,
      error: { kind: "generation", detail: "blocked" },
    });
  });
});

describe("the PNG", () => {
  it("says that it came out, with its name and a PNG inside", () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    expect(saveFlyerPng(paintedCanvas(10, 10), "Flyer ACME")).toEqual({ ok: true, value: true });
    const link = linkOf(click);
    expect(link.download).toBe("Flyer ACME.png");
    expect(link.href).toMatch(/^data:image\/png;base64,/);
  });

  it("a canvas that cannot be read is a failure", () => {
    const broken = paintedCanvas(10, 10);
    vi.spyOn(broken, "toDataURL").mockImplementation(() => {
      throw new Error("tainted");
    });
    expect(saveFlyerPng(broken, "x")).toEqual({
      ok: false,
      error: { kind: "generation", detail: "tainted" },
    });
  });
});

describe("downloadBlob", () => {
  it("downloads it and lets it go a minute later", () => {
    vi.useFakeTimers();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    downloadBlob(new Blob(["x"]), "Flyers.zip");
    const link = linkOf(click);
    expect(link.download).toBe("Flyers.zip");
    expect(link.isConnected).toBe(true);
    vi.advanceTimersByTime(59_000);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(link.isConnected).toBe(false);
  });
});

describe("safeFileName", () => {
  it.each([
    ['a\\b/c:d*e?f"g<h>i|j', "a-b-c-d-e-f-g-h-i-j"],
    ["  ACME  S.A. ", "ACME S.A"],
    ["uno\u0001dos\ntres", "unodostres"],
    ["uno   dos cuatro", "uno dos cuatro"],
    ["...", "flyer"],
    ["", "flyer"],
    [null, "flyer"],
    [undefined, "flyer"],
  ])("%j becomes %j", (raw, safe) => {
    expect(safeFileName(raw)).toBe(safe);
  });

  it("has a limit", () => {
    expect(safeFileName("a".repeat(200))).toHaveLength(120);
  });
});

describe("buildFileName", () => {
  const VALUES = { empresa: "ACME SA", nombre: "Ana", config: "Config 1" };

  it("fills its markers", () => {
    expect(buildFileName("Flyer {empresa} {asesor} {config} {fecha}", VALUES, CONTEXT)).toBe(
      "Flyer ACME SA Ana Config 1 2026-11-04",
    );
  });

  it("uses a default pattern", () => {
    expect(buildFileName("", VALUES, CONTEXT)).toBe("Flyer ACME SA");
    expect(buildFileName(null, VALUES, CONTEXT)).toBe("Flyer ACME SA");
  });

  it("a marker with nothing to say goes away with its loose separators", () => {
    expect(buildFileName("Flyer {empresa} - {asesor} - {fecha}", { empresa: "" }, CONTEXT)).toBe(
      "Flyer - 2026-11-04",
    );
    expect(buildFileName("{empresa}", { empresa: "" }, CONTEXT)).toBe("Flyer");
    expect(buildFileName("- {empresa} _", { empresa: "ACME" }, CONTEXT)).toBe("ACME");
  });

  it("takes the active configuration when the values bring none", () => {
    expect(buildFileName("{config}", { empresa: "X" }, CONTEXT)).toBe("BAU");
  });

  it("a dollar sign stays a dollar sign", () => {
    expect(buildFileName("{empresa}", { empresa: "A$'B" }, CONTEXT)).toBe("A$'B");
  });

  it("is safe", () => {
    expect(buildFileName("{empresa}", { empresa: "A/B" }, CONTEXT)).toBe("A-B");
  });
});

describe("the small helpers", () => {
  it("dateForFileName pads month and day", () => {
    expect(dateForFileName(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("detailOf reads any failure", () => {
    expect(detailOf(new Error("a"))).toBe("a");
    expect(detailOf("b")).toBe("b");
  });
});
