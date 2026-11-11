import { describe, expect, it } from "vitest";
import { mailFromName } from "./officer-mail.ts";

describe("the mail deduced from a name", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["Ana Perez", "ana.perez@bancogalicia.com.ar"],
    ["  Ana   María Pérez ", "ana.perez@bancogalicia.com.ar"],
    ["Julieta A. De Santis", "julieta.desantis@bancogalicia.com.ar"],
    ["Pedro San Martín", "pedro.sanmartin@bancogalicia.com.ar"],
    ["Ana", ""],
    ["Ana A.", ""],
    ["", ""],
    ["!!! Perez", ""],
    ["Ana !!!", ""],
  ];
  for (const [name, mail] of cases) {
    it(`"${name}" gives "${mail}"`, () => {
      expect(mailFromName(name)).toBe(mail);
    });
  }
});
