import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { env } from "node:process";
import { fileURLToPath } from "node:url";
import { type ContractEntry } from "./contract.ts";

const PARTS_DIR = fileURLToPath(
  new URL("../../../../node_modules/.tmp/flyer-network-contract/", import.meta.url),
);
const CONTRACT_FILE = fileURLToPath(
  new URL("../../../fixtures/network-contract.json", import.meta.url),
);

export function isRecordingContract(): boolean {
  return env.FLYER_RECORD_CONTRACT === "1";
}

export function clearContractParts(): void {
  rmSync(PARTS_DIR, { recursive: true, force: true });
  mkdirSync(PARTS_DIR, { recursive: true });
}

/** A worker can die mid-run, so each test appends what it saw as soon as it ends. */
export function appendContractPart(worker: number, entries: readonly ContractEntry[]): void {
  mkdirSync(PARTS_DIR, { recursive: true });
  const lines = entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
  appendFileSync(`${PARTS_DIR}worker-${String(worker)}.jsonl`, lines);
}

/** Replaces the contract file with what this run saw, sorted so that diffs stay readable. */
export function writeContractFromParts(): number {
  const lines = readdirSync(PARTS_DIR).flatMap((file) =>
    readFileSync(PARTS_DIR + file, "utf8").split("\n"),
  );
  const unique = [...new Set(lines.filter(Boolean))].toSorted();
  const entries = unique.map((line) => JSON.parse(line) as ContractEntry);
  writeFileSync(CONTRACT_FILE, `${JSON.stringify(entries, null, 2)}\n`);
  return entries.length;
}
