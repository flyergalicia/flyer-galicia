import { describe, expect, it } from "vitest";
import { failureKind, isTransientStatus } from "./network-status.ts";

describe("isTransientStatus", () => {
  it.each([0, null, undefined, 408, 429, 500, 502, 503, 504])("%s is passing", (status) => {
    expect(isTransientStatus(status)).toBe(true);
    expect(failureKind(status)).toBe("transient");
  });

  it.each([200, 204, 400, 401, 403, 404, 406, 409, 422])("%s is an answer", (status) => {
    expect(isTransientStatus(status)).toBe(false);
    expect(failureKind(status)).toBe("rejected");
  });
});
