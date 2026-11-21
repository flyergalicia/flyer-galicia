import type { CSSProperties } from "react";
import { relativeDate } from "@/shared/domain/relative-date.ts";
import { Button, OptionBadge, SectionLabel } from "@/shared/ui/index.ts";
import {
  optionsOfFile,
  safeHtmlUrl,
  sizeText,
  splitByFlyer,
  type UploadedFlyer,
  type VersionAction,
  versionActions,
} from "../model/flyer-config.ts";
import type { FlyerList } from "../model/use-flyer-list.ts";
import type { OptionNames } from "../model/use-option-names.ts";
import styles from "./FlyerSheet.module.css";

export interface VersionHandlers {
  readonly onDeactivate: (option: number) => void;
  readonly onActivate: (file: UploadedFlyer, option: number) => void;
  /** "Activar en…" and "Otra opción…": which option is asked first. */
  readonly onActivateIn: (file: UploadedFlyer) => void;
  readonly onCalibrate: (file: UploadedFlyer) => void;
  readonly onDelete: (file: UploadedFlyer) => void;
}

interface FlyerVersionsProps extends VersionHandlers {
  readonly list: FlyerList;
  readonly options: readonly number[];
  readonly names: OptionNames;
  /** Where the files of our bucket live: an HTML is linked only if it is there. */
  readonly home: string;
  readonly busy: string | null;
}

function colorStyle(color: string): CSSProperties {
  const style: CSSProperties & { readonly "--option-color": string } = { "--option-color": color };
  return style;
}

function ActiveBanners({
  list,
  options,
  names,
  home,
  busy,
  onDeactivate,
}: Omit<FlyerVersionsProps, "onActivate" | "onActivateIn" | "onCalibrate" | "onDelete">) {
  const { withFlyer, withoutFlyer } = splitByFlyer(options, list.active);
  return (
    <>
      {withFlyer.map((option) => {
        const flyer = list.active.get(option);
        const html = safeHtmlUrl(flyer?.htmlUrl ?? null, home);
        const deactivating = busy === `deactivate:${String(option)}`;
        return (
          <div key={option} className={styles.banner} data-testid="flyer-banner">
            <div className={styles.bannerInfo}>
              <OptionBadge
                option={option}
                label={names.label(option)}
                color={names.color(option)}
                className={styles.bannerBadge}
              />
              <span
                className={`${styles.bannerName} ${styles.optionName}`}
                style={colorStyle(names.color(option))}
              >
                {names.label(option)}
              </span>
              <span className={`${styles.bannerName} ${styles.fileName}`}>{flyer?.name ?? ""}</span>
            </div>
            <div className={styles.bannerButtons}>
              {html && (
                <a
                  href={html}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.viewLink}
                >
                  Ver
                </a>
              )}
              <Button
                variant="soft-danger"
                size="xs"
                disabled={deactivating}
                onClick={() => {
                  onDeactivate(option);
                }}
              >
                {deactivating ? "Desactivando..." : "Desactivar"}
              </Button>
            </div>
          </div>
        );
      })}
      {withoutFlyer.length > 0 && (
        <>
          <p className={styles.withoutText}>
            Sin flyer activo ({withoutFlyer.length}). Siguen en la barra de quienes las tienen
            habilitadas, con el cartel «todavía no tiene flyer». Para que no aparezcan más: Config →
            Opciones → Quitar.
          </p>
          {withoutFlyer.map((option) => (
            <div key={option} className={styles.empty} data-testid="flyer-banner-empty">
              {names.label(option)}: sin flyer activo.
            </div>
          ))}
        </>
      )}
    </>
  );
}

const ACTION_TEXT: Readonly<Record<VersionAction, string>> = {
  activate: "Activar",
  "activate-in": "Activar en…",
  "other-option": "Otra opción…",
  calibrate: "Calibrar",
};

function actionHint(action: VersionAction, home: string): string | undefined {
  if (action === "activate") return `Activar en ${home}`;
  return action === "other-option" ? "Replicar este flyer en otra opción" : undefined;
}

