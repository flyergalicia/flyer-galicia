import type { StorybookConfig } from "@storybook/react-vite";

const PRODUCTION_ONLY_PLUGIN = /^flyer:/;

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../web/src/**/*.stories.tsx"],
  typescript: { reactDocgen: "react-docgen" },
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: (viteConfig.plugins ?? []).flat().filter((plugin) => {
      const name = plugin && "name" in plugin ? plugin.name : "";
      return !PRODUCTION_ONLY_PLUGIN.test(name);
    }),
  }),
};

export default config;
