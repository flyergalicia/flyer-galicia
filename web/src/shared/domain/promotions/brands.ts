// The same brand under several names. Galicia loads it many times with a different ending: "Seru
// Giran - Neuquén", "Babasonicos en Tucumán", "Columbia.com.ar".
import { decodeEntities, normalizeText, rememberedText } from "./text.ts";

const VARIANT_ENDING = /\s[-–—]\s|\s+en\s+|\.com|\s*\(/i;

export const baseBrand = rememberedText((title) => {
  const [name = ""] = decodeEntities(title).split(VARIANT_ENDING);
  return normalizeText(name) || normalizeText(title);
});

/**
 * A short name gathers those that start with it ONLY if that name exists on its own. "Adidas" exists,
 * so "Adidas MDQ" falls with it; nothing is called just "Farmacia", so the pharmacies stay apart.
 */
export function brandGroupKey(base: string, bases: ReadonlySet<string>): string {
  let name = "";
  for (const word of base.split(" ")) {
    name = name ? `${name} ${word}` : word;
    if (bases.has(name)) return name;
  }
  return base;
}
