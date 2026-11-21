import { initialsOf } from "@/shared/domain/initials.ts";
import { relativeDate } from "@/shared/domain/relative-date.ts";
import { Avatar, Badge, OptionBadge } from "@/shared/ui/index.ts";
import {
  advisorLine,
  authorOf,
  capText,
  detailText,
  flyerDetails,
  type FlyerLog,
  optionOfDetails,
} from "../model/flyer-logs.ts";
import { avatarColor, type PeopleNames } from "../model/people.ts";
import styles from "./Panel.module.css";

export interface OptionLook {
  readonly label: (option: number) => string;
  readonly color: (option: number) => string;
}

function Chips({ log }: { readonly log: FlyerLog }) {
  const details = flyerDetails(log.flyer_type);
  const config = detailText(details.config);
  const cap = capText(details);
  const benefit = detailText(details.beneficio);
  const showsBenefit = benefit && benefit !== (log.empresa ?? "");
  if (!config && !cap && !showsBenefit) return null;
  return (
    <div className={styles.chips}>
      {config && <span className={`${styles.chip} ${styles.chipConfig}`}>{config}</span>}
      {cap && (
        <span
          className={`${styles.chip} ${styles.chipCap}`}
          title="Tope de reintegro del beneficio exclusivo"
        >
          {cap}
        </span>
      )}
      {showsBenefit && (
        <span
          className={`${styles.chip} ${styles.chipCap}`}
          title="Nombre en el cartel del beneficio"
        >
          {benefit}
        </span>
      )}
    </div>
  );
}

/** A flyer that came out, in Registros: everything in it was written by a user and goes as text. */
export function FlyerLogRow({
  log,
  names,
  options,
}: {
  readonly log: FlyerLog;
  readonly names: PeopleNames;
  readonly options: OptionLook;
}) {
  const name = authorOf(log, names);
  const details = flyerDetails(log.flyer_type);
  const option = optionOfDetails(details);
  // An advisor with no name is not shown, even with a phone or a mail.
  const advisor = detailText(details.nombre) ? advisorLine(details) : "";
  return (
    <div className={styles.logRow} data-testid="log-row">
      <Avatar initials={initialsOf(name)} color={avatarColor(log.user_id || "x")} size="sm" />
      <div className={styles.logInfo}>
        <div className={styles.logTop}>
          <span className={styles.logTitle}>{log.empresa || "—"}</span>
          {log.format && <Badge tone="purple">{log.format.toUpperCase()}</Badge>}
          {option > 0 && (
            <OptionBadge
              option={option}
              label={options.label(option)}
              color={options.color(option)}
              className={styles.optionBadge}
            />
          )}
          {Boolean(details.masivo) && (
            <span className={styles.batch}>{details.padron ? "EMPRESAS" : "MASIVO"}</span>
          )}
        </div>
        <Chips log={log} />
        {advisor && (
          <div className={styles.advisor}>
            <b>Asesor:</b> {advisor}
          </div>
        )}
        <div className={styles.logLine}>
          <span className={styles.logLabel}>Generado por</span> {name}
        </div>
      </div>
      <span className={styles.date}>{relativeDate(log.created_at)}</span>
    </div>
  );
}
