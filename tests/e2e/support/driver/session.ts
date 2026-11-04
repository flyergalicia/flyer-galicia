export interface OpenSessionOptions {
  /** Value of profiles.role of the signed-in user. */
  role: string;
  /** Flyer option to end up in; by default the one this user lands on. */
  startOption?: number;
  /** False returns right after navigating, while the app is still entering. */
  waitUntilReady: boolean;
}

export interface SessionStatus {
  signedIn: boolean;
  loginScreenVisible: boolean;
  /** The app is still on its way in and is not responding to the flyer yet. */
  stillEntering: boolean;
}

export interface SessionDriver {
  open(options: OpenSessionOptions): Promise<void>;
  status(): Promise<SessionStatus>;
}
