// The button B and Ctrl+B of the legal text. The flyer understands **text** as bold: the asterisks
// are seen on the field, which is the mark, and never on the flyer.
const SPACE = /\s/;
const NOT_SPACE = /\S/;
const MARK = "**";
const MARK_LENGTH = MARK.length;
const MARKED_LENGTH = MARK_LENGTH * 2;

export interface TextSelection {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

/** With nothing selected, the word under the cursor. */
function wordUnderCursor({ value, start, end }: TextSelection): TextSelection {
  if (start !== end) return { value, start, end };
  let from = start;
  let to = start;
  while (from > 0 && NOT_SPACE.test(value.charAt(from - 1))) from -= 1;
  while (to < value.length && NOT_SPACE.test(value.charAt(to))) to += 1;
  return { value, start: from, end: to };
}

function withoutOuterSpaces({ value, start, end }: TextSelection): TextSelection {
  let from = start;
  let to = end;
  while (from < to && SPACE.test(value.charAt(from))) from += 1;
  while (to > from && SPACE.test(value.charAt(to - 1))) to -= 1;
  return { value, start: from, end: to };
}

/** Null: there is nothing to put in bold. */
export function toggleBold(selection: TextSelection): TextSelection | null {
  const word = wordUnderCursor(selection);
  if (word.start === word.end) return null;
  const { value, start, end } = withoutOuterSpaces(word);
  const chosen = value.slice(start, end);
  // Selected with its asterisks.
  if (chosen.length >= MARKED_LENGTH && chosen.startsWith(MARK) && chosen.endsWith(MARK)) {
    return {
      value: value.slice(0, start) + chosen.slice(MARK_LENGTH, -MARK_LENGTH) + value.slice(end),
      start,
      end: end - MARKED_LENGTH,
    };
  }
  // It already was in bold.
  if (
    value.slice(Math.max(0, start - MARK_LENGTH), start) === MARK &&
    value.startsWith(MARK, end)
  ) {
    return {
      value: value.slice(0, start - MARK_LENGTH) + chosen + value.slice(end + MARK_LENGTH),
      start: start - MARK_LENGTH,
      end: end - MARK_LENGTH,
    };
  }
  // Without loose marks inside, not to nest them.
  const clean = chosen.replaceAll(MARK, "");
  return {
    value: `${value.slice(0, start)}${MARK}${clean}${MARK}${value.slice(end)}`,
    start: start + MARK_LENGTH,
    end: start + MARK_LENGTH + clean.length,
  };
}

/** The button lights up with the cursor inside a part in bold. */
export function isInsideBold(value: string, cursor: number): boolean {
  const before = value.slice(0, cursor);
  return before.split(MARK).length % 2 === 0;
}
