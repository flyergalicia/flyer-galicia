import { type BrowserContext } from "@playwright/test";
import { seedCommercialActions } from "./commercial-actions/seed.ts";
import { enableCommercialActions } from "./commercial-actions/model.ts";
import { type ContractEntry } from "./contract.ts";
import { attachCloud } from "./router.ts";
import {
  addFlyerOption,
  type CloudState,
  createCloudState,
  type NetworkFault,
  type NewFlyerOption,
  setPermissions,
} from "./state.ts";
import { type CloudUser } from "./users.ts";

export { bucketUrl, fixtureFile, localitiesOf, type PromotionRow } from "./seed-data.ts";
export { AUTH_STORAGE_KEY, type CloudUser, storedSession } from "./users.ts";
export type { DesignRow, Row } from "./state.ts";

export interface DroppedFile {
  restore(): void;
}

export interface Cloud extends CloudState {
  addFlyerOption(option: NewFlyerOption): void;
  setPermissions(role: string, permissions: Record<string, boolean>): void;
  /** The file stops arriving, as when the connection drops, until restore(). */
  dropBucketFile(file: string): DroppedFile;
  /** Adds the people and tables of commercial actions; see commercial-actions/. */
  enableCommercialActions(): void;
  /** Fills commercial actions with the example data people and tests share. */
  seedCommercialActions(): ReturnType<typeof seedCommercialActions>;
  /** Browser contexts that open the app talk to this cloud as the given user. */
  attach(
    context: BrowserContext,
    user: CloudUser,
    options: { commercialActions: boolean },
  ): Promise<void>;
  /** Every distinct request this cloud served, without any value. */
  contractEntries(): ContractEntry[];
}

export function createCloud(): Cloud {
  const state = createCloudState();
  const contract = new Map<string, ContractEntry>();
  const controls = {
    addFlyerOption: (option: NewFlyerOption) => {
      addFlyerOption(state, option);
    },
    setPermissions: (role: string, permissions: Record<string, boolean>) => {
      setPermissions(state, role, permissions);
    },
    dropBucketFile: (file: string): DroppedFile => {
      const fault: NetworkFault = { bucketFile: file };
      state.faults.add(fault);
      return {
        restore: () => {
          state.faults.delete(fault);
        },
      };
    },
    enableCommercialActions: () => {
      enableCommercialActions(state);
    },
    seedCommercialActions: () => seedCommercialActions(state),
    attach: (
      context: BrowserContext,
      user: CloudUser,
      { commercialActions }: { commercialActions: boolean },
    ) =>
      attachCloud(context, {
        state,
        user,
        commercialActions,
        onContract: (entry) => contract.set(JSON.stringify(entry), entry),
      }),
    contractEntries: () => [...contract.values()],
  };
  return Object.assign(state, controls);
}
