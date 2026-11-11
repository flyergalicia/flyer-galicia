// Who is on the flyer and how much it has to grow for them.
import { effectiveScale } from "./geometry.ts";
import { type FlyerScene, type FlyerValues, OFFICER_SLOTS } from "./types.ts";

const PIN = String.fromCodePoint(0x1f4cd);
const NORMAL_MAX = 4;
const BRANCH_MAX = 8;
const DEFAULT_ROW_HEIGHT = 130;
const DEFAULT_BRANCH_ROW_HEIGHT = 160;
const DEFAULT_TITLE_HEIGHT = 64;

export interface Officer {
  name: string;
  phone: string;
  email: string;
  location: string;
}

/** The ones with a name, in order. The limit comes from the values: history draws like the form. */
export function officersOf(values: FlyerValues): Officer[] {
  const officers: Officer[] = [];
  const max = values.sedes ? BRANCH_MAX : NORMAL_MAX;
  for (const [number, suffix] of OFFICER_SLOTS.slice(0, max)) {
    const name = values[`nombre${suffix}`] ?? "";
    if (values[`has${number}`] && name.trim()) {
      officers.push({
        name,
        phone: values[`celular${suffix}`] ?? "",
        email: values[`email${suffix}`] ?? "",
        location: (values[`ubic${number}`] ?? "").trim(),
      });
    }
  }
  return officers;
}

/** Normal: one row up to three, two with four. By branch: always two columns. */
export function officerRows(count: number, byBranch = false): number {
  if (byBranch) return Math.max(1, Math.ceil(count / (count > 1 ? 2 : 1)));
  return count >= NORMAL_MAX ? 2 : 1;
}

/** The location field holds its own pin: with only the pin in it, there is no location. */
export function officerLocationText(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  return text.split(PIN).join("").trim() ? text : "";
}

/** The height the flyer has to grow, in pixels of the picture, so that the block of officers fits. */
export function extraHeightFor(scene: FlyerScene, values: FlyerValues): number {
  const zone = scene.calibration.contacto;
  const rowHeight = zone.eh || DEFAULT_ROW_HEIGHT;
  const count = officersOf(values).length;
  const toPicture = effectiveScale(scene, 1);
  if (!values.sedes) return (officerRows(count) - 1) * rowHeight * toPicture;
  let height = officerRows(count, true) * (zone.ehS || DEFAULT_BRANCH_ROW_HEIGHT) - rowHeight;
  if ((values.sedesTit ?? "").trim()) height += zone.titH || DEFAULT_TITLE_HEIGHT;
  return Math.max(0, height) * toPicture;
}
