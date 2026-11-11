import { describe, expect, it } from "vitest";
import { drawOfficers } from "./draw-officers.ts";
import { officerLocationText } from "./officers.ts";
import { passOn, recordingContext, textsOf } from "./testing/recording-context.ts";
import { paintedCanvas, testScene } from "./testing/test-scene.ts";
import { type FlyerValues, OFFICER_SLOTS } from "./types.ts";

const PIN = String.fromCodePoint(0x1f4cd);

function officers(count: number, extra: Partial<FlyerValues> = {}): FlyerValues {
  const values: FlyerValues = { empresa: "X", ...extra };
  for (const [number, suffix] of OFFICER_SLOTS.slice(0, count)) {
    values[`has${number}`] = true;
    values[`nombre${suffix}`] = `Oficial ${String(number)}`;
    values[`celular${suffix}`] = `Cel: ${String(number)}`;
    values[`email${suffix}`] = `o${String(number)}@banco`;
  }
  return values;
}

describe("drawOfficers", () => {
  it("with nobody, it covers the band and says where it ends", () => {
    const recording = recordingContext();
    const bottom = drawOfficers(passOn(recording, testScene()), officers(0));
    expect(recording.texts).toEqual([]);
    expect(recording.boxes).toEqual([
      { x: 150, y: 5330, width: 940, height: 130, color: "#ffffff" },
    ]);
    expect(bottom).toBe(5460);
  });

  it("one goes centered, with its three lines", () => {
    const recording = recordingContext();
    drawOfficers(passOn(recording, testScene()), officers(1));
    expect(recording.texts.map(({ text, x, y }) => [text, x, y])).toEqual([
      ["Oficial 1", 619, 5360],
      ["Cel: 1", 619, 5390],
      ["o1@banco", 619, 5418],
    ]);
    expect(recording.texts[0]?.font).toContain("bold 24px");
    expect(recording.texts[1]?.font).toMatch(/^21px/);
    expect(recording.texts[0]).toMatchObject({
      align: "center",
      baseline: "middle",
      color: "#111111",
    });
  });

  it("two go side by side", () => {
    const recording = recordingContext();
    drawOfficers(passOn(recording, testScene()), officers(2));
    expect(
      recording.texts.filter(({ text }) => text.startsWith("Oficial")).map(({ x }) => x),
    ).toEqual([310, 930]);
  });

  it("three go in a wider band, in even columns", () => {
    const recording = recordingContext();
    drawOfficers(passOn(recording, testScene()), officers(3));
    expect(recording.boxes[0]).toEqual({
      x: 50,
      y: 5330,
      width: 1140,
      height: 130,
      color: "#ffffff",
    });
    expect(
      recording.texts.filter(({ text }) => text.startsWith("Oficial")).map(({ x }) => x),
    ).toEqual([240, 620, 1000]);
  });

  it("the band of three stays inside the picture", () => {
    const toTheRight = recordingContext();
    drawOfficers(
      passOn(toTheRight, testScene({ calibration: { contacto: { ex: 600, ew3: 1000 } } })),
      officers(3),
    );
    expect(toTheRight.boxes[0]).toMatchObject({ x: 240, width: 1000 });
    const toTheLeft = recordingContext();
    drawOfficers(
      passOn(toTheLeft, testScene({ calibration: { contacto: { ex: 0, ew: 400, ew3: 1000 } } })),
      officers(3),
    );
    expect(toTheLeft.boxes[0]).toMatchObject({ x: 0, width: 1000 });
    const tooWide = recordingContext();
    drawOfficers(
      passOn(tooWide, testScene({ calibration: { contacto: { ew3: 5000 } } })),
      officers(3),
    );
    expect(tooWide.boxes[0]).toMatchObject({ x: 0, width: 1240 });
    const narrow = recordingContext();
    drawOfficers(
      passOn(narrow, testScene({ calibration: { contacto: { ew3: 100 } } })),
      officers(3),
    );
    expect(narrow.boxes[0]).toMatchObject({ width: 940 });
  });

  it("four go in 2x2, and the last row keeps the anchored place", () => {
    const recording = recordingContext();
    const bottom = drawOfficers(passOn(recording, testScene(), { extra: 130 }), officers(4));
    expect(recording.boxes[0]).toEqual({
      x: 150,
      y: 5330,
      width: 940,
      height: 260,
      color: "#ffffff",
    });
    expect(bottom).toBe(5590);
    expect(
      recording.texts.filter(({ text }) => text.startsWith("Oficial")).map(({ x, y }) => [x, y]),
    ).toEqual([
      [310, 5360],
      [930, 5360],
      [310, 5490],
      [930, 5490],
    ]);
  });

  it("leaves out a phone or an email that is not there", () => {
    const recording = recordingContext();
    drawOfficers(passOn(recording, testScene()), { empresa: "X", has1: true, nombre: "Ana" });
    expect(textsOf(recording)).toEqual(["Ana"]);
  });

  it("shrinks only the text that does not fit in its column, down to a minimum", () => {
    const recording = recordingContext();
    const values = officers(3);
    values.email2 = "una.direccion.de.correo.muy.pero.muy.larga.que.no.entra@bancogalicia.com.ar";
    drawOfficers(passOn(recording, testScene()), values);
    expect(recording.texts.find(({ text }) => text === "o1@banco")?.font).toMatch(/^21px/);
    const long = recording.texts.find(({ text }) => text === values.email2)?.font ?? "";
    const size = Number.parseInt(long, 10);
    expect(size).toBeLessThan(21);
    expect(size).toBeGreaterThanOrEqual(9);
    const smallest = recordingContext();
    drawOfficers(
      passOn(smallest, testScene({ calibration: { contacto: { ew: 40, ew3: 40 } } })),
      officers(1),
    );
    expect(smallest.texts[0]?.font).toContain("9px");
  });

  it("scales with the picture and with the target", () => {
    const recording = recordingContext();
    const scene = testScene({ art: paintedCanvas(620, 3228) });
    drawOfficers(passOn(recording, scene), officers(1));
    expect(recording.texts[0]?.font).toContain("12px");
    const half = recordingContext();
    drawOfficers(passOn(half, testScene(), { scale: 0.5 }), officers(1));
    expect(half.texts[0]?.y).toBe(2680);
  });
});

