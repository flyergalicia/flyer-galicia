import { isRecordingContract, writeContractFromParts } from "./contract-store.ts";

export default function globalTeardown(): void {
  if (!isRecordingContract()) return;
  const count = writeContractFromParts();
  console.log(`Network contract: ${String(count)} entries in tests/fixtures/network-contract.json`);
}
