// What the other screens ask of Gestiones and what Gestiones asks of them. A screen does not know the
// others: the app puts the host around the shell, and each one takes what is for it when it can.
import { createContext, useContext, useEffect, useRef } from "react";

export interface RegisterableCompany {
  readonly empresa: string;
  readonly cuits?: readonly string[] | null | undefined;
  /** The officer of the company in the database. */
  readonly user_id?: string | null | undefined;
}

/** "Ver su flyer": the company of an action, to find it on the screen that makes flyers. */
export interface FlyerRequest {
  readonly company: string;
  readonly taxIds: string | null;
}

export interface ActionRequest {
  readonly id: string;
  /** It opens on the window that marks it as done. */
  readonly complete: boolean;
}

export type FlyerScreen = "hunter" | "flyer";

export interface CommercialDesk {
  /** "Registrar gestión", with a company chosen. */
  readonly register: (company: RegisterableCompany) => void;
  /** Goes to Gestiones with this action open. */
  readonly openAction: (request: ActionRequest) => void;
  /** Goes to the screen that makes flyers, with this company. */
  readonly showFlyer: (screen: FlyerScreen, request: FlyerRequest) => void;
  readonly takeAction: () => ActionRequest | null;
  readonly takeFlyer: (screen: FlyerScreen) => FlyerRequest | null;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface CommercialDeskOptions {
  readonly goTo: (tabId: string) => void;
  readonly onRegister: (company: RegisterableCompany) => void;
}

export function createCommercialDesk({ goTo, onRegister }: CommercialDeskOptions): CommercialDesk {
  const listeners = new Set<() => void>();
  let action: ActionRequest | null = null;
  let flyer: { readonly screen: FlyerScreen; readonly request: FlyerRequest } | null = null;
  const tell = () => {
    for (const listener of listeners) listener();
  };
  return {
    register: onRegister,
    openAction: (request) => {
      action = request;
      goTo("gestiones");
      tell();
    },
    showFlyer: (screen, request) => {
      flyer = { screen, request };
      goTo(screen);
      tell();
    },
    takeAction: () => {
      const taken = action;
      action = null;
      return taken;
    },
    takeFlyer: (screen) => {
      if (flyer?.screen !== screen) return null;
      const { request } = flyer;
      flyer = null;
      return request;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const CommercialDeskContext = createContext<CommercialDesk | null>(null);

/** Null where nobody put the host: a screen on its own, in a test. */
export function useCommercialDesk(): CommercialDesk | null {
  return useContext(CommercialDeskContext);
}

/** A screen says what it does with what is for it, now and whenever it arrives. */
function useTake<Request>(
  desk: CommercialDesk | null,
  take: (desk: CommercialDesk) => Request | null,
  onRequest: (request: Request) => void,
): void {
  const latest = useRef({ take, onRequest });
  useEffect(() => {
    latest.current = { take, onRequest };
  });
  useEffect(() => {
    if (!desk) return undefined;
    const look = () => {
      const request = latest.current.take(desk);
      if (request) latest.current.onRequest(request);
    };
    look();
    return desk.subscribe(look);
  }, [desk]);
}

export function useActionRequests(onRequest: (request: ActionRequest) => void): void {
  useTake(useCommercialDesk(), (desk) => desk.takeAction(), onRequest);
}

export function useFlyerRequests(
  screen: FlyerScreen,
  onRequest: (request: FlyerRequest) => void,
): void {
  useTake(useCommercialDesk(), (desk) => desk.takeFlyer(screen), onRequest);
}
