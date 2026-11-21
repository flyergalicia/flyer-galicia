import { describe, expect, it } from "vitest";
import {
  ACCEPTED_FLYER_FILES,
  type ActiveFlyer,
  flyerFileKind,
  isImageName,
  newFlyerImage,
  newHtmlFile,
  optionsOfFile,
  optionToCalibrate,
  safeHtmlUrl,
  sizeText,
  splitByFlyer,
  type UploadedFlyer,
  uploadProblem,
  versionActions,
  withVersion,
} from "./flyer-config.ts";

const flyer = (name: string, imageUrl: string | null = "x"): ActiveFlyer => ({
  name,
  imageUrl,
  htmlUrl: null,
});

const file = (name: string, isImage = true): UploadedFlyer => ({
  name,
  url: `bucket/${name}`,
  isImage,
  createdAt: null,
  size: null,
});

describe("what a file can be", () => {
  it("takes PDF, PNG, JPG and the HTML of the build, by name or by type", () => {
    expect(ACCEPTED_FLYER_FILES).toBe(
      ".pdf,.png,.jpg,.jpeg,.html,application/pdf,image/*,text/html",
    );
    expect(flyerFileKind({ name: "a.HTM", type: "" })).toBe("html");
    expect(flyerFileKind({ name: "a", type: "text/html" })).toBe("html");
    expect(flyerFileKind({ name: "a.pdf", type: "" })).toBe("pdf");
    expect(flyerFileKind({ name: "a", type: "application/pdf" })).toBe("pdf");
    expect(flyerFileKind({ name: "a.jpeg", type: "" })).toBe("image");
    expect(flyerFileKind({ name: "a", type: "image/webp" })).toBe("image");
    expect(flyerFileKind({ name: "datos.txt", type: "text/plain" })).toBeNull();
  });

  it("refuses what is not a flyer and what weighs more than 25 MB, saying why", () => {
    expect(uploadProblem({ name: "datos.txt", type: "text/plain", size: 1 })).toBe(
      "Formatos permitidos: PDF, PNG, JPG o HTML.",
    );
    expect(uploadProblem({ name: "a.pdf", type: "", size: 25 * 1024 * 1024 + 1 })).toBe(
      "El archivo supera los 25 MB.",
    );
    expect(uploadProblem({ name: "a.pdf", type: "", size: 25 * 1024 * 1024 })).toBe("");
    expect(uploadProblem({ name: "a.png", type: "" })).toBe("");
  });
});

describe("names and addresses (invariant 4)", () => {
  it("a new flyer carries the time and the option; an HTML, the time", () => {
    expect(newFlyerImage(1730000000000, 9)).toBe("flyer_1730000000000_op9.jpg");
    expect(newHtmlFile(1730000000000)).toBe("index_1730000000000.html");
  });

  it("the address goes with its version, after what it already asks", () => {
    expect(withVersion("bucket/a.jpg", 5)).toBe("bucket/a.jpg?v=5");
    expect(withVersion("bucket/a.jpg?t=1", 5)).toBe("bucket/a.jpg?t=1&v=5");
  });
});

describe("what the list says of each version", () => {
  const options = [1, 9, 8];

  it("its option is where it is active or, if nowhere, the one in its name", () => {
    const active = new Map([
      [1, null],
      [9, flyer("flyer_1_op9.jpg")],
      [8, flyer("flyer_1_op9.jpg")],
    ]);
    expect(optionsOfFile("flyer_1_op9.jpg", options, active)).toEqual({ active: [9, 8], home: 9 });
    expect(optionsOfFile("flyer_2_op8.jpg", options, active)).toEqual({ active: [], home: 8 });
    expect(optionsOfFile("flyer_2_op4.jpg", options, active)).toEqual({ active: [], home: 0 });
    expect(optionsOfFile("viejo.jpg", options, active)).toEqual({ active: [], home: 0 });
  });

  it("the options with a flyer go first, those without one last", () => {
    const active = new Map([
      [1, null],
      [9, flyer("a.jpg")],
      [8, flyer("", null)],
    ]);
    expect(splitByFlyer(options, active)).toEqual({ withFlyer: [9], withoutFlyer: [1, 8] });
  });

  it("what it offers: Activar on its own option, Otra opción, and Calibrar if it is a picture", () => {
    expect(versionActions(file("a.jpg"), { active: [], home: 9 })).toEqual([
      "activate",
      "other-option",
      "calibrate",
    ]);
    expect(versionActions(file("a.jpg"), { active: [9], home: 9 })).toEqual([
      "other-option",
      "calibrate",
    ]);
    expect(versionActions(file("index_1.html", false), { active: [], home: 0 })).toEqual([
      "activate-in",
    ]);
  });

  it("calibrates the one option it is active in, or its own; else it asks", () => {
    expect(optionToCalibrate({ active: [9], home: 9 })).toBe(9);
    expect(optionToCalibrate({ active: [], home: 8 })).toBe(8);
    expect(optionToCalibrate({ active: [9, 8], home: 9 })).toBeNull();
    expect(optionToCalibrate({ active: [], home: 0 })).toBeNull();
  });

  it("an HTML is linked only if it lives in our bucket", () => {
    expect(safeHtmlUrl("https://cubo/flyers/index_1.html", "https://cubo/flyers/")).toBe(
      "https://cubo/flyers/index_1.html",
    );
    expect(safeHtmlUrl("javascript:alert(1)", "https://cubo/flyers/")).toBeNull();
    expect(safeHtmlUrl(null, "https://cubo/flyers/")).toBeNull();
  });

  it("its size and whether it is a picture", () => {
    expect(sizeText(812_345)).toBe("793 KB");
    expect(sizeText(null)).toBe("");
    expect(isImageName("a.PNG")).toBe(true);
    expect(isImageName("index_1.html")).toBe(false);
  });
});
