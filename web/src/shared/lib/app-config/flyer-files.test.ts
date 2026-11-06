import { describe, expect, it } from "vitest";
import {
  type Bucket,
  type BucketReadFailure,
  failure,
  type Result,
  success,
} from "@/shared/supabase/index.ts";
import { readFlyerCalibrations, readLegalText, saveFlyerCalibration } from "./flyer-files.ts";

function bucketWith(
  answers: Record<string, Result<unknown, BucketReadFailure>>,
  refuse = false,
): { bucket: Bucket; written: unknown[] } {
  const written: unknown[] = [];
  const bucket: Bucket = {
    readJson: (file) =>
      Promise.resolve(answers[file] ?? failure({ kind: "not-found", status: 404 })),
    publicUrl: (file) => file,
    listedUrl: (name) => name,
    readText: () => Promise.resolve(success("")),
    upload: async (_file, body) => {
      if (refuse) return failure({ kind: "transient", status: 503, message: "ocupado" });
      written.push(body instanceof Blob ? JSON.parse(await body.text()) : body);
      return success(undefined);
    },
    list: () => Promise.resolve(success([])),
    remove: () => Promise.resolve(success(undefined)),
  };
  return { bucket, written };
}

describe("the legal text of an option", () => {
  it("is its text; empty if it has none or it could not be read", async () => {
    expect(
      await readLegalText(
        bucketWith({ "_legal9.json": success({ text: "Hola" }) }).bucket,
        "_legal9.json",
      ),
    ).toBe("Hola");
    expect(
      await readLegalText(
        bucketWith({ "_legal9.json": success({ text: 3 }) }).bucket,
        "_legal9.json",
      ),
    ).toBe("");
    expect(
      await readLegalText(bucketWith({ "_legal9.json": success("raro") }).bucket, "_legal9.json"),
    ).toBe("");
    expect(await readLegalText(bucketWith({}).bucket, "_legal9.json")).toBe("");
  });
});

describe("the calibration of each image", () => {
  it("none saved yet is an empty map; one that could not be read is not", async () => {
    expect(await readFlyerCalibrations(bucketWith({}).bucket)).toEqual(success({}));
    expect(
      await readFlyerCalibrations(bucketWith({ "_flyer_cfgs.json": success(["raro"]) }).bucket),
    ).toEqual(success({}));
    const unreachable = failure<BucketReadFailure>({ kind: "unreachable", status: 503 });
    expect(
      await readFlyerCalibrations(bucketWith({ "_flyer_cfgs.json": unreachable }).bucket),
    ).toEqual(unreachable);
  });

  it("is saved beside the others, read right before (invariant 24)", async () => {
    const { bucket, written } = bucketWith({
      "_flyer_cfgs.json": success({ "a.jpg": { imgH: 1 } }),
    });
    expect(await saveFlyerCalibration(bucket, "b.jpg", { imgH: 2 })).toEqual(success(undefined));
    expect(written).toEqual([{ "a.jpg": { imgH: 1 }, "b.jpg": { imgH: 2 } }]);
    const unread = bucketWith({
      "_flyer_cfgs.json": failure({ kind: "unreachable", status: null }),
    });
    expect(await saveFlyerCalibration(unread.bucket, "b.jpg", {})).toEqual(
      failure("no se pudieron leer las calibraciones guardadas"),
    );
    expect(unread.written).toEqual([]);
    expect(await saveFlyerCalibration(bucketWith({}, true).bucket, "b.jpg", {})).toEqual(
      failure("ocupado"),
    );
  });
});
