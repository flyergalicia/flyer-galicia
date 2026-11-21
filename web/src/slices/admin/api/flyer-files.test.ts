import { describe, expect, it } from "vitest";
import {
  type Bucket,
  type BucketReadFailure,
  failure,
  type Result,
  success,
} from "@/shared/supabase/index.ts";
import {
  activateHtml,
  activateImage,
  calibrationInHtml,
  deactivateFlyer,
  pictureInHtml,
  readActiveFlyers,
  readUploads,
  removeUpload,
  saveAndActivate,
  uploadFlyerImage,
  uploadHtml,
} from "./flyer-files.ts";

const HOME = "https://cubo/flyers/";
const UNREACHABLE: BucketReadFailure = { kind: "unreachable", status: 503 };
const MISSING: BucketReadFailure = { kind: "not-found", status: 404 };

interface Written {
  readonly file: string;
  readonly content: unknown;
  readonly options: unknown;
}

interface FakeOptions {
  readonly files?: Record<string, Result<unknown, BucketReadFailure>>;
  readonly text?: Result<string, BucketReadFailure>;
  readonly refuse?: string;
  readonly listed?: Awaited<ReturnType<Bucket["list"]>>;
}

function fakeBucket({ files = {}, text, refuse = "", listed }: FakeOptions = {}) {
  const written: Written[] = [];
  const removed: string[][] = [];
  const bucket: Bucket = {
    readJson: (file) => Promise.resolve(files[file] ?? failure(MISSING)),
    publicUrl: (file) => `${HOME}${file}`,
    listedUrl: (name) => `${HOME}${name}`,
    readText: () => Promise.resolve(text ?? failure(MISSING)),
    upload: async (file, body, options) => {
      if (refuse && file.includes(refuse)) {
        return failure({ kind: "rejected", status: 500, message: "falla simulada" });
      }
      const content =
        body instanceof Blob && body.type === "application/json"
          ? (JSON.parse(await body.text()) as unknown)
          : body;
      written.push({ file, content, options });
      return success(undefined);
    },
    list: () => Promise.resolve(listed ?? success([])),
    remove: (names) => {
      removed.push([...names]);
      return Promise.resolve(
        refuse ? failure({ kind: "rejected", status: 500, message: "no" }) : success(undefined),
      );
    },
  };
  return { bucket, written, removed };
}

const HTML_PICTURE = `<script>baseImg.src = "data:image/jpeg;base64,${btoa("vieja")}";\nbaseImg.src='data:image/png;base64,${btoa("nueva")}';</script><script id="flyer-cfg" type="application/json">{"imgH":7000}</script>`;

describe("what each option has active", () => {
  it("a file is its flyer, none is no flyer, and one that did not arrive stops everything", async () => {
    const { bucket } = fakeBucket({
      files: {
        "_active9.json": success({ name: "a.jpg", imageUrl: "u", htmlUrl: "h" }),
        "_active.json": success({ name: "", imageUrl: null }),
        "_active8.json": success("raro"),
      },
    });
    const active = await readActiveFlyers(bucket, [1, 9, 8, 7]);
    expect(active.get(9)).toEqual({ name: "a.jpg", imageUrl: "u", htmlUrl: "h" });
    expect(active.get(1)).toEqual({ name: "", imageUrl: null, htmlUrl: null });
    expect(active.get(8)).toEqual({ name: "", imageUrl: null, htmlUrl: null });
    expect(active.get(7)).toBeNull();
    const broken = fakeBucket({ files: { "_active9.json": failure(UNREACHABLE) } });
    await expect(readActiveFlyers(broken.bucket, [9])).rejects.toThrow(
      "no se pudo leer qué flyer tiene cada opción",
    );
  });

  it("the versions are the last fifty, without the files of the app, with their size", async () => {
    const asked: unknown[] = [];
    const { bucket } = fakeBucket({
      listed: success([
        { name: "_active9.json" },
        { name: "flyer_1_op9.jpg", created_at: "2026-10-20", metadata: { size: 2048 } },
        { name: "index_1.html" },
      ]),
    });
    const { list } = bucket;
    const watched: Bucket = {
      ...bucket,
      list: (prefix, options) => {
        asked.push({ prefix, options });
        return list(prefix, options);
      },
    };
    expect(await readUploads(watched)).toEqual([
      {
        name: "flyer_1_op9.jpg",
        url: `${HOME}flyer_1_op9.jpg`,
        isImage: true,
        createdAt: "2026-10-20",
        size: 2048,
      },
      {
        name: "index_1.html",
        url: `${HOME}index_1.html`,
        isImage: false,
        createdAt: null,
        size: null,
      },
    ]);
    expect(asked).toEqual([
      { prefix: "", options: { limit: 50, sortBy: { column: "created_at", order: "desc" } } },
    ]);
    const broken = fakeBucket({
      listed: failure({ kind: "rejected", status: 500, message: "sin lista" }),
    });
    await expect(readUploads(broken.bucket)).rejects.toThrow("sin lista");
  });
});