function VersionTitle({
  file,
  active,
  home,
  names,
}: {
  readonly file: UploadedFlyer;
  readonly active: readonly number[];
  readonly home: number;
  readonly names: OptionNames;
}) {
  const isActive = active.length > 0;
  return (
    <strong className={styles.versionTitle}>
      {home ? (
        <>
          {active.map((option) => (
            <OptionBadge
              key={option}
              option={option}
              label={names.label(option)}
              color={names.color(option)}
              className={styles.titleBadge}
            />
          ))}
          {!isActive && (
            <OptionBadge
              option={home}
              label={names.label(home)}
              color={names.color(home)}
              className={`${styles.titleBadge} ${styles.faded}`}
            />
          )}
          <span className={styles.optionName} style={colorStyle(names.color(home))}>
            {names.label(home)}
          </span>
          {active.length > 1 && (
            <span className={styles.others}> + {active.slice(1).map(names.label).join(", ")}</span>
          )}
          {isActive ? (
            <span className={`${styles.tag} ${styles.tagOn}`}>ACTIVO</span>
          ) : (
            <span
              className={`${styles.tag} ${styles.tagOff}`}
              title="Subido para esta opción, pero no es el flyer activo"
            >
              NO ACTIVO
            </span>
          )}
        </>
      ) : (
        <span className={styles.noOption}>Sin opción asignada</span>
      )}
      {file.isImage && <span className={`${styles.tag} ${styles.tagFile}`}>PDF/IMG</span>}
    </strong>
  );
}

function VersionRow({
  file,
  options,
  list,
  names,
  busy,
  onActivate,
  onActivateIn,
  onCalibrate,
  onDelete,
}: Omit<FlyerVersionsProps, "onDeactivate" | "home"> & { readonly file: UploadedFlyer }) {
  const { active, home } = optionsOfFile(file.name, options, list.active);
  const isActive = active.length > 0;
  const meta = [file.name, file.createdAt ? relativeDate(file.createdAt) : "", sizeText(file.size)]
    .filter(Boolean)
    .join(" · ");
  const press: Readonly<Record<VersionAction, () => void>> = {
    activate: () => {
      onActivate(file, home);
    },
    "activate-in": () => {
      onActivateIn(file);
    },
    "other-option": () => {
      onActivateIn(file);
    },
    calibrate: () => {
      onCalibrate(file);
    },
  };
  const activating = busy === `activate:${file.name}`;
  return (
    <div
      className={isActive ? `${styles.version} ${styles.active}` : styles.version}
      data-testid="flyer-version"
    >
      <div className={styles.versionInfo}>
        <VersionTitle file={file} active={active} home={home} names={names} />
        <small className={styles.versionMeta}>{meta}</small>
      </div>
      <div className={styles.versionButtons}>
        {versionActions(file, { active, home }).map((action) => (
          <Button
            key={action}
            variant={action === "activate" || action === "activate-in" ? "soft-ok" : "soft-neutral"}
            size="xs"
            className={action === "other-option" ? styles.otherOption : undefined}
            // Activar goes in the color of its flyer, as today, even under the mouse.
            style={action === "activate" ? { color: names.color(home) } : undefined}
            title={actionHint(action, names.label(home))}
            disabled={action === "activate" && activating}
            onClick={press[action]}
          >
            {action === "activate" && activating ? "..." : ACTION_TEXT[action]}
          </Button>
        ))}
        <Button
          variant="soft-neutral"
          size="xs"
          onClick={() => {
            window.open(file.url, "_blank", "noopener");
          }}
        >
          Ver
        </Button>
        <Button
          variant="soft-danger"
          size="xs"
          disabled={isActive || busy === `delete:${file.name}`}
          title={isActive ? "Desactivá primero" : undefined}
          onClick={() => {
            onDelete(file);
          }}
        >
          Borrar
        </Button>
      </div>
    </div>
  );
}

/** The flyer each option has active, and the versions uploaded, newest first. */
export function FlyerVersions(props: FlyerVersionsProps) {
  const { list } = props;
  return (
    <div className={styles.list} data-testid="flyer-list">
      <ActiveBanners {...props} />
      {list.uploads.length === 0 ? (
        <p className={styles.nothing}>Sin versiones subidas aún.</p>
      ) : (
        <>
          <SectionLabel className={styles.versionsLabel}>Versiones disponibles</SectionLabel>
          {list.uploads.map((file) => (
            <VersionRow key={file.name} {...props} file={file} />
          ))}
        </>
      )}
    </div>
  );
}
