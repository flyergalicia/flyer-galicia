import { describe, expect, it } from "vitest";
import { hasComplexityDisable } from "./check-lint-policy.ts";

describe("hasComplexityDisable", () => {
  it.each([
    "// oxlint-disable-next-line complexity",
    "/* oxlint-disable complexity */",
    "// eslint-disable-line complexity",
  ])("rejects %s", (comment) => {
    expect(hasComplexityDisable(comment)).toBe(true);
  });

  it("accepts disabling other rules", () => {
    expect(hasComplexityDisable("// oxlint-disable-next-line no-console")).toBe(false);
  });
});
