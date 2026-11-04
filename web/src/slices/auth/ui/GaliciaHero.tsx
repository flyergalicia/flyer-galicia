import { GaliciaLogo } from "@/shared/ui/index.ts";
import styles from "./EntryScreen.module.css";

/** The left half of the entry: it is the same for all of its views. */
export function GaliciaHero() {
  return (
    <div className={styles.hero}>
      <div className={styles.brand}>
        <GaliciaLogo className={styles.brandLogo} />
        <span className={styles.brandWord}>Galicia</span>
      </div>
      <p className={styles.heroTitle}>Tus flyers, listos en un minuto.</p>
      <svg className={styles.heroArt} viewBox="0 0 200 150" aria-hidden="true">
        <rect x="110" y="18" width="82" height="130" rx="6" fill="#fff" opacity=".5" />
        <rect x="70" y="30" width="82" height="130" rx="6" fill="#fff" opacity=".96" />
        <rect className={styles.artAccent} x="80" y="40" width="62" height="22" rx="3" />
        <rect className={styles.artLine} x="80" y="70" width="62" height="5" rx="2" />
        <rect className={styles.artLine} x="80" y="80" width="46" height="5" rx="2" />
        <rect className={styles.artInk} x="80" y="96" width="28" height="14" rx="3" />
        <rect className={styles.artAccent} x="114" y="96" width="28" height="14" rx="3" />
        <rect x="80" y="118" width="62" height="4" rx="2" fill="#F5DCC3" />
        <rect x="80" y="126" width="50" height="4" rx="2" fill="#F5DCC3" />
        <circle className={styles.artInk} cx="52" cy="112" r="22" />
        <path
          d="M40 112l9 9 17-19"
          stroke="#fff"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
