// A text with some bold words, in pieces instead of HTML. What somebody else wrote stays a piece of
// text: there is no way of it being read as markup (invariant 12).

export type RichPart =
  | string
  | { readonly strong: string | RichText }
  | { readonly code: string }
  | { readonly lineBreak: true };

export type RichText = readonly RichPart[];

function partText(part: RichPart): string {
  if (typeof part === "string") return part;
  if ("code" in part) return part.code;
  if ("lineBreak" in part) return "\n";
  return typeof part.strong === "string" ? part.strong : richTextOf(part.strong);
}

/** The same text without its marks. */
export function richTextOf(text: RichText): string {
  return text.map(partText).join("");
}
