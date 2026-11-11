// What each profile is shown, step by step, as `_tourCapitulos` decides it.
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { planOf } from "../model/plan.ts";
import type { TourProfile } from "../model/profile.ts";
import { tourChapters } from "./chapters.tsx";

const ADVISOR: TourProfile = {
  searchesCompanies: false,
  pastesOfficers: false,
  takesNotes: false,
  savesAdvisors: false,
  searchesPromotions: false,
  severalFlyers: false,
  hasCategoryFlyers: false,
  hasBranches: false,
  keepsWork: false,
  isHunter: false,
  isLeader: false,
  commercialActionsOn: false,
  isAdminNow: false,
  isAdmin: false,
};

const EVERYTHING: TourProfile = {
  ...ADVISOR,
  searchesCompanies: true,
  pastesOfficers: true,
  takesNotes: true,
  savesAdvisors: true,
  searchesPromotions: true,
  severalFlyers: true,
  hasCategoryFlyers: true,
  hasBranches: true,
  keepsWork: true,
  commercialActionsOn: true,
};

const HUNTER: TourProfile = { ...EVERYTHING, isHunter: true };
/** A Leader has no Promociones: only notes, the tutorial and Gestiones. */
const LEADER: TourProfile = { ...EVERYTHING, isLeader: true, searchesPromotions: false };

function stepsOf(profile: TourProfile) {
  return planOf(tourChapters(profile)).steps.map(({ chapter, title }) => `${chapter}: ${title}`);
}

function chaptersOf(profile: TourProfile) {
  return planOf(tourChapters(profile)).chapters.map(({ title }) => title);
}

/** The text of a step, as it reads on the globe. */
async function textOf(profile: TourProfile, title: string) {
  const step = planOf(tourChapters(profile)).steps.find((one) => one.title === title);
  const screen = await render(<p>{step?.text}</p>);
  return screen.container.textContent;
}

describe("an advisor", () => {
  it("with no faculties has the flyer editor, the bulk, the history and their menu", () => {
    expect(chaptersOf(ADVISOR)).toEqual(["Armar un flyer", "Masivo", "Historial", "Tu menú"]);
    expect(stepsOf(ADVISOR)).toEqual([
      "flyer: Empezá por la empresa",
      "flyer: Datos del oficial",
      "flyer: Hasta 4 asesores",
      "flyer: Cashback",
      "flyer: Texto legal",
      "flyer: El botón B: negrita sin asteriscos",
      "flyer: Vista previa",
      "flyer: Verlo en grande",
      "flyer: Descargar",
      "flyer: Restaurar",
      "flyer: «Otros»: compartir y más",
      "masivo: Muchas empresas de una vez",
      "masivo: Subí el Excel y generá",
      "historial: Lo que generaste en esta sesión",
      "menu: Modo oscuro",
      "menu: El color de la app",
      "menu: Cambiar mi clave",
      "menu: Ver tutorial",
    ]);
  });

  it("with every faculty has each step of them, and Gestiones as an officer", () => {
    expect(chaptersOf(EVERYTHING)).toEqual([
      "Armar un flyer",
      "Masivo",
      "Historial",
      "Tu menú",
      "Promociones",
      "Gestiones",
      "Opciones",
      "Flyer Rubros",
    ]);
    const steps = stepsOf(EVERYTHING);
    expect(steps).toEqual(
      expect.arrayContaining([
        "flyer: La lupa: tus empresas",
        "flyer: ⚡ Pegar: sin tipear nada",
        "flyer: Hasta 4 asesores (u 8)",
        "flyer: 📍 Oficiales por sede",
        "masivo: Sin Excel: desde tus empresas",
        "historial: Tus flyers quedan guardados",
        "menu: Base de datos",
        "menu: Bloc de notas",
        "opciones: Varios armadores",
        "rubros: Flyers con beneficio exclusivo",
        "rubros: Nombre y tope del beneficio",
      ]),
    );
    expect(steps.filter((step) => step.startsWith("gestiones"))).toEqual([
      "gestiones: Gestiones comerciales",
      "gestiones: Derivar una acción",
      "gestiones: La agenda",
      "gestiones: Los horarios no se pisan",
      "gestiones: Cada acción por dentro",
      "gestiones: El tablero",
    ]);
  });

  it("without Gestiones on has no chapter of it, nor Promociones without its faculty", () => {
    const steps = stepsOf({ ...EVERYTHING, commercialActionsOn: false, searchesPromotions: false });
    expect(steps.some((step) => step.startsWith("gestiones"))).toBe(false);
    expect(steps.some((step) => step.startsWith("promos"))).toBe(false);
  });

  it("says what each faculty adds, and nothing of what it does not have", async () => {
    expect(await textOf(ADVISOR, "Datos del oficial")).not.toMatch(/Tocando este título/);
    expect(await textOf(EVERYTHING, "Datos del oficial")).toMatch(/Tocando este título/);
    expect(await textOf(ADVISOR, "«Otros»: compartir y más")).toMatch(/imagen \(PNG\)\.$/);
    expect(await textOf(EVERYTHING, "«Otros»: compartir y más")).toMatch(
      /y la barrita de Oficiales por sede\.$/,
    );
    expect(await textOf(ADVISOR, "Empezá por la empresa")).not.toMatch(/te la sugiere/);
    expect(await textOf(EVERYTHING, "Base de datos")).toMatch(/Generar flyers/);
    expect(await textOf({ ...EVERYTHING, searchesCompanies: false }, "Base de datos")).toBe(
      "Acá viven tus empresas (subí un Excel o editalas en línea, para que la lupa las encuentre) y tus asesores guardados (corregí un celular o un mail sin borrar y volver a cargar). Es privado: nadie más lo ve ni lo edita, y viaja con tu cuenta (lo tenés desde cualquier computadora).",
    );
  });

  it("is told that only a leader or the administrator may save over another schedule", async () => {
    expect(await textOf(EVERYTHING, "Los horarios no se pisan")).not.toMatch(/Como /);
    expect(await textOf({ ...EVERYTHING, isAdmin: true }, "Los horarios no se pisan")).toMatch(
      /Como administrador podés guardar igual: te pregunta antes\. Las bases/,
    );
  });
});

