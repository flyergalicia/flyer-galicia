import type { Meta, StoryObj } from "@storybook/react-vite";
import { GaliciaLogo } from "./GaliciaLogo.tsx";

function Example() {
  return (
    <div style={{ width: 42, height: 42 }}>
      <GaliciaLogo />
    </div>
  );
}

const meta = {
  title: "Shared/UI/GaliciaLogo",
  component: Example,
} satisfies Meta<typeof Example>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
