// Opens the inert stories of shared against the simulated cloud. It is here because a spec does not
// know about window or evaluate.
import { readFileSync } from "node:fs";
import { type Browser, type BrowserContext, type Page, type Request } from "@playwright/test";
import { type Cloud, AUTH_STORAGE_KEY, type CloudUser, storedSession } from "../cloud/index.ts";
import { type ContractEntry } from "../cloud/contract.ts";
import { SUPABASE_URL } from "../cloud/users.ts";

export const REPLAY_STORY = "shared-supabase-cloudharness--replay";
export const SESSION_STORY = "shared-session-cloudharness--entry";

const ANON_KEY = "invented-public-key";
const CONTRACT_FILE = new URL("../../../fixtures/network-contract.json", import.meta.url);

export interface ReplayOutcome {
  entry: ContractEntry;
  outcome: "answered" | "no answer" | "cannot be replayed";
}

export function recordedContract(): ContractEntry[] {
  const contract: ContractEntry[] = JSON.parse(readFileSync(CONTRACT_FILE, "utf8"));
  return contract;
}

function canonical(entry: ContractEntry): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(entry).toSorted(([a], [b]) => (a < b ? -1 : 1))),
  );
}

/** Each entry as text in one order, so that a difference reads as the lines that differ. */
export function normalized(entries: readonly ContractEntry[]): string[] {
  return [...new Set(entries.map(canonical))].toSorted();
}

export interface OpenHarness {
  page: Page;
  context: BrowserContext;
  /** The requests to a path of the cloud that this page sent, of a method. */
  requestsTo: (path: string, method: string) => Request[];
  hasStoredSession: () => Promise<boolean>;
  /** Every entry goes through the public API of shared. */
  replay: (entries: readonly ContractEntry[]) => Promise<ReplayOutcome[]>;
}

interface OpenInputs {
  browser: Browser;
  cloud: Cloud;
  storybookUrl: string;
  story: string;
  user: CloudUser;
  /** Routes installed here win over the simulated cloud. */
  beforeOpening?: (page: Page) => Promise<void>;
}

export async function openHarness(inputs: OpenInputs): Promise<OpenHarness> {
  const { browser, cloud, storybookUrl, story, user, beforeOpening } = inputs;
  const context = await browser.newContext();
  await cloud.attach(context, user, { commercialActions: true });
  const page = await context.newPage();
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  await page.addInitScript(
    ([key, session, url, anonKey]) => {
      localStorage.setItem(key, session);
      Object.assign(window, { __FLYER_TEST_CLOUD__: { url, anonKey } });
    },
    [AUTH_STORAGE_KEY, storedSession(user), SUPABASE_URL, ANON_KEY] as const,
  );
  await beforeOpening?.(page);
  await page.goto(`${storybookUrl}iframe.html?id=${story}&viewMode=story`);
  return {
    page,
    context,
    requestsTo: (path, method) =>
      requests.filter(
        (request) => request.method() === method && new URL(request.url()).pathname === path,
      ),
    hasStoredSession: () =>
      page.evaluate((key) => localStorage.getItem(key) !== null, AUTH_STORAGE_KEY),
    replay: async (entries) => {
      await page.getByText("Nube de prueba lista").waitFor();
      return page.evaluate((list) => {
        const replay: (all: unknown) => Promise<ReplayOutcome[]> = Reflect.get(
          window,
          "__FLYER_REPLAY_CONTRACT__",
        );
        return replay(list);
      }, entries);
    },
  };
}
