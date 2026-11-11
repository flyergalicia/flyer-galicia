import type { Meta, StoryObj } from "@storybook/react-vite";

const COLORS = [
  "--accent",
  "--navy",
  "--paper",
  "--field",
  "--ink",
  "--card",
  "--border",
  "--gray",
];
const SIZES = [
  "--text-label",
  "--text-xs",
  "--text-md",
  "--text-field",
  "--text-xl",
  "--text-stat",
];

function Tokens() {
  return (
    <div style={{ display: "grid", gap: "var(--space-l)" }}>
      {COLORS.map((name) => (
        <div key={name} style={{ display: "flex", alignItems: "center", gap: "var(--space-l)" }}>
          <span
            style={{
              width: 32,
              height: 32,
              border: "1px solid var(--border)",
              borderRadius: "var(--r-s)",
              background: `var(${name})`,
            }}
          />
          <code style={{ fontSize: "var(--text-xs)" }}>{name}</code>
        </div>
      ))}
      {SIZES.map((name) => (
        <p
          key={name}
          style={{
            fontSize: `var(${name})`,
            textTransform: name === "--text-label" ? "uppercase" : "none",
          }}
        >
          {name}
        </p>
      ))}
    </div>
  );
}

const meta = {
  title: "Shared/UI/Tokens",
  component: Tokens,
} satisfies Meta<typeof Tokens>;

export default meta;

export const InTheCurrentLook: StoryObj<typeof meta> = {};
