export type PublicEnvironment = {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
};

export type PublicEnvironmentResult =
  | { readonly ok: true; readonly value: PublicEnvironment }
  | { readonly ok: false; readonly missing: readonly string[] };

type EnvironmentSource = Readonly<Record<string, unknown>>;

const URL_KEY = "VITE_SUPABASE_URL";
const ANON_KEY = "VITE_SUPABASE_ANON_KEY";

function readText(source: EnvironmentSource, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

export function readPublicEnvironment(source: EnvironmentSource): PublicEnvironmentResult {
  const supabaseUrl = readText(source, URL_KEY);
  const supabaseAnonKey = readText(source, ANON_KEY);

  if (supabaseUrl && supabaseAnonKey) {
    return { ok: true, value: { supabaseUrl, supabaseAnonKey } };
  }

  const missing = [...(supabaseUrl ? [] : [URL_KEY]), ...(supabaseAnonKey ? [] : [ANON_KEY])];
  return { ok: false, missing };
}
