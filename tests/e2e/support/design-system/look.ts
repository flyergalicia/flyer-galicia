import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Locator, type Page } from "@playwright/test";
import {
  type AppearanceName,
  APPEARANCES,
  STORY_FIRST_ELEMENT,
  type LookCase,
  type LookState,
} from "./cases.ts";
import { type Box } from "./images.ts";

const LOOK_PROPERTIES = [
  "color",
  "background-color",
  "background-image",
  "border-top-width",
  "border-top-style",
  "border-top-color",
  "border-right-width",
  "border-right-color",
  "border-bottom-width",
  "border-bottom-style",
  "border-bottom-color",
  "border-left-width",
  "border-left-color",
  "border-top-left-radius",
  "border-bottom-right-radius",
  "box-shadow",
  "font-family",
  "font-size",
  "font-weight",
  "font-variant-numeric",
  "letter-spacing",
  "line-height",
  "text-transform",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "opacity",
  "cursor",
  "column-gap",
  "white-space",
] as const;

export type ComputedLook = Record<string, string>;

export function readLook(element: Locator): Promise<ComputedLook> {
  return element.evaluate((node, properties) => {
    const style = getComputedStyle(node);
    return Object.fromEntries(properties.map((name) => [name, style.getPropertyValue(name)]));
  }, LOOK_PROPERTIES);
}

/** Goes to a state in the way a person does. Rest is already there. */
export async function enterState(element: Locator, page: Page, state: LookState): Promise<void> {
  const { height = 0, width = 0 } = page.viewportSize() ?? {};
  await page.mouse.move(width - 1, height - 1);
  if (state === "hover") await element.hover({ force: true });
  if (state === "focus") await element.focus();
}

export function storyUrl(base: string, story: string, appearance: AppearanceName): string {
  const { dark, palette } = APPEARANCES[appearance];
  const [component, name] = story.includes("/") ? story.split("/") : ["Reference", story];
  const id = `shared-ui-${(component ?? "").toLowerCase()}--${kebab(name ?? "")}`;
  const globals = `palette:${palette};dark:${String(dark)}`;
  return `${base}iframe.html?id=${id}&viewMode=story&globals=${encodeURIComponent(globals)}`;
}

function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

export async function openStory(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page
    .locator('#storybook-root > *, dialog, [role="alertdialog"], output')
    .first()
    .waitFor({ state: "attached" });
  // The browser only asks for a font when something needs it: until then "ready" is true.
  await page.evaluate(async () => {
    const weights = ["400", "500", "600", "700", "800"];
    await Promise.all(weights.map((weight) => document.fonts.load(`${weight} 13px Figtree`)));
    await document.fonts.ready;
  });
}

export interface StoryElement {
  read: Locator;
  /** Its size in that place, to know that it came out that big by itself. */
  natural: Box;
}

function sizeOf(element: Locator): Promise<Box> {
  return element.evaluate((node) => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  });
}

/** Puts what is being compared in the place it had in the old app, on the same background. */
export async function placeStory(
  page: Page,
  look: LookCase,
  box: Box,
  background: string,
): Promise<StoryElement> {
  const read = page.locator(look.target ?? STORY_FIRST_ELEMENT).first();
  await page.evaluate((color) => {
    document.documentElement.style.background = color;
    document.body.style.background = color;
  }, background);
  if (look.place === "none") return { read, natural: await sizeOf(read) };
  const natural = await sizeOf(read);
  const placed = page.locator(look.place ?? look.target ?? STORY_FIRST_ELEMENT).first();
  await placed.evaluate(
    (node, { x, y, width, height, forceHeight, keepWidth }) => {
      if (!(node instanceof HTMLElement)) return;
      const { style } = node;
      style.position = "fixed";
      style.left = `${String(x)}px`;
      style.top = `${String(y)}px`;
      style.right = "auto";
      style.bottom = "auto";
      if (!keepWidth) style.width = `${String(width)}px`;
      style.margin = "0";
      style.boxSizing = "border-box";
      if (forceHeight) style.height = `${String(height)}px`;
    },
    {
      ...box,
      forceHeight: look.place !== undefined || look.stretched === true,
      keepWidth: look.fits === true,
    },
  );
  return { read, natural: { ...natural, height: (await sizeOf(read)).height } };
}

