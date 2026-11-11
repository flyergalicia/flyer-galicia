type GaliciaLogoProps = {
  readonly className?: string | undefined;
};

/** The mark of the bank. Its colors do not change with the palette. */
export function GaliciaLogo({ className }: GaliciaLogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Galicia"
    >
      <path d="M6 6H48a44 44 0 0 1 0 88H6z" fill="#F26122" />
      <g fill="#fff">
        <circle cx="40" cy="23" r="4.3" />
        <rect x="37.8" y="26.5" width="4.4" height="6.5" rx="1" />
        <rect x="26" y="31.5" width="28" height="5.2" rx="2.6" />
        <polygon points="34.6,37 45.4,37 40,84" />
      </g>
    </svg>
  );
}
