// What a person reads about something that failed.
import { failureText } from "@/slices/logo-editor/index.ts";
import { StudioError } from "../api/designs.ts";
import { DesignImageError } from "./design-image.ts";

export function studioFailure(cause: unknown): string {
  if (cause instanceof DesignImageError) return cause.message;
  return failureText(cause instanceof StudioError ? cause.cause : cause);
}
