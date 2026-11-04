import { TabsRoot, TabsList, TabsTab, TabsPanel } from "./Tabs.parts.tsx";

export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Tab: TabsTab,
  Panel: TabsPanel,
});
