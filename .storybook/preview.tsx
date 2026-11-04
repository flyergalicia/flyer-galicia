import type { Preview } from "@storybook/react-vite";
import "@/shared/ui/tokens/tokens.css";
import "@/shared/ui/tokens/base.css";
import { type Palette, PALETTES, ThemeProvider } from "@/shared/ui/index.ts";

const preview: Preview = {
  initialGlobals: { palette: "marfil", dark: "false" },
  globalTypes: {
    palette: {
      description: "Paleta",
      toolbar: { title: "Paleta", items: [...PALETTES], dynamicTitle: true },
    },
    dark: {
      description: "Modo oscuro",
      toolbar: {
        title: "Modo oscuro",
        items: [
          { value: "false", title: "Claro" },
          { value: "true", title: "Oscuro" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, { globals }) => {
      const palette =
        PALETTES.find((name) => name === globals.palette) ?? ("marfil" satisfies Palette);
      const dark = globals.dark === "true";
      return (
        <ThemeProvider key={`${palette}-${String(dark)}`} initial={{ dark, palette }}>
          <Story />
        </ThemeProvider>
      );
    },
  ],
};

export default preview;
