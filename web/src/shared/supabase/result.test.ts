import { describe, expect, it } from "vitest";
import { failure, success } from "./result.ts";

describe("Result", () => {
  it("keeps an empty answer apart from a failure", () => {
    expect(success([])).toEqual({ ok: true, value: [] });
    expect(failure("no network")).toEqual({ ok: false, error: "no network" });
  });
});
