import { Component, type ReactNode } from "react";
import { Button, Notice } from "@/shared/ui/index.ts";
import styles from "./AppShell.module.css";

interface LoadBoundaryProps {
  readonly message: string;
  readonly onRetry: () => void;
  readonly children: ReactNode;
}

/** The code of a screen comes when it opens, and the network can fail right then. */
export class LoadBoundary extends Component<LoadBoundaryProps, { readonly failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    const { message, onRetry, children } = this.props;
    if (!this.state.failed) return children;
    return (
      <div className={styles.loadFailure}>
        <Notice tone="error">{message}</Notice>
        <Button size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  }
}
