import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../button/Button.tsx";
import { useShortcutTip } from "./use-shortcut-tip.tsx";

function WithTip() {
  const tip = useShortcutTip("Enter");
  return (
    <div style={{ padding: 60 }}>
      <Button {...tip.target}>Descargar PDF</Button>
      {tip.element}
    </div>
  );
}

const meta = {
  title: "Shared/UI/ShortcutTip",
  component: WithTip,
} satisfies Meta<typeof WithTip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RestingTheMouseOnIt: Story = {};
