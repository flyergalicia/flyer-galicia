// Admin → Uso: how many flyers come out, of which flyer, by which profiles and week by week, and
// what Estudio did in the period. It is counted in the browser from `flyer_logs`.
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const WEEKS_SHOWN = 12;
const TOP = 10;

export type UsagePeriod = "30" | "90" | "anio";

export const USAGE_PERIODS: readonly (readonly [UsagePeriod, string])[] = [
  ["30", "30 días"],
  ["90", "90 días"],
  ["anio", "Este año"],
];

const ROLE_NAMES: Readonly<Record<string, string>> = {
  admin: "Admin",
  vip: "VIP",
  pro: "Pro",
  asesor: "Asesor",
  hunter: "Hunter",
  lider: "Líder",
  prospect: "Prospect",
};

export function usageSince(period: UsagePeriod, now: Date): Date {
  if (period === "anio") return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getTime() - Number(period) * DAY_MS);
}

export interface UsageLog {
  readonly user_id: string | null;
  readonly is_bulk: boolean | null;
  readonly bulk_count: number | null;
  readonly flyer_type: string | null;
  readonly created_at: string | null;
}

export interface UsagePerson {
  readonly id: string;
  readonly full_name: string | null;
  readonly email_asesor: string | null;
  readonly role: string | null;
}

export interface StudioWork {
  readonly estado: string;
  readonly created_at: string;
  readonly pedido_at: string | null;
  readonly revisado_at: string | null;
}

export interface UsageBar {
  readonly label: string;
  readonly count: number;
  /** The color of the flyer, on the bars of each flyer. */
  readonly color?: string;
}

export interface UsageFlyers {
  readonly label: (option: number) => string;
  readonly color: (option: number) => string;
  readonly exists: (option: number) => boolean;
}

export interface UsageBoard {
  readonly total: number;
  readonly oneByOne: number;
  readonly inBatches: number;
  readonly people: number;
  readonly perPerson: string;
  readonly byFlyer: readonly UsageBar[];
  readonly byRole: readonly UsageBar[];
  readonly byWeek: readonly UsageBar[];
  readonly top: readonly UsageBar[];
}

function mondayOf(value: string | number | Date): number {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.getTime();
}

function optionOf(flyerType: string | null): number {
  try {
    const parsed: unknown = JSON.parse(flyerType || "{}");
    const option =
      typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "opcion") : 0;
    return Number(option) || 0;
  } catch {
    return 0;
  }
}

function addTo(counts: Map<string | number, number>, key: string | number, amount: number) {
  counts.set(key, (counts.get(key) ?? 0) + amount);
}

function byMost(bars: readonly UsageBar[]): UsageBar[] {
  return bars.toSorted((one, other) => other.count - one.count);
}

interface Tally {
  total: number;
  oneByOne: number;
  inBatches: number;
  readonly byOption: Map<string | number, number>;
  readonly byRole: Map<string | number, number>;
  readonly byPerson: Map<string | number, number>;
  readonly byWeek: Map<string | number, number>;
}

function tally(logs: readonly UsageLog[], roleOf: (id: string | null) => string): Tally {
  const counts: Tally = {
    total: 0,
    oneByOne: 0,
    inBatches: 0,
    byOption: new Map(),
    byRole: new Map(),
    byPerson: new Map(),
    byWeek: new Map(),
  };
  for (const log of logs) {
    // A batch is one log with how many came out of it.
    const amount = log.is_bulk ? Number(log.bulk_count) || 0 : 1;
    if (!amount) continue;
    counts.total += amount;
    if (log.is_bulk) counts.inBatches += amount;
    else counts.oneByOne += amount;
    addTo(counts.byOption, optionOf(log.flyer_type), amount);
    addTo(counts.byRole, roleOf(log.user_id), amount);
    addTo(counts.byPerson, log.user_id ?? "", amount);
    addTo(counts.byWeek, mondayOf(log.created_at ?? 0), amount);
  }
  return counts;
}

function flyerBars(byOption: Tally["byOption"], flyers: UsageFlyers): UsageBar[] {
  // In the old app an object with numbers for keys: the flyers go in their order.
  const inOrder = [...byOption].toSorted(([one], [other]) => Number(one) - Number(other));
  return byMost(
    inOrder.map(([key, count]) => {
      const option = Number(key);
      if (!option) return { label: "Sin dato", count };
      if (!flyers.exists(option)) return { label: `Opción ${String(option)} (ya no está)`, count };
      return { label: flyers.label(option), count, color: flyers.color(option) };
    }),
  );
}

function twoDigits(number: number): string {
  return String(number).padStart(2, "0");
}

/** The last twelve weeks of the period at most, each starting on its Monday. */
function weekBars(byWeek: Tally["byWeek"], since: Date, now: Date): UsageBar[] {
  const today = mondayOf(now);
  const bars: UsageBar[] = [];
  for (
    let week = Math.max(mondayOf(since), today - (WEEKS_SHOWN - 1) * WEEK_MS);
    week <= today;
    week += WEEK_MS
  ) {
    const day = new Date(week);
    bars.push({
      label: `Sem. ${twoDigits(day.getDate())}/${twoDigits(day.getMonth() + 1)}`,
      count: byWeek.get(week) ?? 0,
    });
  }
  return bars;
}

export function usageBoard(
  logs: readonly UsageLog[],
  people: readonly UsagePerson[],
  flyers: UsageFlyers,
  since: Date,
  now: Date,
): UsageBoard {
  const byId = new Map(people.map((person) => [person.id, person]));
  const counts = tally(logs, (id) => (id && byId.get(id)?.role) || "?");
  const howMany = counts.byPerson.size;
  return {
    total: counts.total,
    oneByOne: counts.oneByOne,
    inBatches: counts.inBatches,
    people: howMany,
    perPerson: howMany ? (counts.total / howMany).toFixed(1).replace(".", ",") : "0",
    byFlyer: flyerBars(counts.byOption, flyers),
    byRole: byMost(
      [...counts.byRole].map(([role, count]) => ({
        label: ROLE_NAMES[String(role)] ?? String(role),
        count,
      })),
    ),
    byWeek: weekBars(counts.byWeek, since, now),
    top: byMost(
      [...counts.byPerson].map(([id, count]) => {
        const person = byId.get(String(id));
        return { label: person?.full_name || person?.email_asesor || "Usuario", count };
      }),
    ).slice(0, TOP),
  };
}

/** What Estudio did in the period: saved, asked to publish, published. */
export function studioInPeriod(works: readonly StudioWork[], since: Date) {
  const inside = (when: string | null) => Boolean(when) && new Date(when ?? 0) >= since;
  return {
    saved: works.filter((work) => inside(work.created_at)).length,
    asked: works.filter((work) => inside(work.pedido_at)).length,
    published: works.filter((work) => work.estado === "publicado" && inside(work.revisado_at))
      .length,
  };
}

/** The width of a bar, against the longest: never less than 2%. */
export function barWidth(count: number, bars: readonly UsageBar[]): number {
  const longest = Math.max(1, ...bars.map((bar) => bar.count));
  return Math.max(2, Math.round((count / longest) * 100));
}
