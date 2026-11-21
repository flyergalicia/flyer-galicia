import { describe, expect, it } from "vitest";
import { createInventedBackend } from "@/shared/supabase/testing/invented-backend.ts";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { optionHasFlyer, readActive } from "./option-active.ts";

function bucketAnswering(body: unknown, status = 200) {
  return createInventedBackend(() => jsonResponse(body, status)).backend.bucket;
}

describe("what an option publishes", () => {
  it("has a flyer if it has a picture", async () => {
    const bucket = bucketAnswering({ imageUrl: "https://x/a.jpg?v=1", cfg: { a: 1 } });
    await expect(optionHasFlyer(bucket, 9)).resolves.toBe(true);
    await expect(readActive(bucket, 9)).resolves.toEqual({
      failed: false,
      imageUrl: "https://x/a.jpg?v=1",
      calibration: { a: 1 },
    });
  });

  it("an empty picture, or a file that does not say, is a firm no", async () => {
    await expect(optionHasFlyer(bucketAnswering({ imageUrl: null }), 9)).resolves.toBe(false);
    await expect(optionHasFlyer(bucketAnswering({ imageUrl: "" }), 9)).resolves.toBe(false);
    await expect(optionHasFlyer(bucketAnswering(null), 9)).resolves.toBe(false);
  });

  it("a file that does not exist is a firm no as well", async () => {
    await expect(optionHasFlyer(bucketAnswering({}, 404), 9)).resolves.toBe(false);
  });

  it("could not be asked is no answer at all (invariant 24)", async () => {
    await expect(optionHasFlyer(bucketAnswering({}, 503), 9)).resolves.toBeNull();
  });
});
