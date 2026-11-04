import { Component, type ReactNode } from "react";

interface ShowsErrorState {
  readonly message: string | null;
}

/** Test support: shows what the tree under it threw, so that a test can read it. */
export class ShowsError extends Component<{ readonly children: ReactNode }, ShowsErrorState> {
  override state: ShowsErrorState = { message: null };

  static getDerivedStateFromError(error: unknown): ShowsErrorState {
    return { message: String(error) };
  }

  override render(): ReactNode {
    return this.state.message ?? this.props.children;
  }
}
