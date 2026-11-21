import { describe, expect, it } from "vitest";
import {
  can,
  defaultPermission,
  effectiveRole,
  isAdminNow,
  isHunter,
  isLeader,
  MANAGED_ROLES,
  mergePermissions,
  PERMISSION_KEYS,
  type PermissionSubject,
  savedRolesIn,
} from "./permissions.ts";

function subject(overrides: Partial<PermissionSubject>): PermissionSubject {
  return {
    role: "asesor",
    isAdmin: false,
    ownPermissions: null,
    simulatedRole: null,
    matrix: mergePermissions(null),
    ...overrides,
  };
}

function enabled(role: string): string[] {
  return PERMISSION_KEYS.filter((key) => defaultPermission(role, key));
}

describe("defaultPermission", () => {
  it("is what each profile had before the permissions screen existed", () => {
    expect(enabled("asesor")).toEqual([]);
    expect(enabled("vip")).toEqual(["notas", "asesores_guardados"]);
    expect(enabled("pro")).toEqual(["notas", "asesores_guardados"]);
    expect(enabled("hunter")).toEqual([]);
    expect(enabled("lider")).toEqual(["notas", "gestiones"]);
    expect(enabled("otro")).toEqual([]);
  });

  it("everyone starts with the first flyer, except hunters and leaders", () => {
    for (const role of ["asesor", "vip", "pro"]) {
      expect(defaultPermission(role, "opcion_1")).toBe(true);
      expect(defaultPermission(role, "opcion_2")).toBe(false);
    }
    expect(defaultPermission("hunter", "opcion_1")).toBe(false);
    expect(defaultPermission("lider", "opcion_1")).toBe(false);
  });
});

describe("mergePermissions", () => {
  it("has the five managed profiles, with nothing saved", () => {
    const matrix = mergePermissions(null);

    expect(Object.keys(matrix)).toEqual([...MANAGED_ROLES]);
    expect(matrix.vip?.notas).toBe(true);
    expect(matrix.asesor?.opcion_1).toBe(true);
    expect(matrix.asesor?.opcion_3).toBe(false);
  });

  it("what is saved wins, and what is not saved keeps its default", () => {
    const matrix = mergePermissions({
      asesor: { padron_buscar: true, opcion_1: false },
      vip: { notas: false },
    });

    expect(matrix.asesor?.padron_buscar).toBe(true);
    expect(matrix.asesor?.opcion_1).toBe(false);
    expect(matrix.asesor?.pegar_oficial).toBe(false);
    expect(matrix.vip?.notas).toBe(false);
    expect(matrix.vip?.asesores_guardados).toBe(true);
    expect(matrix.lider?.gestiones).toBe(true);
  });

  it("an option the file names counts, even if it is not one of the first three", () => {
    const matrix = mergePermissions({ asesor: { opcion_9: true }, vip: { opcion_x: true } });

    expect(matrix.asesor?.opcion_9).toBe(true);
    expect(matrix.vip?.opcion_9).toBe(false);
    expect(matrix.asesor).not.toHaveProperty("opcion_x");
  });

  it("the options can be given", () => {
    const matrix = mergePermissions({ asesor: { opcion_9: true } }, [4]);

    expect(matrix.asesor?.opcion_4).toBe(false);
    expect(matrix.asesor).not.toHaveProperty("opcion_9");
    expect(matrix.asesor).not.toHaveProperty("opcion_1");
  });

  it("values that are not true or false count as such, and a broken file as nothing", () => {
    expect(mergePermissions({ asesor: { notas: 1, opcion_1: 0 } }).asesor).toMatchObject({
      notas: true,
      opcion_1: false,
    });
    for (const broken of ["texto", 3, [], { asesor: "x" }, { asesor: [] }]) {
      expect(mergePermissions(broken).asesor?.opcion_1).toBe(true);
    }
  });
});

describe("savedRolesIn", () => {
  it("takes the matrix out of the file, or nothing", () => {
    expect(savedRolesIn({ roles: { asesor: {} }, updated_at: "x" })).toEqual({ asesor: {} });
    expect(savedRolesIn({ updated_at: "x" })).toBeNull();
    expect(savedRolesIn(null)).toBeNull();
    expect(savedRolesIn("x")).toBeNull();
  });
});