/** The whole set of custom properties set on <html>, with their values. */
export function customProperties(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const names = [...root.computedStyleMap().keys()].filter((name) => name.startsWith("--"));
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  });
}

function channel(hex: string): number {
  return Number.parseInt(hex.length === 1 ? hex + hex : hex, 16);
}

/** Two decimals are enough: #ffffff24 and an alpha of 0.14 are the same color, written by a minifier. */
function canonicalColor(red: number, green: number, blue: number, alpha: number): string {
  return `rgba(${String(red)},${String(green)},${String(blue)},${String(Math.round(alpha * 100) / 100)})`;
}

function hexColor(hex: string): string {
  const size = hex.length <= 4 ? 1 : 2;
  const parts = hex.match(new RegExp(`.{${String(size)}}`, "g")) ?? [];
  const [red = 0, green = 0, blue = 0, alpha = 255] = parts.map(channel);
  return canonicalColor(red, green, blue, alpha / 255);
}

/**
 * The same value written differently: capitals, spaces, 0.5 or .5, and the shorter forms that the
 * build leaves in the CSS, such as #fff, or a gradient without its default direction.
 */
export function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)/g, (_all, red, green, blue, alpha) =>
      canonicalColor(Number(red), Number(green), Number(blue), Number(alpha ?? 1)),
    )
    .replace(/#([0-9a-f]{3,8})\b/g, (_all, hex: string) => hexColor(hex))
    .replace(/linear-gradient\(180deg,/g, "linear-gradient(")
    .replace(/\b(rgba\([^)]*\))0%/g, "$1 0%")
    .replace(/\s/g, "")
    .replace(/at0%0%/g, "at0%0%");
}

export interface SmallText {
  text: string;
  size: number;
}

/** Text below the agreed minimum: 12px, or 11px in capitals. */
export function textBelowMinimum(page: Page): Promise<SmallText[]> {
  return page.evaluate(() => {
    const found: { text: string; size: number }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const { parentElement, textContent } = walker.currentNode;
      const text = textContent?.trim() ?? "";
      if (parentElement && text && !["SCRIPT", "STYLE"].includes(parentElement.tagName)) {
        const style = getComputedStyle(parentElement);
        const size = Number.parseFloat(style.fontSize);
        const hasLetters = /\p{L}/u.test(text);
        const hasDigits = /\p{N}/u.test(text);
        // Capitals and the number of a counter can go down to 11; marks such as the sort arrow are
        // symbols, not text to read.
        const minimum = hasLetters && style.textTransform !== "uppercase" ? 12 : 11;
        if ((hasLetters || hasDigits) && size < minimum)
          found.push({ text: text.slice(0, 40), size });
      }
    }
    return found;
  });
}

const STORYBOOK_INDEX = fileURLToPath(
  new URL("../../../../storybook-static/index.json", import.meta.url),
);
/** The harness stories only give tests a way in: they show no text of their own. */
const HARNESS_STORY = /cloudharness|engineharness/;

interface StorybookIndexEntry {
  id?: unknown;
  type?: unknown;
}

function isEntryMap(value: unknown): value is { entries: Record<string, StorybookIndexEntry> } {
  return typeof value === "object" && value !== null && "entries" in value;
}

export function allStoryIds(): string[] {
  const index: unknown = JSON.parse(readFileSync(STORYBOOK_INDEX, "utf8"));
  if (!isEntryMap(index)) throw new Error("storybook-static/index.json has no entries");
  return Object.values(index.entries).flatMap(({ id, type }) =>
    type === "story" && typeof id === "string" && !HARNESS_STORY.test(id) ? [id] : [],
  );
}
