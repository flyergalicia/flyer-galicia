import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "./Card.ts";

const meta = {
  title: "Shared/UI/Card",
  component: Card,
  args: { children: null },
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithTitle: Story = {
  render: () => (
    <Card>
      <Card.Title>Empresa</Card.Title>
      Lo que va adentro.
    </Card>
  ),
};

export const WithSubtitles: Story = {
  render: () => (
    <Card>
      <Card.Title>Oficiales</Card.Title>
      <Card.Subtitle>Asesor 1</Card.Subtitle>
      Datos del primero.
      <Card.Subtitle>Asesor 2</Card.Subtitle>
      Datos del segundo.
    </Card>
  ),
};