function byBranch(count: number, title = ""): FlyerValues {
  const values = officers(count, { sedes: true, sedesTit: title });
  for (const [number] of OFFICER_SLOTS.slice(0, count)) {
    values[`ubic${number}`] = officerLocationText(`${PIN} Sede ${String(number)}`);
  }
  return values;
}

describe("drawOfficers by branch", () => {
  it("one goes in the middle, with its location over the name", () => {
    const recording = recordingContext();
    const bottom = drawOfficers(passOn(recording, testScene()), byBranch(1));
    expect(recording.texts.map(({ text, x, y }) => [text, x, y])).toEqual([
      [`${PIN} Sede 1`, 620, 5354],
      ["Oficial 1", 620, 5396],
      ["Cel: 1", 620, 5426],
      ["o1@banco", 620, 5454],
    ]);
    expect(recording.texts[0]?.font).toContain("Segoe UI Emoji");
    expect(recording.texts[1]?.font).toContain("bold 24px");
    expect(recording.boxes[0]).toEqual({
      x: 50,
      y: 5330,
      width: 1140,
      height: 172,
      color: "#ffffff",
    });
    expect(bottom).toBe(5502);
  });

  it("eight go in two columns and four rows, under the title", () => {
    const recording = recordingContext();
    const bottom = drawOfficers(passOn(recording, testScene()), byBranch(8, " Nuestras sedes "));
    const title = recording.texts[0];
    expect(title).toMatchObject({ text: "Nuestras sedes", x: 620, y: 5362, color: "#111111" });
    expect(title?.font).toContain("bold 27px");
    expect(recording.boxes[0]).toMatchObject({ y: 5330, height: 64 + 4 * 172 });
    expect(bottom).toBe(5330 + 64 + 4 * 172);
    const names = recording.texts.filter(({ text }) => text.startsWith("Oficial"));
    expect(names).toHaveLength(8);
    expect(names.map(({ x }) => x)).toEqual([335, 905, 335, 905, 335, 905, 335, 905]);
    expect(names.map(({ y }) => y)).toEqual([5460, 5460, 5632, 5632, 5804, 5804, 5976, 5976]);
  });

  it("with nobody, it covers the place and its title", () => {
    const recording = recordingContext();
    const bottom = drawOfficers(passOn(recording, testScene()), byBranch(0, "Título"));
    expect(textsOf(recording)).toEqual(["Título"]);
    expect(bottom).toBe(5330 + 64 + 172);
  });

  it("shrinks a title and a line that do not fit", () => {
    const recording = recordingContext();
    const values = byBranch(2, "Un título bastante más largo de lo que entra en esta banda");
    values.email = "una.direccion.de.correo.muy.pero.muy.larga.que.no.entra@bancogalicia.com.ar";
    drawOfficers(passOn(recording, testScene({ calibration: { contacto: { ewS: 500 } } })), values);
    expect(Number.parseInt(recording.texts[0]?.font.replace("bold ", "") ?? "", 10)).toBeLessThan(
      27,
    );
    const email = recording.texts.find(({ text }) => text === values.email);
    expect(Number.parseInt(email?.font ?? "", 10)).toBeLessThan(21);
  });

  it("the band stays inside the picture", () => {
    const right = recordingContext();
    drawOfficers(
      passOn(right, testScene({ calibration: { contacto: { ex: 600, ewS: 1000 } } })),
      byBranch(1),
    );
    expect(right.boxes[0]).toMatchObject({ x: 240, width: 1000 });
    const left = recordingContext();
    drawOfficers(
      passOn(left, testScene({ calibration: { contacto: { ex: 0, ew: 400, ewS: 1000 } } })),
      byBranch(1),
    );
    expect(left.boxes[0]).toMatchObject({ x: 0, width: 1000 });
    const wide = recordingContext();
    drawOfficers(
      passOn(wide, testScene({ calibration: { contacto: { ewS: 5000 } } })),
      byBranch(1),
    );
    expect(wide.boxes[0]).toMatchObject({ x: 0, width: 1240 });
  });

  it("zeros in the calibration fall back on the usual measures", () => {
    const recording = recordingContext();
    const scene = testScene({
      calibration: {
        contacto: {
          ewS: 0,
          ew3: 0,
          ehS: 0,
          titH: 0,
          titFs: 0,
          titPeso: 0,
          titColor: "",
          sedeDy: 0,
          nomDy: 0,
          celDy: 0,
          mailDy: 0,
          fnSede: 0,
          colSede: "",
        },
      },
    });
    drawOfficers(passOn(recording, scene), byBranch(1, "T"));
    expect(recording.boxes[0]).toMatchObject({ x: 150, width: 940, height: 64 + 160 });
    expect(recording.texts.map(({ text, y }) => [text, y])).toEqual([
      ["T", 5362],
      [`${PIN} Sede 1`, 5418],
      ["Oficial 1", 5460],
      ["Cel: 1", 5490],
      ["o1@banco", 5518],
    ]);
    expect(recording.texts[0]?.font).toContain("bold 27px");
  });
});