describe("can", () => {
  it("a profile has what the matrix says", () => {
    const matrix = mergePermissions({ asesor: { padron_buscar: true } });

    expect(can(subject({ matrix }), "padron_buscar")).toBe(true);
    expect(can(subject({ matrix }), "notas")).toBe(false);
  });

  it("until the file arrives nobody has anything", () => {
    expect(can(subject({ matrix: null }), "opcion_1")).toBe(false);
  });

  it("a profile that is not managed has nothing, not even the first flyer", () => {
    expect(can(subject({ role: "prospect" }), "opcion_1")).toBe(false);
  });

  it("the hunter lock turns off whatever is not on its list, even if saved as on", () => {
    const matrix = mergePermissions({
      hunter: {
        padron_buscar: true,
        estudio: true,
        benchmark: true,
        guardar_trabajo: true,
        notas: true,
        promos_buscar: true,
        gestiones: true,
        proponer_oficiales: true,
        tutorial_auto: true,
        asesores_guardados: true,
        opcion_5: true,
      },
    });
    const hunter = subject({ role: "hunter", matrix });

    for (const key of ["padron_buscar", "estudio", "benchmark", "guardar_trabajo"] as const) {
      expect([key, can(hunter, key)]).toEqual([key, false]);
    }
    for (const key of [
      "notas",
      "promos_buscar",
      "gestiones",
      "proponer_oficiales",
      "tutorial_auto",
      "asesores_guardados",
      "opcion_5",
    ] as const) {
      expect([key, can(hunter, key)]).toEqual([key, true]);
    }
    expect(can(hunter, "opcion_2")).toBe(false);
  });

  it("the leader lock leaves only its list, and no flyer at all", () => {
    const matrix = mergePermissions({
      lider: { notas: true, tutorial_auto: true, gestiones: true, estudio: true, opcion_1: true },
    });
    const leader = subject({ role: "lider", matrix });

    expect(can(leader, "notas")).toBe(true);
    expect(can(leader, "tutorial_auto")).toBe(true);
    expect(can(leader, "gestiones")).toBe(true);
    expect(can(leader, "estudio")).toBe(false);
    expect(can(leader, "opcion_1")).toBe(false);
  });

  it("an administrator has all but what they turned off for themselves", () => {
    const admin = subject({ role: "admin", isAdmin: true, matrix: null });
    const own = (ownPermissions: unknown): PermissionSubject => ({ ...admin, ownPermissions });

    expect(can(admin, "benchmark")).toBe(true);
    expect(can(own({ benchmark: false, notas: true }), "benchmark")).toBe(false);
    expect(can(own({ benchmark: false, notas: true }), "notas")).toBe(true);
    expect(can(own({ notas: null }), "notas")).toBe(true);
    expect(can(own({}), "notas")).toBe(true);
    expect(can(own([]), "notas")).toBe(true);
    expect(can(own("x"), "notas")).toBe(true);
  });

  it("an administrator simulating a profile sees exactly what it sees, without the bypass", () => {
    const matrix = mergePermissions({ asesor: { estudio: true } });
    const asAsesor = subject({ role: "admin", isAdmin: true, simulatedRole: "asesor", matrix });

    expect(can(asAsesor, "estudio")).toBe(true);
    expect(can(asAsesor, "benchmark")).toBe(false);
  });

  it("the locks hold for an administrator simulating a hunter or a leader", () => {
    const matrix = mergePermissions({
      hunter: { estudio: true },
      lider: { estudio: true, opcion_1: true },
    });
    const asHunter = subject({ role: "admin", isAdmin: true, simulatedRole: "hunter", matrix });
    const asLeader = subject({ role: "admin", isAdmin: true, simulatedRole: "lider", matrix });

    expect(can(asHunter, "estudio")).toBe(false);
    expect(can(asLeader, "estudio")).toBe(false);
    expect(can(asLeader, "opcion_1")).toBe(false);
  });

  it("simulating before the file arrives gives nothing", () => {
    const asAsesor = subject({
      role: "admin",
      isAdmin: true,
      simulatedRole: "asesor",
      matrix: null,
    });

    expect(can(asAsesor, "opcion_1")).toBe(false);
  });
});

describe("who is who", () => {
  it("the simulated profile is the one in force", () => {
    const admin = subject({ role: "admin", isAdmin: true });
    const simulating = { ...admin, simulatedRole: "hunter" };

    expect(effectiveRole(admin)).toBe("admin");
    expect(effectiveRole(simulating)).toBe("hunter");
    expect(isHunter(simulating)).toBe(true);
    expect(isHunter(admin)).toBe(false);
    expect(isLeader({ ...admin, simulatedRole: "lider" })).toBe(true);
    expect(isLeader(admin)).toBe(false);
  });

  it("an administrator stops being one during the preview", () => {
    const admin = subject({ role: "admin", isAdmin: true });

    expect(isAdminNow(admin)).toBe(true);
    expect(isAdminNow({ ...admin, simulatedRole: "asesor" })).toBe(false);
    expect(isAdminNow(subject({}))).toBe(false);
  });
});
