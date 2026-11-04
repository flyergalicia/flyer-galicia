import { type CommercialDb, type PersonKey } from "./cloud/commercial-actions/model.ts";
import { type Cloud } from "./cloud/index.ts";
import { type OpenAppOptions, type OpenedApp } from "./open-app.ts";

type OpenApp = (options?: OpenAppOptions) => Promise<OpenedApp>;

/** Opens the app as one of the team, already on Gestiones. A leader has no flyer to wait for. */
export async function openAsTeamMember(
  openApp: OpenApp,
  person: PersonKey,
  options: OpenAppOptions = {},
): Promise<OpenedApp> {
  const app = await openApp({
    user: person,
    commercialActions: true,
    waitUntilReady: false,
    ...options,
  });
  await app.commercialActions.open();
  return app;
}

/** The tables of commercial actions of this cloud. */
export function commercialTables(cloud: Cloud): CommercialDb {
  if (!cloud.commercialActions) throw new Error("Commercial actions are not seeded in this cloud");
  return cloud.commercialActions;
}