describe("activating and deactivating", () => {
  it("an image takes its calibration and a new address", async () => {
    const { bucket, written } = fakeBucket({
      files: { "_flyer_cfgs.json": success({ "a.jpg": { imgH: 7000 } }) },
    });
    const file = { name: "a.jpg", url: `${HOME}a.jpg` };
    expect(await activateImage(bucket, file, 9, 5)).toEqual(success(undefined));
    expect(written[0]?.file).toBe("_active9.json");
    expect(written[0]?.content).toMatchObject({
      name: "a.jpg",
      imageUrl: `${HOME}a.jpg?v=5`,
      cfg: { imgH: 7000 },
    });
    expect(Object.keys(Object(written[0]?.content))).toEqual([
      "name",
      "imageUrl",
      "cfg",
      "updated_at",
    ]);
    await activateImage(bucket, { name: "b.jpg", url: `${HOME}b.jpg` }, 1, 6);
    expect(written[1]).toMatchObject({ file: "_active.json", content: { cfg: null } });
  });

  it("calibrations that could not be read do not activate with none (invariant 24)", async () => {
    const { bucket, written } = fakeBucket({ files: { "_flyer_cfgs.json": failure(UNREACHABLE) } });
    expect(await activateImage(bucket, { name: "a.jpg", url: "u" }, 9, 5)).toEqual(
      failure("no se pudieron leer las calibraciones guardadas"),
    );
    expect(written).toEqual([]);
  });

  it("deactivating takes the picture out, not the option", async () => {
    const { bucket, written } = fakeBucket();
    expect(await deactivateFlyer(bucket, 9)).toEqual(success(undefined));
    expect(written[0]?.file).toBe("_active9.json");
    // A fixed name is never kept for long: whoever enters next asks for it again.
    expect(written[0]?.options).toEqual({ contentType: "application/json", upsert: true });
    expect(written[0]?.content).toMatchObject({ name: "", imageUrl: null });
    const refused = fakeBucket({ refuse: "_active" });
    expect(await deactivateFlyer(refused.bucket, 9)).toEqual(failure("falla simulada"));
  });

  it("deleting a file", async () => {
    const { bucket, removed } = fakeBucket();
    expect(await removeUpload(bucket, "a.jpg")).toEqual(success(undefined));
    expect(removed).toEqual([["a.jpg"]]);
    const refused = fakeBucket({ refuse: "x" });
    expect(await removeUpload(refused.bucket, "a.jpg")).toEqual(failure("no"));
  });
});

