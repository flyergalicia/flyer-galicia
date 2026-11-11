// Commercial actions demo to try by hand, without touching the platform: it opens real windows of
// the app the root holds (`npm run release` first) with the simulated cloud and made-up data. What
// one person does, the other sees when the app reads it again.
//   npm run demo:commercial-actions                     officer, hunter and leader
//   npm run demo:commercial-actions -- oficial hunter2  only those people
//   npm run demo:commercial-actions -- --check          no windows: opens everything and closes
// To finish: close the windows or press Ctrl+C in the console.
import process, { argv, env, exit } from "node:process";
import { chromium, type Browser } from "@playwright/test";
import { createCloud } from "../tests/e2e/support/cloud/index.ts";
import { launchApp, type LaunchedApp } from "../tests/e2e/support/open-app.ts";
import { startStaticServer, type StaticServer } from "./static-server.ts";

const PEOPLE: Readonly<Record<string, string>> = {
  oficial: "officer",
  oficial2: "officer2",
  hunter: "hunter",
  hunter2: "hunter2",
  hunter3: "hunter3",
  lider: "leader",
  admin: "admin",
};
const DEFAULT_PEOPLE = ["oficial", "hunter", "lider"];
const CHECK_FLAG = "--check";
const WINDOW_ARGS = ["--window-size=1300,860"];
const VIEWPORT = { width: 1280, height: 780 };
const WHAT_TO_TRY = [
  "",
  "Qué probar:",
  "  OFICIAL (Mariana Costa):",
  '   · Gestiones: el CUIT al lado de cada empresa; "1 mensaje nuevo" en ALIMENTOS DEL SUR (Sofía preguntó algo).',
  '   · Mis empresas → Derivar: tipo "Base de datos" (pegá una lista de Excel), o "Que la asigne el líder".',
  "   · Derivá algo a Sofía HOY de 16 a 18: no deja (ya tiene algo de 15 a 17) y te muestra quién está libre.",
  "  HUNTER (Sofía Paz):",
  '   · Mi agenda: "Para contactar" y lo de la semana.',
  '   · Abrí ALIMENTOS DEL SUR: respondé en la conversación o tocá "No puedo ir".',
  "   · TEXTIL ARGENTA: pasá a alguien a Alta (pregunta con o sin paquete) o a Descartado (pregunta el motivo).",
  "  LÍDER (Laura Méndez):",
  '   · Agenda del equipo: bandejas "Por asignar" y "Piden que se la pasen a otro"; tocá Asignar / Cambiar hunter.',
  "",
  "Los avisos entre ventanas llegan solos cada 90 segundos (o cambiando de solapa).",
  "Para terminar: cerrá las ventanas o Ctrl+C acá.",
].join("\n");

function chosenPeople(args: readonly string[]): string[] {
  const named = args.filter((arg) => arg !== CHECK_FLAG);
  const people = named.length > 0 ? named : DEFAULT_PEOPLE;
  const unknown = people.filter((person) => PEOPLE[person] === undefined);
  if (unknown.length > 0) {
    console.error(
      `No conozco a: ${unknown.join(", ")}. Personas: ${Object.keys(PEOPLE).join(", ")}`,
    );
    exit(1);
  }
  return people;
}

async function openWindows(
  browser: Browser,
  url: string,
  people: string[],
): Promise<LaunchedApp[]> {
  const cloud = createCloud();
  cloud.seedCommercialActions();
  const windows: LaunchedApp[] = [];
  for (const person of people) {
    // oxlint-disable-next-line no-await-in-loop -- one window after the other, as they were asked
    const opened = await launchApp({
      browser,
      cloud,
      baseURL: url,
      // Today's real date: the demo does not need the fixed moment of the tests.
      clockOffset: 0,
      options: {
        user: PEOPLE[person] ?? person,
        commercialActions: true,
        waitUntilReady: false,
        viewport: VIEWPORT,
      },
    });
    // oxlint-disable-next-line no-await-in-loop -- the same
    await opened.app.commercialActions.open();
    // oxlint-disable-next-line no-await-in-loop -- the same
    await opened.app.commercialActions.prepareForDemo(`Demo · ${person} · Gestiones`);
    windows.push(opened);
  }
  return windows;
}

async function check(windows: readonly LaunchedApp[]): Promise<number> {
  const onScreen = await Promise.all(
    windows.map(async ({ app }) => (await app.session.modes()).commercialActionsTab !== null),
  );
  const errors = windows.flatMap(({ app }) => app.pageErrors());
  for (const error of errors) console.error(`Error en la página: ${error}`);
  const open = onScreen.filter(Boolean).length;
  console.log(
    `\nCHEQUEO: ${String(open)} de ${String(windows.length)} ventanas abiertas en Gestiones, ` +
      `errores: ${String(errors.length)}`,
  );
  return errors.length === 0 && open === windows.length ? 0 : 1;
}

function waitForWindowsToClose(windows: readonly LaunchedApp[], browser: Browser): Promise<void> {
  return new Promise((resolve) => {
    let open = windows.length;
    for (const { app } of windows) {
      app.page.on("close", () => {
        open -= 1;
        if (open <= 0) resolve();
      });
    }
    browser.on("disconnected", () => {
      resolve();
    });
  });
}

async function run(server: StaticServer, people: string[], isCheck: boolean): Promise<number> {
  const browser = await chromium.launch({ headless: isCheck, args: WINDOW_ARGS });
  try {
    console.log(
      `\nDemo de Gestiones (datos inventados, nada sale a la plataforma). Abriendo: ${people.join(", ")}…`,
    );
    const windows = await openWindows(browser, server.url, people);
    console.log(WHAT_TO_TRY);
    if (isCheck) return await check(windows);
    await waitForWindowsToClose(windows, browser);
    return 0;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  const isCheck = args.includes(CHECK_FLAG) || Boolean(env.DEMO_CHEQUEO);
  const people = chosenPeople(args);
  const server = await startStaticServer();
  process.on("SIGINT", () => {
    server.stop();
    exit(0);
  });
  let exitCode = 1;
  try {
    exitCode = await run(server, people, isCheck);
  } catch (error) {
    console.error(
      `No se pudo abrir la demo: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    server.stop();
  }
  exit(exitCode);
}

await main();
