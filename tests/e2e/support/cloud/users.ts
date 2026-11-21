export const SUPABASE_URL = "https://cajyjnxjbobdpltflgnb.supabase.co";
export const AUTH_STORAGE_KEY = "sb-cajyjnxjbobdpltflgnb-auth-token";

export interface CloudUser {
  id: string;
  email: string;
  name: string;
  /** Value of profiles.role: asesor, admin, vip, hunter, lider... */
  role: string;
}

export function baseUsers(): Record<string, CloudUser> {
  return {
    asesor: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "asesor.prueba@bancogalicia.com.ar",
      name: "Asesor Prueba",
      role: "asesor",
    },
    asesor2: {
      id: "00000000-0000-4000-8000-000000000002",
      email: "otra.persona@bancogalicia.com.ar",
      name: "Otra Persona",
      role: "asesor",
    },
    admin: {
      id: "00000000-0000-4000-8000-0000000000aa",
      email: "admin.prueba@bancogalicia.com.ar",
      name: "Admin Prueba",
      role: "admin",
    },
  };
}

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** The value supabase-js keeps in localStorage for a signed-in user. */
export function storedSession(user: CloudUser): string {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 3600;
  const header = base64Url({ alg: "HS256", typ: "JWT" });
  const claims = base64Url({
    sub: user.id,
    role: "authenticated",
    aud: "authenticated",
    exp: expiresAt,
  });
  return JSON.stringify({
    access_token: `${header}.${claims}.c2ln`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: "rt",
    user: {
      id: user.id,
      aud: "authenticated",
      role: "authenticated",
      email: user.email,
      app_metadata: { provider: "email" },
      user_metadata: { full_name: user.name },
    },
  });
}
