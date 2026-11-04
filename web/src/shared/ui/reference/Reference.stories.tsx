// The same content the reference screenshots of the current app show, for the design-system
// project to compare: see tests/e2e/support/design-system/cases.ts. It is made-up data.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ReactNode, useState } from "react";
import { Avatar } from "../avatar/Avatar.tsx";
import { Badge, type BadgeTone } from "../badge/Badge.tsx";
import { Button } from "../button/Button.tsx";
import { Card } from "../card/Card.ts";
import { Checkbox } from "../checkbox/Checkbox.tsx";
import { DataTable } from "../data-table/DataTable.ts";
import { Input, Select } from "../field/controls.tsx";
import { Field } from "../field/Field.ts";
import { ListRow } from "../list-row/ListRow.ts";
import { Menu } from "../menu/Menu.ts";
import { Modal } from "../modal/Modal.ts";
import { SectionLabel } from "../section-label/SectionLabel.tsx";
import { StatCard } from "../stat-card/StatCard.tsx";
import { Switch } from "../switch/Switch.tsx";
import { Tabs } from "../tabs/Tabs.ts";
import type { TabsVariant } from "../tabs/Tabs.parts.tsx";
import { PalettePicker } from "../theme/PalettePicker.tsx";
import { useTheme } from "../theme/theme-context.ts";

const noop = () => undefined;

