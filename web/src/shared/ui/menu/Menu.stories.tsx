import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../badge/Badge.tsx";
import { Menu } from "./Menu.ts";

const noop = () => undefined;

function Example({ defaultOpen }: { readonly defaultOpen: boolean }) {
  return (
    <div style={{ display: "inline-block", marginLeft: 240 }}>
      <Menu defaultOpen={defaultOpen}>
        <Menu.Trigger label="Menú de Asesor Prueba">Asesor Prueba</Menu.Trigger>
        <Menu.List label="Tu cuenta">
          <Menu.Head name="Asesor Prueba">
            <Badge tone="purple" uppercase>
              Asesor
            </Badge>
          </Menu.Head>
          <Menu.Separator />
          <Menu.Item icon="lock" onSelect={noop}>
            Cambiar mi clave
          </Menu.Item>
          <Menu.Label>Tema</Menu.Label>
          <Menu.Item icon="database" onSelect={noop} keepOpen>
            Base de datos
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item icon="logout" danger onSelect={noop}>
            Salir
          </Menu.Item>
        </Menu.List>
      </Menu>
    </div>
  );
}

const meta = {
  title: "Shared/UI/Menu",
  component: Example,
} satisfies Meta<typeof Example>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = { args: { defaultOpen: false } };
export const Open: Story = { args: { defaultOpen: true } };
