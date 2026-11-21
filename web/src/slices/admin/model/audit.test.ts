import { describe, expect, it } from "vitest";
import { auditAction, auditActor, auditDetails } from "./audit.ts";

describe("a line of the audit", () => {
  it("says what was done in words, or the action as it came", () => {
    expect(auditAction({ accion: "approve_user" })).toBe("Aprobó la cuenta de");
    expect(auditAction({ accion: "otra" })).toBe("otra");
    expect(auditAction({ accion: null })).toBe("—");
  });

  it("says who did it, or that it came without a session", () => {
    expect(auditActor({ actor_email: "jefe@b.com" })).toBe("jefe@b.com");
    expect(auditActor({ actor_email: null })).toBe("Visitante (sin sesión)");
  });

  it("tells its details in order, and nothing when there are none", () => {
    expect(
      auditDetails({
        detalle: {
          ip: "1.2.3.4",
          rol: "lider",
          estado: "active",
          estado_anterior: "pending",
          nombre: "Ana",
          parcial: true,
        },
      }),
    ).toBe(
      "IP 1.2.3.4 · rol Líder · estado active · estaba pending · Ana · quedó a medias: se pidió reintentar",
    );
    expect(auditDetails({ detalle: { rol: "nuevo" } })).toBe("rol nuevo");
    expect(auditDetails({ detalle: null })).toBe("");
    expect(auditDetails({ detalle: { ip: 5 } })).toBe("IP 5");
  });
});
