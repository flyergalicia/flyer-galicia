import { clearContractParts, isRecordingContract } from "./contract-store.ts";

export default function globalSetup(): void {
  if (isRecordingContract()) clearContractParts();
}
