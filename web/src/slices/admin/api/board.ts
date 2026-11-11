// The numbers of the dashboard and of Uso, and the people an administrator can look at.
import type { Backend } from "@/shared/supabase/index.ts";
import type { StudioWork, UsageLog, UsagePerson } from "../model/usage.ts";
import { messageOf } from "./read-error.ts";

export const DASHBOARD_QUERY_KEY = ["admin", "dashboard"] as const;

export interface DashboardPerson {
  readonly id: string;
  readonly role: string | null;
  readonly status: string | null;
  readonly full_name: string | null;
  readonly email_asesor: string | null;
  readonly last_login: string | null;
}

export interface DashboardData {
  readonly people: readonly DashboardPerson[];
  readonly flyers: number;
}

/** The users and how many flyers came out, at once. */
export async function readDashboard(db: Backend["db"]): Promise<DashboardData> {
  const [people, flyers] = await Promise.all([
    db
      .from("profiles")
      .select("id,role,status,full_name,email_asesor,last_login")
      .order("last_login", { ascending: false }),
    db.from("flyer_logs").select("id", { count: "exact", head: true }).not("user_id", "is", null),
  ]);
  if (people.error) throw new Error(messageOf(people.error));
  // A count that did not arrive is not zero flyers.
  if (flyers.error || flyers.count === null) throw new Error(messageOf(flyers.error));
  return { people: people.data, flyers: flyers.count };
}

export interface UsageData {
  readonly logs: readonly UsageLog[];
  readonly people: readonly UsagePerson[];
  readonly studio: readonly StudioWork[];
}

/**
 * The logs of the period by pages, the profiles, and what Estudio saved: a copy shared by the
 * administrator (`compartido_por` with a name) is not counted.
 */
export async function readUsage(
  { db, fetchAllRows }: Pick<Backend, "db" | "fetchAllRows">,
  since: Date,
): Promise<UsageData> {
  const from = since.toISOString();
  const [logs, people, studio] = await Promise.all([
    fetchAllRows((start, end) =>
      db
        .from("flyer_logs")
        .select("user_id,is_bulk,bulk_count,flyer_type,created_at")
        .not("user_id", "is", null)
        .gte("created_at", from)
        .order("created_at", { ascending: true })
        .range(start, end),
    ),
    db.from("profiles").select("id,full_name,email_asesor,role"),
    db
      .from("flyer_disenos")
      .select("estado,created_at,pedido_at,revisado_at")
      .eq("tipo", "diseno")
      .eq("compartido_por", "")
      .gte("updated_at", from),
  ]);
  if (!logs.ok) throw new Error(messageOf(logs.error.cause));
  // Without the profiles or Estudio the board would say zero where it does not know.
  if (people.error) throw new Error(messageOf(people.error));
  if (studio.error) throw new Error(messageOf(studio.error));
  return { logs: logs.value, people: people.data, studio: studio.data };
}

export interface OtherPerson {
  readonly id: string;
  readonly full_name: string | null;
  readonly email_asesor: string | null;
  readonly role: string | null;
}

/** Everybody but the administrators: their companies are private even among them. */
export async function readOtherPeople(db: Backend["db"]): Promise<readonly OtherPerson[]> {
  const { data, error } = await db
    .from("profiles")
    .select("id,full_name,email_asesor,role")
    .neq("role", "admin")
    .order("full_name", { ascending: true });
  if (error) throw new Error(messageOf(error));
  return data;
}
