import { fileURLToPath } from "node:url";

export const sourceAlias = {
  "@": fileURLToPath(new URL("../../web/src", import.meta.url)),
};