const meta = {
  title: "Shared/UI/Reference",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function TabRow({
  variant,
  start,
  children,
}: {
  readonly variant: TabsVariant;
  readonly start: string;
  readonly children: ReactNode;
}) {
  const [value, setValue] = useState(start);
  return (
    <Tabs value={value} onChange={setValue} variant={variant}>
      <Tabs.List label="Solapas">{children}</Tabs.List>
    </Tabs>
  );
}

export const EditorTabs: Story = {
  render: () => (
    <TabRow variant="segmented" start="individual">
      <Tabs.Tab value="individual" icon="pencil">
        Individual
      </Tabs.Tab>
      <Tabs.Tab value="masivo" icon="document">
        Masivo
      </Tabs.Tab>
      <Tabs.Tab value="historial" icon="clock">
        Historial
      </Tabs.Tab>
    </TabRow>
  ),
};

export const PromotionsTabs: Story = {
  render: () => (
    <TabRow variant="segmented" start="activas">
      <Tabs.Tab value="buscar" icon="search">
        Buscar
      </Tabs.Tab>
      <Tabs.Tab value="activas" icon="list">
        Activas
      </Tabs.Tab>
    </TabRow>
  ),
};

export const AdminMainTabs: Story = {
  render: () => (
    <TabRow variant="underline" start="admin">
      <Tabs.Tab value="admin" dot>
        Admin
      </Tabs.Tab>
      <Tabs.Tab value="data">Data</Tabs.Tab>
      <Tabs.Tab value="config">Config</Tabs.Tab>
    </TabRow>
  ),
};

export const AdminSubTabs: Story = {
  render: () => (
    <TabRow variant="pills" start="usuarios">
      <Tabs.Tab value="dashboard">Dashboard</Tabs.Tab>
      <Tabs.Tab value="usuarios">Usuarios</Tabs.Tab>
      <Tabs.Tab value="registros">Registros</Tabs.Tab>
      <Tabs.Tab value="uso">Uso</Tabs.Tab>
      <Tabs.Tab value="facultades">Facultades</Tabs.Tab>
      <Tabs.Tab value="auditoria">Auditoría</Tabs.Tab>
    </TabRow>
  ),
};

export const WindowTabs: Story = {
  render: () => (
    <TabRow variant="pills-window" start="empresas">
      <Tabs.Tab value="empresas">Mis empresas</Tabs.Tab>
      <Tabs.Tab value="asesores">Mis asesores</Tabs.Tab>
      <Tabs.Tab value="propuestas">Cambios pendientes</Tabs.Tab>
    </TabRow>
  ),
};

export const CommercialTabs: Story = {
  render: () => (
    <TabRow variant="line" start="lista">
      <Tabs.Tab value="empresas">Mis empresas</Tabs.Tab>
      <Tabs.Tab value="agenda">Agenda</Tabs.Tab>
      <Tabs.Tab value="lista" count={2}>
        Gestiones
      </Tabs.Tab>
      <Tabs.Tab value="tablero">Tablero</Tabs.Tab>
    </TabRow>
  ),
};

export const OfficerName: Story = {
  render: () => (
    <Field>
      <Field.Label>Nombre</Field.Label>
      <Field.Input placeholder="Nombre Asesor 1" />
    </Field>
  ),
};

export const CompanyCard: Story = {
  render: () => (
    <Card>
      <Card.Title>Empresa</Card.Title>
      <Field>
        <Field.Label>Nombre de la empresa</Field.Label>
        <Field.Input placeholder="Nombre de la empresa" />
      </Field>
    </Card>
  ),
};

export const ShowOfficers: Story = {
  render: () => <Switch checked onChange={noop} label="Mostrar en el flyer" />,
};

export const DownloadPdf: Story = {
  render: () => (
    <Button icon="download" fullWidth>
      Descargar PDF
    </Button>
  ),
};

export const PreviewButton: Story = {
  render: () => (
    <Button variant="blue" icon="eye" fullWidth>
      Vista previa
    </Button>
  ),
};

export const UpdateCatalog: Story = {
  render: () => (
    <Button variant="ghost" icon="restore" fullWidth>
      Actualizar catálogo ahora
    </Button>
  ),
};

export const PanelTitle: Story = {
  render: () => <SectionLabel kind="panel">Flyer Galicia 5.5</SectionLabel>,
};

export const SectionTitle: Story = {
  render: () => <SectionLabel>Usuarios del sistema</SectionLabel>,
};

export const LoginEmail: Story = {
  render: () => <Input controlSize="lg" placeholder="tu@bancogalicia.com.ar" />,
};

export const LoginLabel: Story = {
  render: () => (
    <Field>
      <Field.Label>Email</Field.Label>
    </Field>
  ),
};

export const LoginSubmit: Story = {
  render: () => (
    <Button size="lg" fullWidth>
      Ingresar
    </Button>
  ),
};

export const LoginForgot: Story = {
  render: () => (
    <Button variant="link" size="xs">
      ¿Olvidaste tu contraseña?
    </Button>
  ),
};

export const NewUser: Story = { render: () => <Button size="sm">+ Nuevo usuario</Button> };

export const UserSearch: Story = {
  render: () => <Input elevated placeholder="Buscar por nombre o email..." />,
};

export const UserFilter: Story = {
  render: () => (
    <Select appearance="native" elevated style={{ width: "100%" }}>
      <option>Todos</option>
    </Select>
  ),
};

export const UserRow: Story = {
  render: () => (
    <ListRow>
      <Avatar initials="AP" color="#00695c" />
      <ListRow.Main>
        <ListRow.Title>Asesor Prueba</ListRow.Title>
        <ListRow.Meta>
          asesor.prueba@bancogalicia.com.ar {"\u00A0\u00B7\u00A0"} Últ. acceso: ayer
        </ListRow.Meta>
      </ListRow.Main>
      <ListRow.Aside tight>
        <Badge tone="purple">Asesor</Badge>
        <Badge tone="green">Activo</Badge>
      </ListRow.Aside>
      <ListRow.Aside>
        <Button variant="soft-danger" size="xs">
          Desactivar
        </Button>
        <Button variant="soft-neutral" size="xs">
          Editar
        </Button>
        <Button variant="soft-danger" size="icon" aria-label="Eliminar usuario">
          🗑
        </Button>
      </ListRow.Aside>
    </ListRow>
  ),
};

const badge = (tone: BadgeTone, text: string): Story => ({
  render: () => <Badge tone={tone}>{text}</Badge>,
});

export const BadgeActive: Story = badge("green", "Activo");
export const BadgePending: Story = badge("amber", "Pendiente");
export const BadgeValid: Story = badge("valid", "Vigente");
export const BadgeExpired: Story = badge("expired", "Vencida");
export const ChipValid: Story = {
  render: () => (
    <Badge tone="valid" size="chip">
      Vigente: 751
    </Badge>
  ),
};

export const ButtonDeactivate: Story = {
  render: () => (
    <Button variant="soft-danger" size="xs">
      Desactivar
    </Button>
  ),
};

export const ButtonEdit: Story = {
  render: () => (
    <Button variant="soft-neutral" size="xs">
      Editar
    </Button>
  ),
};

export const StatTotal: Story = { render: () => <StatCard label="Total usuarios" value={5} /> };
export const StatActive: Story = {
  render: () => <StatCard tone="green" label="Activos" value={4} />,
};
export const StatAdmins: Story = { render: () => <StatCard tone="red" label="Admins" value={1} /> };
export const StatFlyers: Story = {
  render: () => <StatCard tone="blue" label="Flyers generados" value={0} />,
};
export const StatPending: Story = {
  render: () => <StatCard tone="yellow" label="Pendientes aprobación" value={1} />,
};

function UserMenuContent() {
  const { dark } = useTheme();
  return (
    <Menu defaultOpen>
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
        <Menu.Item icon={dark ? "sun" : "moon"} onSelect={noop}>
          {dark ? "Modo claro" : "Modo oscuro"}
        </Menu.Item>
        <Menu.Label>Tema</Menu.Label>
        <PalettePicker />
        <Menu.Item icon="database" onSelect={noop}>
          Base de datos
        </Menu.Item>
        <Menu.Item icon="help" onSelect={noop}>
          Ver tutorial
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item icon="logout" danger onSelect={noop}>
          Salir
        </Menu.Item>
      </Menu.List>
    </Menu>
  );
}

export const UserMenu: Story = { render: () => <UserMenuContent /> };

export const DatabaseWindow: Story = {
  render: () => (
    <Modal size="wide" onClose={noop}>
      <Modal.Header icon="database-window">Base de datos</Modal.Header>
      <TabRow variant="pills-window" start="empresas">
        <Tabs.Tab value="empresas">Mis empresas</Tabs.Tab>
        <Tabs.Tab value="asesores">Mis asesores</Tabs.Tab>
        <Tabs.Tab value="propuestas">Cambios pendientes</Tabs.Tab>
      </TabRow>
      <Modal.Body>
        <div style={{ height: 433 }} />
      </Modal.Body>
    </Modal>
  ),
};

export const TableHeader: Story = {
  render: () => (
    <DataTable caption="Promociones">
      <DataTable.Head>
        <tr>
          <DataTable.Header sort="none" onSort={noop}>
            Promoción
          </DataTable.Header>
        </tr>
      </DataTable.Head>
    </DataTable>
  ),
};

export const TableCell: Story = {
  render: () => (
    <DataTable caption="Promociones">
      <DataTable.Body>
        <DataTable.Row>
          <DataTable.Cell>Indumentaria</DataTable.Cell>
        </DataTable.Row>
      </DataTable.Body>
    </DataTable>
  ),
};

export const ProvinceSelect: Story = {
  render: () => (
    <Select>
      <option>Capital Federal</option>
    </Select>
  ),
};

export const HideOnline: Story = {
  render: () => <Checkbox>Ocultar las de compra online</Checkbox>,
};

export const CommercialSearch: Story = {
  render: () => <Input controlSize="sm" placeholder="Buscar empresa, CUIT o persona" />,
};

export const CommercialStateFilter: Story = {
  render: () => (
    <Select appearance="native" controlSize="sm" style={{ width: "100%" }}>
      <option>Todos los estados</option>
    </Select>
  ),
};