describe("the administrator", () => {
  it("does not change their password from the menu", () => {
    const steps = stepsOf({ ...EVERYTHING, isAdminNow: true, isAdmin: true });
    expect(steps).not.toContain("menu: Cambiar mi clave");
    expect(steps).toContain("menu: Ver tutorial");
  });
});

describe("the Hunter", () => {
  it("has no chapter of the flyer editor: their screen, Promociones and Gestiones", () => {
    expect(chaptersOf(HUNTER)).toEqual(["Tu menú", "Buscar flyer", "Promociones", "Gestiones"]);
    expect(stepsOf(HUNTER).filter((step) => /^(hunter|gestiones)/.test(step))).toEqual([
      "hunter: Buscá la empresa",
      "hunter: Elegí la empresa",
      "hunter: Acercá la imagen",
      "hunter: «Otros»: más herramientas",
      "hunter: Descargar PDF",
      "gestiones: Registrá la gestión",
      "gestiones: Gestiones comerciales",
      "gestiones: Mi agenda",
      "gestiones: Los horarios no se pisan",
      "gestiones: Cada acción por dentro",
      "gestiones: El tablero",
    ]);
  });

  it("reads what is theirs in Gestiones", async () => {
    expect(await textOf(HUNTER, "Gestiones comerciales")).toMatch(/^Acá está tu trabajo/);
    expect(await textOf(HUNTER, "Cada acción por dentro")).toMatch(/No puedo ir/);
  });
});

describe("the Leader", () => {
  it("has no chapter of the flyer editor: their menu and Gestiones", () => {
    expect(chaptersOf(LEADER)).toEqual(["Tu menú", "Gestiones"]);
    expect(stepsOf(LEADER).filter((step) => step.startsWith("gestiones"))).toEqual([
      "gestiones: Gestiones comerciales",
      "gestiones: La agenda del equipo",
      "gestiones: Los horarios no se pisan",
      "gestiones: Cada acción por dentro",
      "gestiones: El tablero",
    ]);
  });

  it("reads what is theirs, and that they may save anyway", async () => {
    expect(await textOf(LEADER, "Gestiones comerciales")).toMatch(/^Acá supervisás/);
    expect(await textOf(LEADER, "Los horarios no se pisan")).toMatch(/Como líder podés guardar/);
    expect(await textOf(LEADER, "Cada acción por dentro")).toMatch(/el hunter, nunca\./);
  });
});
