import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { useFlyerForm } from "./form-context.ts";
import { useFlyerHistory } from "./history-context.ts";

function NeedsIt() {
  useFlyerForm();
  return null;
}

function NeedsTheHistory() {
  useFlyerHistory();
  return null;
}

describe("the form", () => {
  it("needs its provider", async () => {
    await expect(render(<NeedsIt />)).rejects.toThrow(/FlyerFormProvider/);
    await expect(render(<NeedsTheHistory />)).rejects.toThrow(/FlyerFormProvider/);
  });
});
