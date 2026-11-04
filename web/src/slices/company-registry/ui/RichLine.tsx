import { Fragment } from "react";
import type { RichPart, RichText } from "@/shared/domain/rich-text.ts";

function Part({ part }: { readonly part: RichPart }) {
  if (typeof part === "string") return part;
  if ("code" in part) return <code>{part.code}</code>;
  if ("lineBreak" in part) return <br />;
  return (
    <strong>
      {typeof part.strong === "string" ? part.strong : <RichLine text={part.strong} />}
    </strong>
  );
}

/** A text with its marks, in pieces: nothing of what it says can be read as markup. */
export function RichLine({ text }: { readonly text: RichText }) {
  // The pieces of a line never move, and the same word can be there twice.
  const pieces = text.map((part, position) => ({ part, key: String(position) }));
  return pieces.map(({ part, key }) => (
    <Fragment key={key}>
      <Part part={part} />
    </Fragment>
  ));
}