describe("uploading", () => {
  it("a new picture is kept a year; an HTML goes up as it is", async () => {
    const { bucket, written } = fakeBucket();
    const picture = new Blob(["jpg"], { type: "image/jpeg" });
    expect(await uploadFlyerImage(bucket, "flyer_5_op9.jpg", picture)).toEqual(success(undefined));
    expect(written[0]).toMatchObject({
      file: "flyer_5_op9.jpg",
      options: { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" },
    });
    expect(await uploadHtml(bucket, new Blob(["<html>"]), 7)).toEqual(
      success(`${HOME}index_7.html`),
    );
    expect(written[1]).toMatchObject({
      file: "index_7.html",
      options: { contentType: "text/html", upsert: true },
    });
  });

  it("says what failed", async () => {
    const { bucket } = fakeBucket({ refuse: "flyer_" });
    expect(await uploadFlyerImage(bucket, "flyer_5_op9.jpg", new Blob(["x"]))).toEqual(
      failure("falla simulada"),
    );
    const html = fakeBucket({ refuse: "index_" });
    expect(await uploadHtml(html.bucket, new Blob(["x"]), 7)).toEqual(failure("falla simulada"));
  });
});

describe("Guardar y activar", () => {
  it("the calibration under the name of the image, then the flyer of the option", async () => {
    const { bucket, written } = fakeBucket({
      files: { "_flyer_cfgs.json": success({ "otro.jpg": { imgH: 1 } }) },
    });
    const calibrated = { name: "a.jpg", url: `${HOME}a.jpg`, option: 9, cfg: { imgH: 2 } };
    expect(await saveAndActivate(bucket, calibrated, 8)).toEqual(success(undefined));
    expect(written.map(({ file }) => file)).toEqual(["_flyer_cfgs.json", "_active9.json"]);
    expect(written[0]?.content).toEqual({ "otro.jpg": { imgH: 1 }, "a.jpg": { imgH: 2 } });
    expect(written[1]?.content).toMatchObject({ imageUrl: `${HOME}a.jpg?v=8`, cfg: { imgH: 2 } });
  });

  it("says which step failed, and a map that could not be read is not written over", async () => {
    const unread = fakeBucket({ files: { "_flyer_cfgs.json": failure(UNREACHABLE) } });
    const calibrated = { name: "a.jpg", url: "u", option: 9, cfg: {} };
    expect(await saveAndActivate(unread.bucket, calibrated, 8)).toEqual(
      failure({ step: "save", message: "no se pudieron leer las calibraciones guardadas" }),
    );
    expect(unread.written).toEqual([]);
    const refused = fakeBucket({ refuse: "_active" });
    expect(await saveAndActivate(refused.bucket, calibrated, 8)).toEqual(
      failure({ step: "activate", message: "falla simulada" }),
    );
  });
});

describe("the HTML of the build", () => {
  it("carries its picture (the last one) and its calibration inside", async () => {
    const picture = pictureInHtml(HTML_PICTURE);
    expect(picture?.type).toBe("image/png");
    expect(picture?.extension).toBe("png");
    expect(await picture?.blob.text()).toBe("nueva");
    expect(pictureInHtml("<html>sin imagen</html>")).toBeNull();
    expect(pictureInHtml(`baseImg.src="data:image/jpeg;base64,${btoa("x")}"`)?.extension).toBe(
      "jpg",
    );
    expect(calibrationInHtml(HTML_PICTURE)).toEqual({ imgH: 7000 });
    expect(calibrationInHtml('<script id="flyer-cfg">{roto</script>')).toBeNull();
    expect(calibrationInHtml("<html></html>")).toBeNull();
  });

  it("activating it uploads its picture alone and points the option to it, with a version", async () => {
    const { bucket, written } = fakeBucket({ text: success(HTML_PICTURE) });
    const file = { name: "index_1.html", url: `${HOME}index_1.html` };
    expect(await activateHtml(bucket, file, 9, 4)).toEqual(success(undefined));
    expect(written.map(({ file: name }) => name)).toEqual(["_active9_img.png", "_active9.json"]);
    expect(written[0]?.options).toEqual({ contentType: "image/png", upsert: true });
    expect(written[1]?.content).toMatchObject({
      name: "index_1.html",
      htmlUrl: `${HOME}index_1.html`,
      imageUrl: `${HOME}_active9_img.png?v=4`,
      cfg: { imgH: 7000 },
    });
    await activateHtml(bucket, file, 1, 4);
    expect(written[2]?.file).toBe("_active_img.png");
  });

  it("says why it could not", async () => {
    const file = { name: "index_1.html", url: "u" };
    expect(await activateHtml(fakeBucket().bucket, file, 9, 4)).toEqual(failure("HTTP 404"));
    const offline = fakeBucket({ text: failure({ kind: "unreachable", status: null }) });
    expect(await activateHtml(offline.bucket, file, 9, 4)).toEqual(failure("sin conexión"));
    const empty = fakeBucket({ text: success("<html></html>") });
    expect(await activateHtml(empty.bucket, file, 9, 4)).toEqual(
      failure("No se encontró la imagen en el HTML"),
    );
    const refused = fakeBucket({ text: success(HTML_PICTURE), refuse: "_img" });
    expect(await activateHtml(refused.bucket, file, 9, 4)).toEqual(failure("falla simulada"));
  });
});
