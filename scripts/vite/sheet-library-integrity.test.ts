import { describe, expect, it } from "vitest";
import {
  integrityOf,
  SHEET_LIBRARY_INTEGRITY,
  verifiedSheetLibraryIntegrity,
} from "./sheet-library-integrity.ts";

const changedFile = () => new TextEncoder().encode("otra cosa");

describe("the sheets library", () => {
  it("is the file that was checked", () => {
    expect(verifiedSheetLibraryIntegrity()).toBe(SHEET_LIBRARY_INTEGRITY);
  });

  it("a changed file stops the build", () => {
    expect(() => verifiedSheetLibraryIntegrity(changedFile)).toThrow(/does not match its hash/);
  });

  it("the hash is the one a browser works out", () => {
    expect(integrityOf(new TextEncoder().encode("abc"))).toBe(
      "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn",
    );
  });
});
