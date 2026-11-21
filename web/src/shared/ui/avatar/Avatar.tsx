import styles from "./Avatar.module.css";

type AvatarProps = {
  readonly initials: string;
  /** Each person keeps a color of their own. */
  readonly color: string;
  readonly size?: "md" | "sm";
};

export function Avatar({ initials, color, size = "md" }: AvatarProps) {
  return (
    <div className={`${styles.avatar} ${styles[size]}`} style={{ backgroundColor: color }}>
      {initials}
    </div>
  );
}
