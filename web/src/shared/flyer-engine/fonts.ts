// The fonts of the flyer. Canvas draws with what it has at that moment, so a font that arrives later
// needs another draw.
import { type FontWeight } from "./types.ts";

const BASE_FAMILY = "Arial,sans-serif";
const FIGTREE_SHEET =
  "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap";
const FIGTREE_LINK_ID = "fg-benef-font";

/** The weight as a prefix of the font ("bold ", "600 "). No saved value means bold. */
export function fontWeightPrefix(weight: FontWeight | undefined): string {
  return weight === null || weight === undefined || weight === "" ? "bold " : `${String(weight)} `;
}

export function setFont(
  ctx: CanvasRenderingContext2D,
  prefix: string,
  size: number,
  family: string = BASE_FAMILY,
): void {
  ctx.font = `${prefix}${String(size)}px ${family}`;
}

function loadAll(fonts: FontFaceSet, descriptors: readonly string[], onReady: () => void): void {
  Promise.all(descriptors.map((descriptor) => fonts.load(descriptor))).then(onReady, () => {
    // With no font the canvas stays with its fallback: the flyer still comes out.
  });
}

/** The font of the benefit box. It is asked for once, however many times this is called. */
export function createBenefitFontLoader(fonts: FontFaceSet, onReady: () => void): () => void {
  let asked = false;
  return () => {
    if (asked) return;
    asked = true;
    if (!document.getElementById(FIGTREE_LINK_ID)) {
      const link = document.createElement("link");
      link.id = FIGTREE_LINK_ID;
      link.rel = "stylesheet";
      link.href = FIGTREE_SHEET;
      document.head.append(link);
    }
    loadAll(
      fonts,
      [400, 500, 600, 700, 800].map((weight) => `${String(weight)} 20px "Figtree"`),
      onReady,
    );
  };
}

/** The font of the texts of Cambiar logos. It is asked for once, however many times this is called. */
export function createLogoTextFontLoader(fonts: FontFaceSet, onReady: () => void): () => void {
  let asked = false;
  return () => {
    if (asked) return;
    asked = true;
    loadAll(fonts, ["500 40px Figtree", "700 40px Figtree"], onReady);
  };
}
